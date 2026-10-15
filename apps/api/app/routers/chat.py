import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.acl import readable_document_ids, reader_for
from app.audit import client_ip
from app.deps import DB, User
from app.models import Conversation, DocumentVersion, Message, MessageCitation
from app.rag.chat import answer

router = APIRouter(tags=["chat"])
log = logging.getLogger(__name__)


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: uuid.UUID | None = None


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    updated_at: datetime


class CitationOut(BaseModel):
    marker: int
    document_id: uuid.UUID
    title: str
    version: int
    mime: str
    heading_path: str
    page_start: int
    page_end: int
    quote: str | None  # None when the reader has since lost access to the document
    score: float
    cited: bool
    available: bool


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    refused: bool
    created_at: datetime
    latency_ms: int | None = None
    citations: list[CitationOut] = []


@router.post("/chat")
async def chat(body: ChatIn, user: User, request: Request) -> StreamingResponse:
    async def events():
        try:
            async for event, data in answer(
                user, body.message.strip(), body.conversation_id, client_ip(request)
            ):
                yield _sse(event, data)
        except Exception:
            log.exception("chat failed")
            yield _sse(
                "error", {"message": "Terjadi kesalahan saat menyiapkan jawaban. Coba lagi."}
            )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(user: User, session: DB) -> list[ConversationOut]:
    rows = await session.scalars(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    return [ConversationOut.model_validate(c, from_attributes=True) for c in rows]


async def _own_conversation(session, user, conversation_id: uuid.UUID) -> Conversation:
    convo = await session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if not convo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Percakapan tidak ditemukan")
    return convo


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(conversation_id: uuid.UUID, user: User, session: DB) -> list[MessageOut]:
    await _own_conversation(session, user, conversation_id)
    messages = list(
        await session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
    )
    citations = await session.scalars(
        select(MessageCitation)
        .where(MessageCitation.message_id.in_([m.id for m in messages]))
        .order_by(MessageCitation.marker)
    )
    readable = await readable_document_ids(session, await reader_for(session, user))
    citations = list(citations)
    mimes = dict(
        (
            await session.execute(
                select(DocumentVersion.id, DocumentVersion.mime).where(
                    DocumentVersion.id.in_({c.document_version_id for c in citations})
                )
            )
        ).all()
    )
    by_message: dict[uuid.UUID, list[CitationOut]] = {}
    for c in citations:
        available = c.document_id in readable
        by_message.setdefault(c.message_id, []).append(
            CitationOut(
                marker=c.marker,
                document_id=c.document_id,
                title=c.document_title if available else "Dokumen tidak lagi dapat diakses",
                version=c.version,
                mime=mimes.get(c.document_version_id, ""),
                heading_path=c.heading_path if available else "",
                page_start=c.page_start,
                page_end=c.page_end,
                quote=c.quote if available else None,
                score=c.score,
                cited=c.cited,
                available=available,
            )
        )
    return [
        MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            refused=m.refused,
            created_at=m.created_at,
            latency_ms=m.latency_ms,
            citations=by_message.get(m.id, []),
        )
        for m in messages
    ]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: uuid.UUID, user: User, session: DB) -> None:
    await _own_conversation(session, user, conversation_id)
    await session.execute(delete(Conversation).where(Conversation.id == conversation_id))
