"""Questions the assistant could not answer, grouped by meaning so admins see topics
("klaim kacamata", 12 askers) instead of 12 differently-worded questions."""

import uuid
from datetime import UTC, datetime

import numpy as np
from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import select, update

from app import audit
from app.deps import DB, Admin
from app.models import KnowledgeGap

router = APIRouter(tags=["knowledge-gaps"])

# Cosine similarity (bge-m3, normalized) above which two questions count as one topic.
# Measured on Indonesian HR questions: paraphrases of one topic scored 0.69-0.90,
# different topics at most 0.64 ("uang lembur" vs "kapan gaji ditransfer").
SAME_TOPIC = 0.68


class GapQuestion(BaseModel):
    id: uuid.UUID
    query: str
    created_at: datetime


class GapCluster(BaseModel):
    label: str
    count: int
    askers: int
    last_asked: datetime
    gap_ids: list[uuid.UUID]
    examples: list[GapQuestion]


class ResolveIn(BaseModel):
    gap_ids: list[uuid.UUID]


def cluster(gaps: list[KnowledgeGap]) -> list[list[KnowledgeGap]]:
    """Greedy single-pass clustering against running centroids; fine for hundreds of gaps."""
    groups: list[list[KnowledgeGap]] = []
    centroids: list[np.ndarray] = []
    for gap in sorted(gaps, key=lambda g: g.created_at):
        vec = np.asarray(gap.embedding, dtype=np.float32)
        if centroids:
            sims = np.stack(centroids) @ vec
            best = int(np.argmax(sims))
            if sims[best] >= SAME_TOPIC:
                groups[best].append(gap)
                c = np.mean(
                    [np.asarray(g.embedding, dtype=np.float32) for g in groups[best]], axis=0
                )
                centroids[best] = c / np.linalg.norm(c)
                continue
        groups.append([gap])
        centroids.append(vec)
    return groups


@router.get("/knowledge-gaps", response_model=list[GapCluster])
async def list_gaps(user: Admin, session: DB) -> list[GapCluster]:
    gaps = list(
        await session.scalars(
            select(KnowledgeGap)
            .where(KnowledgeGap.resolved_at.is_(None))
            .order_by(KnowledgeGap.created_at.desc())
            .limit(500)
        )
    )
    clusters = []
    for group in cluster(gaps):
        newest = sorted(group, key=lambda g: g.created_at, reverse=True)
        clusters.append(
            GapCluster(
                label=newest[0].query,
                count=len(group),
                askers=len({g.user_id for g in group}),
                last_asked=newest[0].created_at,
                gap_ids=[g.id for g in group],
                examples=[
                    GapQuestion(id=g.id, query=g.query, created_at=g.created_at) for g in newest[:5]
                ],
            )
        )
    return sorted(clusters, key=lambda c: (c.askers, c.count, c.last_asked), reverse=True)


@router.post("/knowledge-gaps/resolve")
async def resolve_gaps(body: ResolveIn, user: Admin, session: DB, request: Request) -> dict:
    result = await session.execute(
        update(KnowledgeGap)
        .where(KnowledgeGap.id.in_(body.gap_ids), KnowledgeGap.resolved_at.is_(None))
        .values(resolved_at=datetime.now(UTC), resolved_by=user.id)
        .returning(KnowledgeGap.query)
    )
    queries = [q for (q,) in result]
    if queries:
        await audit.record(
            session,
            user,
            "gap.resolved",
            target_type="knowledge_gap",
            target_label=queries[0],
            meta={"count": len(queries)},
            ip=audit.client_ip(request),
        )
    return {"resolved": len(queries)}
