import csv
import io
import json
import uuid
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import distinct, or_, select

from app.deps import DB, TenantAdmin
from app.models import AuditLog

router = APIRouter(tags=["audit"])

EXPORT_LIMIT = 10_000


class AuditOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: str
    target_type: str | None
    target_id: str | None
    target_label: str | None
    before: dict | None
    after: dict | None
    meta: dict
    ip: str | None


class AuditPage(BaseModel):
    items: list[AuditOut]
    next_before: datetime | None  # pass as `before` for the next page


def _query(
    action: str | None,
    actor_id: uuid.UUID | None,
    q: str | None,
    since: datetime | None,
    until: datetime | None,
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        query = query.where(AuditLog.action.startswith(action))
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    if q:
        like = f"%{q}%"
        query = query.where(or_(AuditLog.target_label.ilike(like), AuditLog.actor_name.ilike(like)))
    if since:
        query = query.where(AuditLog.created_at >= since)
    if until:
        query = query.where(AuditLog.created_at < until)
    return query


@router.get("/audit-logs", response_model=AuditPage)
async def list_audit(
    user: TenantAdmin,
    session: DB,
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    q: str | None = None,
    since: datetime | None = None,
    before: datetime | None = None,
    limit: int = 50,
) -> AuditPage:
    limit = min(max(limit, 1), 200)
    rows = list(await session.scalars(_query(action, actor_id, q, since, before).limit(limit + 1)))
    more = len(rows) > limit
    rows = rows[:limit]
    return AuditPage(
        items=[AuditOut.model_validate(r, from_attributes=True) for r in rows],
        next_before=rows[-1].created_at if more else None,
    )


@router.get("/audit-logs/actions")
async def audit_actions(user: TenantAdmin, session: DB) -> list[str]:
    return sorted(await session.scalars(select(distinct(AuditLog.action))))


@router.get("/audit-logs/export.csv")
async def export_audit(
    user: TenantAdmin,
    session: DB,
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    q: str | None = None,
    since: datetime | None = None,
    before: datetime | None = None,
) -> StreamingResponse:
    rows = await session.scalars(_query(action, actor_id, q, since, before).limit(EXPORT_LIMIT))
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["waktu", "pelaku", "aksi", "target_tipe", "target", "sebelum", "sesudah", "detail", "ip"]
    )
    for r in rows:
        writer.writerow(
            [
                r.created_at.isoformat(),
                r.actor_name or "",
                r.action,
                r.target_type or "",
                r.target_label or r.target_id or "",
                json.dumps(r.before, ensure_ascii=False) if r.before else "",
                json.dumps(r.after, ensure_ascii=False) if r.after else "",
                json.dumps(r.meta, ensure_ascii=False) if r.meta else "",
                r.ip or "",
            ]
        )
    return StreamingResponse(
        iter(["﻿" + buffer.getvalue()]),  # BOM so Excel reads UTF-8
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
    )
