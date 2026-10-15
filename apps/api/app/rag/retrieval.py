"""Hybrid, permission-aware retrieval.

1. Vector search (bge-m3, HNSW) and full-text search run against chunks of *current*
   versions of documents the reader may see; the ACL filter is part of the SQL, so a
   forbidden chunk can never reach the reranker or the LLM.
2. The two rankings are fused with Reciprocal Rank Fusion.
3. A cross-encoder reranks the fused candidates; its score is what the "I don't know"
   threshold is compared against.
"""

import asyncio
import json
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.acl import READABLE_DOCUMENTS, Reader
from app.ingestion.embedder import get_embedder
from app.rag.reranker import get_reranker

RRF_K = 60
RetrievalMode = Literal["vector", "lexical", "hybrid", "hybrid_rerank"]

# Words too common to help keyword search (ID + EN). Kept short on purpose: the vector
# side handles meaning, the lexical side is there for exact terms like "SOP-FIN-012".
STOPWORDS = {
    "yang",
    "dan",
    "di",
    "ke",
    "dari",
    "untuk",
    "dengan",
    "pada",
    "ini",
    "itu",
    "atau",
    "adalah",
    "apa",
    "apakah",
    "berapa",
    "bagaimana",
    "kapan",
    "siapa",
    "mana",
    "saya",
    "kami",
    "kita",
    "aku",
    "anda",
    "kamu",
    "ya",
    "tidak",
    "bisa",
    "boleh",
    "harus",
    "ada",
    "akan",
    "sudah",
    "jika",
    "kalau",
    "dalam",
    "oleh",
    "sebagai",
    "juga",
    "saja",
    "per",
    "the",
    "a",
    "an",
    "of",
    "to",
    "in",
    "for",
    "on",
    "is",
    "are",
    "what",
    "how",
    "when",
    "who",
    "which",
    "do",
    "does",
    "can",
    "i",
    "my",
    "me",
    "be",
    "with",
    "and",
    "or",
    "at",
    "by",
    "it",
    "this",
    "that",
}

CANDIDATE_COLUMNS = """
    c.id, c.content, c.heading_path, c.page_start, c.page_end, c.kind,
    v.id AS version_id, v.version, v.mime, v.document_id, d.title
"""


@dataclass
class Candidate:
    chunk_id: int
    document_id: uuid.UUID
    version_id: uuid.UUID
    version: int
    mime: str
    title: str
    heading_path: str
    page_start: int
    page_end: int
    kind: str
    content: str
    vector_rank: int | None = None
    lexical_rank: int | None = None
    rrf: float = 0.0
    score: float = 0.0  # reranker relevance, 0..1

    def passage(self) -> str:
        header = f"{self.title} — {self.heading_path}" if self.heading_path else self.title
        return f"{header}\n{self.content}"


@dataclass
class RetrievalResult:
    candidates: list[Candidate]
    query_embedding: list[float]
    timings_ms: dict[str, int] = field(default_factory=dict)

    def debug(self) -> list[dict]:
        rows = [
            {k: v for k, v in asdict(c).items() if k != "content"} | {"preview": c.content[:160]}
            for c in self.candidates
        ]
        return json.loads(json.dumps(rows, default=str))  # JSON-safe (UUIDs) for JSONB


def lexical_query(query: str) -> str | None:
    """OR-query of meaningful terms, e.g. "uang | harian | manager | surabaya"."""
    # Postgres' "simple" parser also splits "SOP-FIN-012" into sop / fin / 012, so the
    # parts of a code match the same way.
    terms = [t for t in re.findall(r"\w+", query.lower()) if t not in STOPWORDS and len(t) > 1]
    terms = list(dict.fromkeys(terms))
    return " | ".join(terms) if terms else None


def _row_to_candidate(row) -> Candidate:
    return Candidate(
        chunk_id=row.id,
        document_id=row.document_id,
        version_id=row.version_id,
        version=row.version,
        mime=row.mime,
        title=row.title,
        heading_path=row.heading_path,
        page_start=row.page_start,
        page_end=row.page_end,
        kind=row.kind,
        content=row.content,
    )


async def retrieve(
    session: AsyncSession,
    reader: Reader,
    query: str,
    k_vector: int = 40,
    k_lexical: int = 40,
    k_rerank: int = 20,
    k_final: int = 6,
    mode: RetrievalMode = "hybrid_rerank",
) -> RetrievalResult:
    """`mode` exists for evaluation: production always uses hybrid_rerank. Without the
    reranker, `score` is the fused/raw rank score and is not comparable to the threshold."""
    timings: dict[str, int] = {}
    started = time.perf_counter()
    embedding = (await asyncio.to_thread(get_embedder().embed, [query]))[0]
    timings["embed"] = int((time.perf_counter() - started) * 1000)

    base = f"""
        WITH readable AS ({READABLE_DOCUMENTS})
        SELECT {CANDIDATE_COLUMNS}, %s AS rank_score
        FROM chunks c
        JOIN document_versions v ON v.id = c.document_version_id AND v.is_current
        JOIN documents d ON d.id = v.document_id
        JOIN readable r ON r.id = d.id
    """
    started = time.perf_counter()
    # Filtered HNSW: keep scanning the graph until enough rows pass the ACL filter.
    await session.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
    vector_rows = (
        []
        if mode == "lexical"
        else (
            await session.execute(
                text(
                    base % "c.embedding <=> CAST(:qvec AS vector)" + " ORDER BY rank_score LIMIT :k"
                ),
                {**reader.params, "qvec": str(embedding), "k": k_vector},
            )
        ).all()
    )
    lexical_rows = []
    tsquery = lexical_query(query) if mode != "vector" else None
    if tsquery:
        lexical_rows = (
            await session.execute(
                text(
                    base % "ts_rank_cd(c.tsv, to_tsquery('simple', :tsq))"
                    + " WHERE c.tsv @@ to_tsquery('simple', :tsq) ORDER BY rank_score DESC LIMIT :k"
                ),
                {**reader.params, "tsq": tsquery, "k": k_lexical},
            )
        ).all()
    timings["search"] = int((time.perf_counter() - started) * 1000)

    fused: dict[int, Candidate] = {}
    for rank, row in enumerate(vector_rows, start=1):
        cand = fused.setdefault(row.id, _row_to_candidate(row))
        cand.vector_rank = rank
        cand.rrf += 1 / (RRF_K + rank)
    for rank, row in enumerate(lexical_rows, start=1):
        cand = fused.setdefault(row.id, _row_to_candidate(row))
        cand.lexical_rank = rank
        cand.rrf += 1 / (RRF_K + rank)
    pool = sorted(fused.values(), key=lambda c: c.rrf, reverse=True)[:k_rerank]
    if mode != "hybrid_rerank":
        for cand in pool:
            cand.score = cand.rrf
        return RetrievalResult(
            candidates=pool[:k_final], query_embedding=embedding, timings_ms=timings
        )

    started = time.perf_counter()
    scores = await asyncio.to_thread(get_reranker().score, query, [c.passage() for c in pool])
    for cand, score in zip(pool, scores, strict=True):
        cand.score = score
    timings["rerank"] = int((time.perf_counter() - started) * 1000)

    ranked = sorted(pool, key=lambda c: c.score, reverse=True)[:k_final]
    return RetrievalResult(candidates=ranked, query_embedding=embedding, timings_ms=timings)
