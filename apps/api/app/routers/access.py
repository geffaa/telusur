"""Manage who may read a collection, or a single document that overrides its collection."""

import uuid

from fastapi import APIRouter, Request, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select

from app import audit
from app.deps import DB, Admin, User
from app.i18n import AppError
from app.models import AccessGrant, Collection, Document, Group, GroupUser, PrincipalType

router = APIRouter(tags=["access"])


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    member_count: int


class AccessOut(BaseModel):
    everyone: bool
    group_ids: list[uuid.UUID]
    inherit: bool = False  # documents only: follow the collection's access


class AccessIn(BaseModel):
    everyone: bool = False
    group_ids: list[uuid.UUID] = []
    inherit: bool = False


@router.get("/groups", response_model=list[GroupOut])
async def list_groups(user: User, session: DB) -> list[GroupOut]:
    rows = await session.execute(
        select(Group, func.count(GroupUser.user_id))
        .outerjoin(GroupUser, GroupUser.group_id == Group.id)
        .group_by(Group.id)
        .order_by(Group.name)
    )
    return [GroupOut(id=g.id, name=g.name, member_count=n) for g, n in rows]


async def _grants(session, resource_type: str, resource_id: uuid.UUID) -> AccessOut:
    grants = list(
        await session.scalars(
            select(AccessGrant).where(
                AccessGrant.resource_type == resource_type, AccessGrant.resource_id == resource_id
            )
        )
    )
    return AccessOut(
        everyone=any(g.principal_type == PrincipalType.everyone for g in grants),
        group_ids=[g.principal_id for g in grants if g.principal_type == PrincipalType.group],
    )


async def _replace(
    session, user, resource_type: str, resource_id: uuid.UUID, body: AccessIn
) -> None:
    valid = set(await session.scalars(select(Group.id).where(Group.id.in_(body.group_ids))))
    if len(valid) != len(set(body.group_ids)):
        raise AppError(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_group")
    await session.execute(
        delete(AccessGrant).where(
            AccessGrant.resource_type == resource_type, AccessGrant.resource_id == resource_id
        )
    )
    if body.everyone:
        session.add(
            AccessGrant(
                tenant_id=user.tenant_id,
                resource_type=resource_type,
                resource_id=resource_id,
                principal_type=PrincipalType.everyone,
                created_by=user.id,
            )
        )
    for gid in valid:
        session.add(
            AccessGrant(
                tenant_id=user.tenant_id,
                resource_type=resource_type,
                resource_id=resource_id,
                principal_type=PrincipalType.group,
                principal_id=gid,
                created_by=user.id,
            )
        )


async def _describe(session, access: AccessOut) -> dict:
    names = dict((await session.execute(select(Group.id, Group.name))).all())
    return {
        "inherit": access.inherit,
        "everyone": access.everyone,
        "groups": sorted(names.get(g, str(g)) for g in access.group_ids),
    }


@router.get("/collections/{collection_id}/access", response_model=AccessOut)
async def get_collection_access(collection_id: uuid.UUID, user: Admin, session: DB) -> AccessOut:
    if not await session.get(Collection, collection_id):
        raise AppError(status.HTTP_404_NOT_FOUND, "collection_not_found")
    return await _grants(session, "collection", collection_id)


@router.put("/collections/{collection_id}/access", response_model=AccessOut)
async def set_collection_access(
    collection_id: uuid.UUID, body: AccessIn, user: Admin, session: DB, request: Request
) -> AccessOut:
    collection = await session.get(Collection, collection_id)
    if not collection:
        raise AppError(status.HTTP_404_NOT_FOUND, "collection_not_found")
    before = await _describe(session, await _grants(session, "collection", collection_id))
    await _replace(session, user, "collection", collection_id, body)
    await session.flush()
    result = await _grants(session, "collection", collection_id)
    await audit.record(
        session,
        user,
        "acl.changed",
        target_type="collection",
        target_id=collection_id,
        target_label=collection.name,
        before=before,
        after=await _describe(session, result),
        ip=audit.client_ip(request),
    )
    return result


@router.get("/documents/{document_id}/access", response_model=AccessOut)
async def get_document_access(document_id: uuid.UUID, user: Admin, session: DB) -> AccessOut:
    doc = await session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise AppError(status.HTTP_404_NOT_FOUND, "document_not_found")
    if not doc.acl_override:
        inherited = await _grants(session, "collection", doc.collection_id)
        return AccessOut(everyone=inherited.everyone, group_ids=inherited.group_ids, inherit=True)
    return await _grants(session, "document", document_id)


@router.put("/documents/{document_id}/access", response_model=AccessOut)
async def set_document_access(
    document_id: uuid.UUID, body: AccessIn, user: Admin, session: DB, request: Request
) -> AccessOut:
    doc = await session.get(Document, document_id)
    if not doc or doc.deleted_at:
        raise AppError(status.HTTP_404_NOT_FOUND, "document_not_found")
    before = await _describe(session, await get_document_access(document_id, user, session))
    doc.acl_override = not body.inherit
    if body.inherit:
        await session.execute(
            delete(AccessGrant).where(
                AccessGrant.resource_type == "document", AccessGrant.resource_id == document_id
            )
        )
    else:
        await _replace(session, user, "document", document_id, body)
    await session.flush()
    result = await get_document_access(document_id, user, session)
    await audit.record(
        session,
        user,
        "acl.changed",
        target_type="document",
        target_id=document_id,
        target_label=doc.title,
        before=before,
        after=await _describe(session, result),
        ip=audit.client_ip(request),
    )
    return result
