import hashlib
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app import audit, storage
from app.acl import can_read_document, readable_document_ids, reader_for
from app.audit import client_ip
from app.config import get_settings
from app.deps import DB, Admin, CurrentUser, User
from app.models import IN_PROGRESS_STATUSES as IN_PROGRESS
from app.models import Chunk, Collection, Document, DocumentVersion, VersionStatus
from app.queue import enqueue_ingest

router = APIRouter(tags=["documents"])


def auto_title(filename: str) -> str:
    """Placeholder title from the filename; the worker swaps in the file's own title."""
    return re.sub(r"[-_]+", " ", Path(filename).stem).strip().capitalize() or "Dokumen"


ALLOWED = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".txt": "text/plain",
}


class VersionOut(BaseModel):
    id: uuid.UUID
    version: int
    filename: str
    size_bytes: int
    pages: int | None
    chunk_count: int
    status: VersionStatus
    error: str | None
    is_current: bool
    created_at: datetime
    updated_at: datetime


class DocumentOut(BaseModel):
    id: uuid.UUID
    collection_id: uuid.UUID
    title: str
    created_at: datetime
    current: VersionOut | None
    latest: VersionOut | None
    versions: list[VersionOut] = []


class ChunkOut(BaseModel):
    id: int
    ordinal: int
    kind: str
    content: str
    heading_path: str
    page_start: int
    page_end: int
    token_count: int


def _out(doc: Document, with_versions: bool = False) -> DocumentOut:
    versions = [VersionOut.model_validate(v, from_attributes=True) for v in doc.versions]
    return DocumentOut(
        id=doc.id,
        collection_id=doc.collection_id,
        title=doc.title,
        created_at=doc.created_at,
        current=next((v for v in versions if v.is_current), None),
        latest=versions[-1] if versions else None,
        versions=versions if with_versions else [],
    )


async def _get_document(
    session, document_id: uuid.UUID, user: CurrentUser | None = None
) -> Document:
    """Load a document; for non-admin `user`, 404 unless they may read it."""
    if (
        user
        and not user.can_manage_knowledge
        and not await can_read_document(session, await reader_for(session, user), document_id)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokumen tidak ditemukan")
    doc = await session.scalar(
        select(Document)
        .where(Document.id == document_id, Document.deleted_at.is_(None))
        .options(selectinload(Document.versions))
        # Sessions keep objects across commits; reload so new versions show up.
        .execution_options(populate_existing=True)
    )
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokumen tidak ditemukan")
    return doc


@router.get("/collections/{collection_id}/documents", response_model=list[DocumentOut])
async def list_documents(collection_id: uuid.UUID, user: User, session: DB) -> list[DocumentOut]:
    query = select(Document).where(
        Document.collection_id == collection_id, Document.deleted_at.is_(None)
    )
    if not user.can_manage_knowledge:
        readable = await readable_document_ids(session, await reader_for(session, user))
        query = query.where(Document.id.in_(readable))
    docs = await session.scalars(
        query.options(selectinload(Document.versions)).order_by(Document.created_at.desc())
    )
    return [_out(d) for d in docs]


async def _read_upload(file: UploadFile) -> tuple[str, str, bytes, str]:
    """Validate an upload; returns (filename, mime, data, sha256)."""
    filename = file.filename or "dokumen"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Format didukung: PDF, DOCX, Markdown, TXT"
        )
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"Maksimal {get_settings().max_upload_mb} MB"
        )
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "File kosong")
    return filename, ALLOWED[suffix], data, hashlib.sha256(data).hexdigest()


async def _reject_duplicate(session, sha256: str) -> None:
    duplicate = await session.scalar(
        select(Document.title)
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .where(
            DocumentVersion.sha256 == sha256,
            DocumentVersion.status != VersionStatus.failed,
            Document.deleted_at.is_(None),
        )
        .limit(1)
    )
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, f'Dokumen identik sudah ada: "{duplicate}"')


async def _add_version(
    session, user, doc: Document, number: int, filename: str, mime: str, data: bytes, sha256: str
) -> DocumentVersion:
    version = DocumentVersion(
        id=uuid.uuid4(),
        tenant_id=user.tenant_id,
        document_id=doc.id,
        version=number,
        filename=filename,
        storage_path="",
        mime=mime,
        size_bytes=len(data),
        sha256=sha256,
    )
    version.storage_path = storage.save(user.tenant_id, version.id, filename, data)
    session.add(version)
    return version


@router.post(
    "/collections/{collection_id}/documents",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    collection_id: uuid.UUID,
    file: UploadFile,
    user: Admin,
    session: DB,
    request: Request,
    title: str | None = Form(None),
) -> DocumentOut:
    collection = await session.get(Collection, collection_id)
    if not collection:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection tidak ditemukan")
    filename, mime, data, sha256 = await _read_upload(file)
    await _reject_duplicate(session, sha256)

    doc = Document(
        tenant_id=user.tenant_id,
        collection_id=collection_id,
        title=(title or auto_title(filename)).strip()[:300],
        created_by=user.id,
    )
    session.add(doc)
    await session.flush()
    version = await _add_version(session, user, doc, 1, filename, mime, data, sha256)
    await audit.record(
        session,
        user,
        "document.uploaded",
        target_type="document",
        target_id=doc.id,
        target_label=doc.title,
        meta={"collection": collection.name, "filename": filename, "size_bytes": len(data)},
        ip=client_ip(request),
    )
    await session.commit()

    await enqueue_ingest(user.tenant_id, version.id)
    return _out(await _get_document(session, doc.id))


@router.post(
    "/documents/{document_id}/versions",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_version(
    document_id: uuid.UUID, file: UploadFile, user: Admin, session: DB, request: Request
) -> DocumentOut:
    """New version of an existing document. The current version keeps answering questions
    until the new one is fully indexed; the switch is atomic (see ingestion pipeline)."""
    doc = await _get_document(session, document_id)
    if any(v.status in IN_PROGRESS for v in doc.versions):
        raise HTTPException(status.HTTP_409_CONFLICT, "Masih ada versi yang sedang diproses")
    filename, mime, data, sha256 = await _read_upload(file)
    current = next((v for v in doc.versions if v.is_current), None)
    if current and current.sha256 == sha256:
        raise HTTPException(status.HTTP_409_CONFLICT, "File sama persis dengan versi aktif")
    await _reject_duplicate(session, sha256)

    number = max((v.version for v in doc.versions), default=0) + 1
    version = await _add_version(session, user, doc, number, filename, mime, data, sha256)
    await audit.record(
        session,
        user,
        "document.version_uploaded",
        target_type="document",
        target_id=doc.id,
        target_label=doc.title,
        before={"version": current.version} if current else None,
        after={"version": number, "filename": filename},
        ip=client_ip(request),
    )
    await session.commit()
    await enqueue_ingest(user.tenant_id, version.id)
    return _out(await _get_document(session, doc.id), with_versions=True)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID, user: Admin, session: DB, request: Request
) -> None:
    """Soft delete: the document stops answering immediately; files stay for the audit trail."""
    doc = await _get_document(session, document_id)
    doc.deleted_at = datetime.now(UTC)
    await audit.record(
        session,
        user,
        "document.deleted",
        target_type="document",
        target_id=doc.id,
        target_label=doc.title,
        ip=client_ip(request),
    )


@router.get("/documents/{document_id}", response_model=DocumentOut)
async def get_document(document_id: uuid.UUID, user: User, session: DB) -> DocumentOut:
    return _out(await _get_document(session, document_id, user), with_versions=True)


@router.get("/documents/{document_id}/chunks", response_model=list[ChunkOut])
async def list_chunks(
    document_id: uuid.UUID, user: Admin, session: DB, version: int | None = None
) -> list[ChunkOut]:
    doc = await _get_document(session, document_id)
    target = next((v for v in doc.versions if v.version == version), None) if version else None
    target = target or next((v for v in doc.versions if v.is_current), None)
    target = target or (doc.versions[-1] if doc.versions else None)
    if not target:
        return []
    chunks = await session.scalars(
        select(Chunk).where(Chunk.document_version_id == target.id).order_by(Chunk.ordinal)
    )
    return [ChunkOut.model_validate(c, from_attributes=True) for c in chunks]


@router.get("/documents/{document_id}/file")
async def download_file(
    document_id: uuid.UUID, user: User, session: DB, version: int | None = None
) -> FileResponse:
    doc = await _get_document(session, document_id, user)
    target = next(
        (v for v in doc.versions if (v.version == version if version else v.is_current)), None
    )
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Versi tidak ditemukan")
    return FileResponse(
        storage.path_for(target.storage_path),
        media_type=target.mime,
        filename=target.filename,
        content_disposition_type="inline",
    )


@router.post("/documents/{document_id}/retry", response_model=DocumentOut)
async def retry_ingest(document_id: uuid.UUID, user: Admin, session: DB) -> DocumentOut:
    doc = await _get_document(session, document_id)
    latest = doc.versions[-1] if doc.versions else None
    if not latest or latest.status != VersionStatus.failed:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Hanya versi yang gagal yang bisa diproses ulang"
        )
    latest.status, latest.error = VersionStatus.queued, None
    await audit.record(
        session,
        user,
        "document.reprocessed",
        target_type="document",
        target_id=doc.id,
        target_label=doc.title,
        meta={"version": latest.version},
    )
    await session.commit()
    await enqueue_ingest(user.tenant_id, latest.id, retry=True)
    return _out(await _get_document(session, document_id))
