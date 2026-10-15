"""Users and groups. Tenant Admins manage people; Knowledge Admins can use the access
checker to see what a given person would get from the assistant."""

import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app import audit
from app.acl import Reader, readable_document_ids
from app.config import get_settings
from app.deps import DB, Admin, TenantAdmin
from app.models import AccessGrant, Collection, Document, Group, GroupUser, Role
from app.models import User as UserModel
from app.rag.retrieval import retrieve
from app.security import hash_password

router = APIRouter(tags=["people"])


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: Role
    group_ids: list[uuid.UUID]
    created_at: datetime


class UserIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+$")
    role: Role = Role.employee
    group_ids: list[uuid.UUID] = []


class UserCreated(UserOut):
    temporary_password: str


class UserPatch(BaseModel):
    role: Role | None = None
    group_ids: list[uuid.UUID] | None = None


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


async def _memberships(session) -> dict[uuid.UUID, list[uuid.UUID]]:
    out: dict[uuid.UUID, list[uuid.UUID]] = {}
    for uid, gid in await session.execute(select(GroupUser.user_id, GroupUser.group_id)):
        out.setdefault(uid, []).append(gid)
    return out


async def _group_names(session, ids) -> list[str]:
    return sorted(await session.scalars(select(Group.name).where(Group.id.in_(list(ids)))))


def _out(u: UserModel, groups: list[uuid.UUID]) -> UserOut:
    return UserOut(
        id=u.id, name=u.name, email=u.email, role=u.role, group_ids=groups, created_at=u.created_at
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(user: Admin, session: DB) -> list[UserOut]:
    members = await _memberships(session)
    users = await session.scalars(select(UserModel).order_by(UserModel.name))
    return [_out(u, members.get(u.id, [])) for u in users]


async def _set_groups(session, tenant_id, user_id, group_ids) -> None:
    valid = set(await session.scalars(select(Group.id).where(Group.id.in_(group_ids))))
    if len(valid) != len(set(group_ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Grup tidak dikenal")
    await session.execute(delete(GroupUser).where(GroupUser.user_id == user_id))
    for gid in valid:
        session.add(GroupUser(group_id=gid, user_id=user_id, tenant_id=tenant_id))


@router.post("/users", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserIn, user: TenantAdmin, session: DB, request: Request
) -> UserCreated:
    exists = await session.scalar(
        select(UserModel.id).where(func.lower(UserModel.email) == body.email.lower())
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah terdaftar")
    password = secrets.token_urlsafe(9)
    new = UserModel(
        tenant_id=user.tenant_id,
        name=body.name.strip(),
        email=body.email.strip().lower(),
        password_hash=hash_password(password),
        role=body.role,
    )
    session.add(new)
    await session.flush()
    await _set_groups(session, user.tenant_id, new.id, body.group_ids)
    await session.refresh(new)
    await audit.record(
        session,
        user,
        "user.created",
        target_type="user",
        target_id=new.id,
        target_label=new.email,
        after={"role": new.role.value, "groups": await _group_names(session, body.group_ids)},
        ip=audit.client_ip(request),
    )
    return UserCreated(**_out(new, body.group_ids).model_dump(), temporary_password=password)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID, body: UserPatch, user: TenantAdmin, session: DB, request: Request
) -> UserOut:
    target = await session.get(UserModel, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pengguna tidak ditemukan")
    members = await _memberships(session)
    current_groups = members.get(user_id, [])

    if body.role and body.role != target.role:
        if target.role == Role.tenant_admin:
            admins = await session.scalar(
                select(func.count()).where(UserModel.role == Role.tenant_admin)
            )
            if admins <= 1:
                raise HTTPException(status.HTTP_409_CONFLICT, "Harus ada minimal satu Tenant Admin")
        await audit.record(
            session,
            user,
            "user.role_changed",
            target_type="user",
            target_id=target.id,
            target_label=target.email,
            before={"role": target.role.value},
            after={"role": body.role.value},
            ip=audit.client_ip(request),
        )
        target.role = body.role

    if body.group_ids is not None and set(body.group_ids) != set(current_groups):
        before = await _group_names(session, current_groups)
        await _set_groups(session, user.tenant_id, user_id, body.group_ids)
        await audit.record(
            session,
            user,
            "user.groups_changed",
            target_type="user",
            target_id=target.id,
            target_label=target.email,
            before={"groups": before},
            after={"groups": await _group_names(session, body.group_ids)},
            ip=audit.client_ip(request),
        )
        current_groups = body.group_ids
    await session.flush()
    return _out(target, list(current_groups))


@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupIn, user: TenantAdmin, session: DB, request: Request) -> dict:
    group = Group(tenant_id=user.tenant_id, name=body.name.strip())
    session.add(group)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nama grup sudah dipakai") from exc
    await audit.record(
        session,
        user,
        "group.created",
        target_type="group",
        target_id=group.id,
        target_label=group.name,
        ip=audit.client_ip(request),
    )
    return {"id": str(group.id), "name": group.name}


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID, user: TenantAdmin, session: DB, request: Request
) -> None:
    group = await session.get(Group, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grup tidak ditemukan")
    grants = await session.scalar(select(func.count()).where(AccessGrant.principal_id == group_id))
    if grants:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Grup masih dipakai di {grants} pengaturan akses. Ubah aksesnya dulu.",
        )
    await session.delete(group)
    await audit.record(
        session,
        user,
        "group.deleted",
        target_type="group",
        target_id=group_id,
        target_label=group.name,
        ip=audit.client_ip(request),
    )


class AccessCheckIn(BaseModel):
    user_id: uuid.UUID
    question: str | None = Field(None, max_length=2000)


@router.post("/access-check")
async def access_check(body: AccessCheckIn, user: Admin, session: DB, request: Request) -> dict:
    """What would this person see? Read-only: lists readable documents and, for a question,
    the passages retrieval would hand to the model, without calling the model."""
    target = await session.get(UserModel, body.user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pengguna tidak ditemukan")
    groups = (await _memberships(session)).get(target.id, [])
    reader = Reader(target.id, tuple(groups))
    readable = await readable_document_ids(session, reader)
    docs = (
        await session.execute(
            select(Document.id, Document.title, Collection.name)
            .join(Collection, Collection.id == Document.collection_id)
            .where(Document.deleted_at.is_(None))
            .order_by(Collection.name, Document.title)
        )
    ).all()

    result = None
    if body.question:
        retrieval = await retrieve(session, reader, body.question)
        top = retrieval.candidates[0].score if retrieval.candidates else 0.0
        result = {
            "would_refuse": top < get_settings().relevance_threshold,
            "top_score": round(top, 3),
            "passages": [
                {
                    "title": c.title,
                    "heading_path": c.heading_path,
                    "page": c.page_start,
                    "score": round(c.score, 3),
                    "preview": c.content[:240],
                }
                for c in retrieval.candidates
            ],
        }
    await audit.record(
        session,
        user,
        "access.checked",
        target_type="user",
        target_id=target.id,
        target_label=target.email,
        meta={"question": body.question},
        ip=audit.client_ip(request),
    )
    return {
        "user": {"id": str(target.id), "name": target.name, "role": target.role.value},
        "groups": await _group_names(session, groups),
        "documents": [
            {"id": str(i), "title": t, "collection": c, "readable": i in readable}
            for i, t, c in docs
        ],
        "retrieval": result,
    }
