"""Ingest one document version: parse -> chunk -> embed -> index -> make current.

Every step is idempotent: a retried job deletes the version's chunks before inserting,
so a worker that dies halfway never leaves duplicate chunks behind.
"""

import asyncio
import logging
import uuid

from sqlalchemy import delete, select, update

from app import storage
from app.db import tenant_session
from app.ingestion.chunker import chunk_blocks
from app.ingestion.embedder import get_embedder
from app.ingestion.parsers import ParseError, parse_file
from app.models import Chunk, Document, DocumentVersion, VersionStatus
from app.routers.documents import auto_title

log = logging.getLogger(__name__)
INSERT_BATCH = 200


async def _set_status(tenant_id: uuid.UUID, version_id: uuid.UUID, status: VersionStatus, **extra):
    async with tenant_session(tenant_id) as session:
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.id == version_id)
            .values(status=status, **extra)
        )


async def ingest_version(tenant_id: uuid.UUID, version_id: uuid.UUID) -> int:
    async with tenant_session(tenant_id) as session:
        version = await session.get(DocumentVersion, version_id)
        if not version:
            log.warning("version %s not found (deleted?)", version_id)
            return 0
        title = await session.scalar(
            select(Document.title).where(Document.id == version.document_id)
        )
        path, mime = storage.path_for(version.storage_path), version.mime
        document_id, filename = version.document_id, version.filename

    try:
        await _set_status(tenant_id, version_id, VersionStatus.parsing, error=None)
        parsed = await asyncio.to_thread(parse_file, path, mime)

        embedder = await asyncio.to_thread(get_embedder)
        drafts = chunk_blocks(parsed.blocks, embedder.count_tokens)
        if not drafts:
            raise ParseError("no_text")

        await _set_status(tenant_id, version_id, VersionStatus.embedding, pages=parsed.pages)
        if parsed.title and title == auto_title(filename):
            title = parsed.title.strip()[:300]
            async with tenant_session(tenant_id) as session:
                await session.execute(
                    update(Document).where(Document.id == document_id).values(title=title)
                )
        vectors = await asyncio.to_thread(
            embedder.embed, [d.embedding_text(title or "") for d in drafts]
        )
    except ParseError as exc:
        await _set_status(tenant_id, version_id, VersionStatus.failed, error=str(exc))
        return 0
    except Exception:
        log.exception("ingestion failed for %s", version_id)
        await _set_status(
            tenant_id,
            version_id,
            VersionStatus.failed,
            error="internal_error",
        )
        raise

    async with tenant_session(tenant_id) as session:
        await session.execute(delete(Chunk).where(Chunk.document_version_id == version_id))
        rows = [
            Chunk(
                tenant_id=tenant_id,
                document_version_id=version_id,
                ordinal=d.ordinal,
                kind=d.kind,
                content=d.content,
                heading_path=d.heading_path,
                page_start=d.page_start,
                page_end=d.page_end,
                token_count=d.token_count,
                embedding=v,
            )
            for d, v in zip(drafts, vectors, strict=True)
        ]
        for i in range(0, len(rows), INSERT_BATCH):
            session.add_all(rows[i : i + INSERT_BATCH])
            await session.flush()

        # Swap the current version in the same transaction as the chunk insert, so
        # retrieval always sees exactly one complete version of the document.
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.document_id == document_id, DocumentVersion.id != version_id)
            .values(is_current=False)
        )
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.id == version_id)
            .values(status=VersionStatus.ready, is_current=True, chunk_count=len(rows))
        )
    log.info("ingested %s: %d chunks", version_id, len(rows))
    return len(rows)
