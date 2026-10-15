"""Run the evaluation set against one retrieval configuration.

Retrieval metrics (no LLM, cheap, run for every config):
  recall@1 / recall@5   the expected *section* is among the top 1 / 5 passages
  doc_recall@5          the expected *document* is among the top 5
  mrr                   mean reciprocal rank of the expected section
  refusal metrics       unanswerable/restricted questions must fall under the threshold;
                        answerable ones must not (false refusals)

Answer metrics (optional, uses the LLM, slow on free tiers):
  faithfulness  every claim in the answer is supported by the retrieved passages (judge)
  correctness   the answer matches the reference answer (judge)
  citation_rate answers that cite at least one valid source
"""

import json
import logging
import statistics
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.acl import Reader
from app.config import get_settings
from app.db import tenant_session
from app.models import EvalCase, EvalResult, EvalRun, GroupUser
from app.rag import llm
from app.rag.chat import build_messages, prepare_query, verify_citations
from app.rag.retrieval import RetrievalMode, retrieve

log = logging.getLogger(__name__)

JUDGE_PROMPT = """You grade an internal-policy assistant. Be strict and literal.

Retrieved passages:
{context}

Question: {question}
Reference answer: {reference}
Assistant answer: {answer}

Score two things from 0 to 1:
- faithfulness: share of factual claims in the assistant answer that are directly supported by the passages (1 = everything supported, 0 = invented). Citation markers like [1] are not claims.
- correctness: does the assistant answer give the same facts as the reference answer (numbers, conditions)? 1 = fully, 0.5 = partially or missing a condition, 0 = wrong or missing.

Reply JSON: {{"faithfulness": 0.0, "correctness": 0.0, "notes": "one short sentence"}}"""


def _hit_rank(candidates, case: EvalCase) -> tuple[int | None, int | None]:
    """1-based rank of the expected section and of the expected document. Cases without a
    known section (e.g. created from feedback) are scored at document level."""
    section = doc = None
    for rank, c in enumerate(candidates, start=1):
        if c.document_id == case.expected_document_id:
            doc = doc or rank
            if section is None and (
                case.expected_heading is None or c.heading_path == case.expected_heading
            ):
                section = rank
    return section, doc


def _percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]


def summarize(
    results: list[EvalResult], cases: dict[uuid.UUID, EvalCase], threshold: float
) -> dict:
    answerable = [r for r in results if cases[r.case_id].kind == "answerable"]
    negative = [r for r in results if cases[r.case_id].kind != "answerable"]
    n = len(answerable) or 1
    metrics: dict = {
        "cases": len(results),
        "answerable": len(answerable),
        "negative": len(negative),
        "recall_at_1": sum(r.hit_rank == 1 for r in answerable) / n,
        "recall_at_5": sum(r.hit_rank is not None and r.hit_rank <= 5 for r in answerable) / n,
        "doc_recall_at_5": sum(
            r.doc_hit_rank is not None and r.doc_hit_rank <= 5 for r in answerable
        )
        / n,
        "mrr": sum(1 / r.hit_rank for r in answerable if r.hit_rank) / n,
        "retrieval_ms_p50": _percentile([r.retrieval_ms for r in results], 0.5),
        "retrieval_ms_p95": _percentile([r.retrieval_ms for r in results], 0.95),
    }
    if negative:
        metrics["refusal_accuracy"] = sum(r.refused for r in negative) / len(negative)
        metrics["restricted_leaks"] = sum(
            1 for r in negative if cases[r.case_id].kind == "restricted" and not r.refused
        )
    metrics["false_refusal_rate"] = sum(r.refused for r in answerable) / n
    judged = [r for r in answerable if r.faithfulness is not None]
    if judged:
        metrics["faithfulness"] = statistics.mean(r.faithfulness for r in judged)
        metrics["correctness"] = statistics.mean(r.correctness for r in judged)
        answered = [r for r in judged if not r.refused]
        metrics["citation_rate"] = sum((r.cited or 0) > 0 for r in answered) / (len(answered) or 1)
        metrics["answer_ms_p50"] = _percentile([r.answer_ms for r in judged if r.answer_ms], 0.5)
        metrics["tokens"] = sum(r.tokens or 0 for r in results)
    metrics["threshold"] = threshold
    metrics["suggested_threshold"] = suggest_threshold(answerable, negative)
    return {k: round(v, 4) if isinstance(v, float) else v for k, v in metrics.items()}


def suggest_threshold(answerable: list[EvalResult], negative: list[EvalResult]) -> float | None:
    """Threshold maximizing balanced accuracy between answering and refusing.
    Only meaningful when scores come from the reranker."""
    if not answerable or not negative:
        return None
    best, best_score = None, -1.0
    for t in [i / 100 for i in range(1, 100)]:
        answered_ok = sum(r.top_score >= t for r in answerable) / len(answerable)
        refused_ok = sum(r.top_score < t for r in negative) / len(negative)
        score = (answered_ok + refused_ok) / 2
        if score > best_score:
            best, best_score = t, score
    return best


async def _judge(
    question: str, reference: str, answer: str, context: str
) -> tuple[float, float, str]:
    raw, _ = await llm.complete(
        [
            {
                "role": "user",
                "content": JUDGE_PROMPT.format(
                    context=context, question=question, reference=reference, answer=answer
                ),
            }
        ],
        fast=True,  # a different model from the one that answered
        max_tokens=300,
        max_wait=180,
        json_mode=True,
    )
    data = json.loads(raw)
    clamp = lambda v: max(0.0, min(1.0, float(v)))
    return (
        clamp(data.get("faithfulness", 0)),
        clamp(data.get("correctness", 0)),
        str(data.get("notes", ""))[:500],
    )


async def run(tenant_id: uuid.UUID, run_id: uuid.UUID) -> dict:
    async with tenant_session(tenant_id) as s:
        run_row = await s.get(EvalRun, run_id)
        config = dict(run_row.config)
        # Answerable cases without a source document (fresh from feedback) can't be scored yet.
        query = select(EvalCase).where(
            (EvalCase.kind != "answerable") | EvalCase.expected_document_id.is_not(None)
        )
        if config.get("verified_only"):
            query = query.where(EvalCase.verified)
        cases = {c.id: c for c in await s.scalars(query.order_by(EvalCase.created_at))}
        memberships: dict[uuid.UUID, list[uuid.UUID]] = {}
        for uid, gid in await s.execute(select(GroupUser.user_id, GroupUser.group_id)):
            memberships.setdefault(uid, []).append(gid)
        run_row.status, run_row.case_count, run_row.progress = "running", len(cases), 0
        await s.execute(EvalResult.__table__.delete().where(EvalResult.run_id == run_id))

    mode: RetrievalMode = config.get("mode", "hybrid_rerank")
    with_answers = bool(config.get("answers")) and mode == "hybrid_rerank"
    threshold = float(config.get("threshold", get_settings().relevance_threshold))
    results: list[EvalResult] = []

    try:
        for i, case in enumerate(cases.values(), start=1):
            reader = Reader(case.ask_as_user_id, tuple(memberships.get(case.ask_as_user_id, [])))
            started = time.perf_counter()
            query = case.question
            if config.get("translate", True):
                query = await prepare_query(case.question)
            retrieval = await retrieve(tenant_id, reader, query, mode=mode)
            retrieval_ms = int((time.perf_counter() - started) * 1000)
            cands = retrieval.candidates
            top = cands[0].score if cands else 0.0
            refused = mode == "hybrid_rerank" and top < threshold
            section_rank, doc_rank = _hit_rank(cands, case)
            result = EvalResult(
                run_id=run_id,
                case_id=case.id,
                tenant_id=tenant_id,
                hit_rank=section_rank,
                doc_hit_rank=doc_rank,
                top_score=top,
                refused=refused,
                retrieval_ms=retrieval_ms,
                retrieved=[
                    {
                        "title": c.title,
                        "heading_path": c.heading_path,
                        "score": round(c.score, 4),
                        "document_id": str(c.document_id),
                    }
                    for c in cands
                ],
            )

            if with_answers and case.kind == "answerable" and not refused:
                sources = [c for c in cands if c.score >= threshold / 3]
                t = time.perf_counter()
                raw, usage = await llm.complete(
                    build_messages(case.question, sources), max_tokens=900, max_wait=180
                )
                answer, cited, _ = verify_citations(raw, len(sources))
                result.answer, result.cited = answer, len(cited)
                result.answer_ms = int((time.perf_counter() - t) * 1000)
                result.tokens = (usage.input_tokens or 0) + (usage.output_tokens or 0)
                context = "\n\n".join(f"[{i}] {c.passage()}" for i, c in enumerate(sources, 1))
                try:
                    result.faithfulness, result.correctness, result.judge_notes = await _judge(
                        case.question, case.expected_answer or "", answer, context
                    )
                except (llm.LLMUnavailable, json.JSONDecodeError, ValueError) as exc:
                    log.warning("judge failed for %s: %s", case.id, exc)
            elif with_answers and case.kind == "answerable" and refused:
                result.faithfulness, result.correctness = 1.0, 0.0  # said nothing false, missed it
                result.judge_notes = "Ditolak: skor relevansi di bawah ambang"

            results.append(result)
            async with tenant_session(tenant_id) as s:
                s.add(result)
                await s.execute(update(EvalRun).where(EvalRun.id == run_id).values(progress=i))

        metrics = summarize(results, cases, threshold)
        async with tenant_session(tenant_id) as s:
            await s.execute(
                update(EvalRun)
                .where(EvalRun.id == run_id)
                .values(status="done", metrics=metrics, finished_at=datetime.now(UTC))
            )
        return metrics
    except Exception as exc:
        log.exception("eval run %s failed", run_id)
        async with tenant_session(tenant_id) as s:
            await s.execute(
                update(EvalRun)
                .where(EvalRun.id == run_id)
                .values(status="failed", error=str(exc)[:1000], finished_at=datetime.now(UTC))
            )
        raise
