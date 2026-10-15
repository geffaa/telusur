from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import audit
from app.config import get_settings
from app.db import SessionLocal, tenant_session
from app.deps import COOKIE_NAME, DB, CurrentUser, User
from app.models import Tenant
from app.models import User as UserModel
from app.security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    workspace: str
    email: str = Field(min_length=3, max_length=320)
    password: str


class MeOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    tenant_name: str
    tenant_slug: str


INVALID = HTTPException(status.HTTP_401_UNAUTHORIZED, "Workspace, email, atau password salah")


@router.post("/login")
async def login(body: LoginIn, response: Response, request: Request) -> dict:
    async with SessionLocal() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.slug == body.workspace.lower()))
    if not tenant:
        raise INVALID
    async with tenant_session(tenant.id) as session:
        user = await session.scalar(
            select(UserModel).where(func.lower(UserModel.email) == body.email.lower())
        )
    if not user or not verify_password(user.password_hash, body.password):
        raise INVALID
    async with tenant_session(tenant.id) as session:
        await audit.record(
            session,
            CurrentUser(user.id, tenant.id, user.role),
            "auth.login",
            ip=audit.client_ip(request),
            meta={"user_agent": request.headers.get("user-agent", "")[:200]},
        )
    token = create_token(user.id, tenant.id, user.role.value)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=not get_settings().cors_origins.startswith("http://localhost"),
        max_age=get_settings().jwt_ttl_minutes * 60,
    )
    return {"token": token}


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=MeOut)
async def me(user: User, session: DB) -> MeOut:
    row = await session.get(UserModel, user.id)
    tenant = await session.get(Tenant, user.tenant_id)
    if not row or not tenant:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User tidak ditemukan")
    return MeOut(
        id=str(row.id),
        name=row.name,
        email=row.email,
        role=row.role.value,
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
    )
