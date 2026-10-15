"""Write audit events in the caller's transaction, so an action and its audit row
commit (or roll back) together."""

import json
import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser
from app.models import AuditLog, User


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    return (
        forwarded.split(",")[0].strip()
        if forwarded
        else request.client.host
        if request.client
        else None
    )


def _jsonable(value: Any) -> Any:
    return None if value is None else json.loads(json.dumps(value, default=str))


async def record(
    session: AsyncSession,
    user: CurrentUser,
    action: str,
    *,
    target_type: str | None = None,
    target_id: uuid.UUID | str | None = None,
    target_label: str | None = None,
    before: Any = None,
    after: Any = None,
    meta: dict | None = None,
    ip: str | None = None,
) -> None:
    actor = await session.get(User, user.id)
    session.add(
        AuditLog(
            tenant_id=user.tenant_id,
            actor_id=user.id,
            actor_name=actor.name if actor else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            target_label=(target_label or "")[:300] or None,
            before=_jsonable(before),
            after=_jsonable(after),
            meta=_jsonable(meta) or {},
            ip=ip,
        )
    )
