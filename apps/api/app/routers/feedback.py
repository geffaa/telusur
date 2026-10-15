import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.deps import DB, Admin, User
from app.models import Conversation, Feedback, Message
from app.models import User as UserModel

router = APIRouter(tags=["feedback"])

Reason = Literal["wrong", "incomplete", "wrong_source", "other"]


class FeedbackIn(BaseModel):
    rating: Literal[1, -1]
    reason: Reason | None = None
    comment: str | None = Field(None, max_length=1000)


class FeedbackItem(BaseModel):
    id: uuid.UUID
    rating: int
    reason: str | None
    comment: str | None
    created_at: datetime
    user_name: str | None
    question: str
    answer: str
    message_id: uuid.UUID
    conversation_id: uuid.UUID


class FeedbackSummary(BaseModel):
    positive: int
    negative: int
    items: list[FeedbackItem]


@router.put("/messages/{message_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def give_feedback(message_id: uuid.UUID, body: FeedbackIn, user: User, session: DB) -> None:
    owned = await session.scalar(
        select(Message.id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            Message.id == message_id, Message.role == "assistant", Conversation.user_id == user.id
        )
    )
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pesan tidak ditemukan")
    values = {
        "tenant_id": user.tenant_id,
        "message_id": message_id,
        "user_id": user.id,
        "rating": body.rating,
        "reason": body.reason if body.rating == -1 else None,
        "comment": body.comment,
    }
    await session.execute(
        insert(Feedback)
        .values(id=uuid.uuid4(), **values)
        .on_conflict_do_update(
            index_elements=["message_id", "user_id"],
            set_={k: values[k] for k in ("rating", "reason", "comment")}
            | {"created_at": func.now()},
        )
    )


@router.get("/messages/feedback")
async def my_feedback(user: User, session: DB, conversation_id: uuid.UUID) -> dict[str, int]:
    """Ratings this user gave in one conversation, keyed by message id."""
    rows = await session.execute(
        select(Feedback.message_id, Feedback.rating)
        .join(Message, Message.id == Feedback.message_id)
        .where(Feedback.user_id == user.id, Message.conversation_id == conversation_id)
    )
    return {str(m): r for m, r in rows}


@router.get("/feedback", response_model=FeedbackSummary)
async def list_feedback(
    user: Admin,
    session: DB,
    rating: int | None = Query(None, description="1 = membantu, -1 = tidak membantu"),
    limit: int = 100,
) -> FeedbackSummary:
    if rating not in (None, 1, -1):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "rating harus 1 atau -1")
    counts = dict(
        (
            await session.execute(select(Feedback.rating, func.count()).group_by(Feedback.rating))
        ).all()
    )
    query = (
        select(Feedback, Message, UserModel.name)
        .join(Message, Message.id == Feedback.message_id)
        .outerjoin(UserModel, UserModel.id == Feedback.user_id)
        .order_by(Feedback.created_at.desc())
        .limit(min(limit, 500))
    )
    if rating:
        query = query.where(Feedback.rating == rating)
    rows = (await session.execute(query)).all()

    # The question is the user message right before each answer.
    questions: dict[uuid.UUID, str] = {}
    for _, message, _ in rows:
        questions[message.id] = (
            await session.scalar(
                select(Message.content)
                .where(
                    Message.conversation_id == message.conversation_id,
                    Message.role == "user",
                    Message.created_at <= message.created_at,
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            or ""
        )
    return FeedbackSummary(
        positive=counts.get(1, 0),
        negative=counts.get(-1, 0),
        items=[
            FeedbackItem(
                id=f.id,
                rating=f.rating,
                reason=f.reason,
                comment=f.comment,
                created_at=f.created_at,
                user_name=name,
                question=questions[m.id],
                answer=m.content,
                message_id=m.id,
                conversation_id=m.conversation_id,
            )
            for f, m, name in rows
        ],
    )
