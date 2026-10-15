"""Numbers for the dashboard and per-collection health, computed from each document's
latest version (the one an admin cares about: is it ready, still processing, or broken)."""

import uuid
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.deps import DB, Admin

router = APIRouter(tags=["overview"])

LATEST_VERSIONS = """
    SELECT DISTINCT ON (v.document_id)
           v.document_id, v.status, v.error, v.updated_at, v.chunk_count, d.title, d.collection_id
    FROM document_versions v
    JOIN documents d ON d.id = v.document_id AND d.deleted_at IS NULL
    ORDER BY v.document_id, v.version DESC
"""


class StatusCounts(BaseModel):
    ready: int = 0
    processing: int = 0
    failed: int = 0


class RecentDocument(BaseModel):
    id: uuid.UUID
    title: str
    collection_id: uuid.UUID
    collection_name: str
    status: str
    error: str | None
    updated_at: datetime


class Overview(BaseModel):
    documents: StatusCounts
    chunks: int
    collections: int
    attention: list[RecentDocument]
    recent: list[RecentDocument]
    open_gaps: int
    questions_7d: int
    refused_7d: int
    feedback_positive: int
    feedback_negative: int


class CollectionHealth(BaseModel):
    collection_id: uuid.UUID
    counts: StatusCounts
    updated_at: datetime | None


def _bucket(status: str) -> str:
    return status if status in ("ready", "failed") else "processing"


@router.get("/overview", response_model=Overview)
async def overview(user: Admin, session: DB) -> Overview:
    latest = (await session.execute(text(LATEST_VERSIONS))).mappings().all()
    counts = StatusCounts()
    for row in latest:
        key = _bucket(row["status"])
        setattr(counts, key, getattr(counts, key) + 1)

    names = dict((await session.execute(text("SELECT id, name FROM collections"))).all())
    chunks = await session.scalar(
        text(
            "SELECT count(*) FROM chunks c JOIN document_versions v ON v.id = c.document_version_id WHERE v.is_current"
        )
    )

    def item(row) -> RecentDocument:
        return RecentDocument(
            id=row["document_id"],
            title=row["title"],
            collection_id=row["collection_id"],
            collection_name=names.get(row["collection_id"], ""),
            status=row["status"],
            error=row["error"],
            updated_at=row["updated_at"],
        )

    activity = (
        await session.execute(
            text(
                """
                SELECT
                  (SELECT count(*) FROM knowledge_gaps WHERE resolved_at IS NULL),
                  (SELECT count(*) FROM messages WHERE role = 'assistant'
                     AND created_at > now() - interval '7 days'),
                  (SELECT count(*) FROM messages WHERE role = 'assistant' AND refused
                     AND created_at > now() - interval '7 days'),
                  (SELECT count(*) FROM feedback WHERE rating = 1),
                  (SELECT count(*) FROM feedback WHERE rating = -1)
                """
            )
        )
    ).one()
    by_time = sorted(latest, key=lambda r: r["updated_at"], reverse=True)
    return Overview(
        documents=counts,
        chunks=chunks or 0,
        collections=len(names),
        attention=[item(r) for r in by_time if r["status"] != "ready"][:10],
        recent=[item(r) for r in by_time][:8],
        open_gaps=activity[0],
        questions_7d=activity[1],
        refused_7d=activity[2],
        feedback_positive=activity[3],
        feedback_negative=activity[4],
    )


@router.get("/collections-health", response_model=list[CollectionHealth])
async def collections_health(user: Admin, session: DB) -> list[CollectionHealth]:
    latest = (await session.execute(text(LATEST_VERSIONS))).mappings().all()
    health: dict[uuid.UUID, CollectionHealth] = {}
    for row in latest:
        entry = health.setdefault(
            row["collection_id"],
            CollectionHealth(
                collection_id=row["collection_id"], counts=StatusCounts(), updated_at=None
            ),
        )
        key = _bucket(row["status"])
        setattr(entry.counts, key, getattr(entry.counts, key) + 1)
        if entry.updated_at is None or row["updated_at"] > entry.updated_at:
            entry.updated_at = row["updated_at"]
    return list(health.values())
