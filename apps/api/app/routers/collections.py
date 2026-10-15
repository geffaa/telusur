import uuid
from datetime import datetime

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import audit
from app.acl import readable_collection_ids, readable_document_ids, reader_for
from app.deps import DB, Admin, User
from app.i18n import AppError
from app.models import Collection, Document

router = APIRouter(prefix="/collections", tags=["collections"])


class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class CollectionOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    document_count: int
    created_at: datetime


@router.get("", response_model=list[CollectionOut])
async def list_collections(user: User, session: DB) -> list[CollectionOut]:
    doc_count = (
        select(func.count(Document.id))
        .where(Document.collection_id == Collection.id, Document.deleted_at.is_(None))
        .scalar_subquery()
    )
    query = select(Collection, doc_count).order_by(Collection.name)
    if not user.can_manage_knowledge:
        reader = await reader_for(session, user)
        query = query.where(Collection.id.in_(await readable_collection_ids(session, reader)))
        doc_count = (
            select(func.count(Document.id))
            .where(
                Document.collection_id == Collection.id,
                Document.id.in_(await readable_document_ids(session, reader)),
            )
            .scalar_subquery()
        )
        query = select(Collection, doc_count).where(query.whereclause).order_by(Collection.name)
    rows = await session.execute(query)
    return [
        CollectionOut(
            id=c.id,
            name=c.name,
            description=c.description,
            document_count=n,
            created_at=c.created_at,
        )
        for c, n in rows
    ]


@router.post("", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
async def create_collection(
    body: CollectionIn, user: Admin, session: DB, request: Request
) -> CollectionOut:
    collection = Collection(
        tenant_id=user.tenant_id, name=body.name, description=body.description, created_by=user.id
    )
    session.add(collection)
    await session.flush()
    await session.refresh(collection)
    await audit.record(
        session,
        user,
        "collection.created",
        target_type="collection",
        target_id=collection.id,
        target_label=collection.name,
        ip=audit.client_ip(request),
    )
    return CollectionOut(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        document_count=0,
        created_at=collection.created_at,
    )


@router.get("/{collection_id}", response_model=CollectionOut)
async def get_collection(collection_id: uuid.UUID, user: User, session: DB) -> CollectionOut:
    collection = await session.get(Collection, collection_id)
    if collection and not user.can_manage_knowledge:
        readable = await readable_collection_ids(session, await reader_for(session, user))
        collection = collection if collection_id in readable else None
    if not collection:
        # Same 404 for "other tenant" and "does not exist": RLS hides both.
        raise AppError(status.HTTP_404_NOT_FOUND, "collection_not_found")
    count = await session.scalar(
        select(func.count(Document.id)).where(
            Document.collection_id == collection_id, Document.deleted_at.is_(None)
        )
    )
    return CollectionOut(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        document_count=count or 0,
        created_at=collection.created_at,
    )
