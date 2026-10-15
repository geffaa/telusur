import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app import audit
from app.deps import DB, Admin
from app.models import Document, EvalCase, EvalResult, EvalRun, Feedback, Message, User
from app.queue import enqueue_eval

router = APIRouter(prefix="/eval", tags=["evaluation"])

Kind = Literal["answerable", "unanswerable", "restricted"]


class CaseOut(BaseModel):
    id: uuid.UUID
    kind: Kind
    question: str
    expected_answer: str | None
    expected_document_id: uuid.UUID | None
    expected_document_title: str | None
    expected_heading: str | None
    ask_as: str
    source: str
    verified: bool
    created_at: datetime


class CasePatch(BaseModel):
    question: str | None = Field(None, min_length=3, max_length=2000)
    expected_answer: str | None = None
    expected_document_id: uuid.UUID | None = None
    clear_heading: bool = False
    verified: bool | None = None


class RunIn(BaseModel):
    mode: Literal["vector", "lexical", "hybrid", "hybrid_rerank"] = "hybrid_rerank"
    answers: bool = False
    verified_only: bool = False


class RunOut(BaseModel):
    id: uuid.UUID
    name: str
    config: dict
    status: str
    progress: int
    case_count: int
    metrics: dict
    error: str | None
    created_at: datetime
    finished_at: datetime | None


class ResultOut(BaseModel):
    case_id: uuid.UUID
    kind: str
    question: str
    expected_document_title: str | None
    expected_heading: str | None
    expected_answer: str | None
    hit_rank: int | None
    doc_hit_rank: int | None
    top_score: float
    refused: bool
    retrieved: list
    answer: str | None
    faithfulness: float | None
    correctness: float | None
    judge_notes: str | None


async def _cases(session, where=None) -> list[CaseOut]:
    query = (
        select(EvalCase, Document.title, User.name)
        .outerjoin(Document, Document.id == EvalCase.expected_document_id)
        .join(User, User.id == EvalCase.ask_as_user_id)
        .order_by(EvalCase.kind, EvalCase.created_at)
    )
    if where is not None:
        query = query.where(where)
    return [
        CaseOut(
            id=c.id,
            kind=c.kind,
            question=c.question,
            expected_answer=c.expected_answer,
            expected_document_id=c.expected_document_id,
            expected_document_title=title,
            expected_heading=c.expected_heading,
            ask_as=name,
            source=c.source,
            verified=c.verified,
            created_at=c.created_at,
        )
        for c, title, name in await session.execute(query)
    ]


@router.get("/cases", response_model=list[CaseOut])
async def list_cases(user: Admin, session: DB) -> list[CaseOut]:
    return await _cases(session)


@router.patch("/cases/{case_id}", response_model=CaseOut)
async def update_case(case_id: uuid.UUID, body: CasePatch, user: Admin, session: DB) -> CaseOut:
    case = await session.get(EvalCase, case_id)
    if not case:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kasus uji tidak ditemukan")
    for field in ("question", "expected_answer", "verified"):
        value = getattr(body, field)
        if value is not None:
            setattr(case, field, value)
    if body.expected_document_id is not None:
        case.expected_document_id = body.expected_document_id
        case.expected_heading = None  # a new source is checked at document level
    if body.clear_heading:
        case.expected_heading = None
    await session.flush()
    return (await _cases(session, EvalCase.id == case_id))[0]


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(case_id: uuid.UUID, user: Admin, session: DB) -> None:
    case = await session.get(EvalCase, case_id)
    if not case:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kasus uji tidak ditemukan")
    await session.delete(case)


@router.post("/cases/from-feedback/{feedback_id}", response_model=CaseOut, status_code=201)
async def case_from_feedback(feedback_id: uuid.UUID, user: Admin, session: DB) -> CaseOut:
    """A thumbs-down becomes a regression test. The admin then picks the right source
    document and writes the reference answer before marking it verified."""
    fb = await session.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback tidak ditemukan")
    answer = await session.get(Message, fb.message_id)
    question = await session.scalar(
        select(Message.content)
        .where(
            Message.conversation_id == answer.conversation_id,
            Message.role == "user",
            Message.created_at <= answer.created_at,
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    case = EvalCase(
        tenant_id=user.tenant_id,
        kind="answerable",
        question=question or "",
        expected_answer=fb.comment,
        ask_as_user_id=fb.user_id,
        source="feedback",
    )
    session.add(case)
    await session.flush()
    return (await _cases(session, EvalCase.id == case.id))[0]


@router.get("/runs", response_model=list[RunOut])
async def list_runs(user: Admin, session: DB) -> list[RunOut]:
    runs = await session.scalars(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(50))
    return [RunOut.model_validate(r, from_attributes=True) for r in runs]


@router.post("/runs", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def start_run(body: RunIn, user: Admin, session: DB, request: Request) -> RunOut:
    busy = await session.scalar(select(EvalRun.id).where(EvalRun.status.in_(["queued", "running"])))
    if busy:
        raise HTTPException(status.HTTP_409_CONFLICT, "Masih ada evaluasi yang berjalan")
    name = body.mode + (" + jawaban" if body.answers else "")
    run = EvalRun(
        tenant_id=user.tenant_id,
        name=name,
        config={**body.model_dump(), "translate": True},
        created_by=user.id,
    )
    session.add(run)
    await session.flush()
    await audit.record(
        session,
        user,
        "eval.started",
        target_type="eval_run",
        target_id=run.id,
        target_label=name,
        ip=audit.client_ip(request),
    )
    await session.commit()
    await enqueue_eval(user.tenant_id, run.id)
    return RunOut.model_validate(run, from_attributes=True)


@router.get("/runs/{run_id}/results", response_model=list[ResultOut])
async def run_results(run_id: uuid.UUID, user: Admin, session: DB) -> list[ResultOut]:
    rows = await session.execute(
        select(EvalResult, EvalCase, Document.title)
        .join(EvalCase, EvalCase.id == EvalResult.case_id)
        .outerjoin(Document, Document.id == EvalCase.expected_document_id)
        .where(EvalResult.run_id == run_id)
        .order_by(EvalCase.kind, EvalCase.created_at)
    )
    return [
        ResultOut(
            case_id=c.id,
            kind=c.kind,
            question=c.question,
            expected_document_title=title,
            expected_heading=c.expected_heading,
            expected_answer=c.expected_answer,
            hit_rank=r.hit_rank,
            doc_hit_rank=r.doc_hit_rank,
            top_score=r.top_score,
            refused=r.refused,
            retrieved=r.retrieved,
            answer=r.answer,
            faithfulness=r.faithfulness,
            correctness=r.correctness,
            judge_notes=r.judge_notes,
        )
        for r, c, title in rows
    ]
