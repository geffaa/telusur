import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import tenant_session
from app.models import Role
from app.security import decode_token

COOKIE_NAME = "telusur_token"


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    tenant_id: uuid.UUID
    role: Role

    @property
    def can_manage_knowledge(self) -> bool:
        return self.role in (Role.knowledge_admin, Role.tenant_admin)


def current_user(
    authorization: Annotated[str | None, Header()] = None,
    telusur_token: Annotated[str | None, Cookie()] = None,
) -> CurrentUser:
    token = telusur_token
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Belum login")
    try:
        claims = decode_token(token)
        return CurrentUser(uuid.UUID(claims["sub"]), uuid.UUID(claims["tid"]), Role(claims["role"]))
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi tidak valid") from exc


def knowledge_admin(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if not user.can_manage_knowledge:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Butuh peran Knowledge Admin")
    return user


async def db(user: Annotated[CurrentUser, Depends(current_user)]) -> AsyncIterator[AsyncSession]:
    async with tenant_session(user.tenant_id) as session:
        yield session


User = Annotated[CurrentUser, Depends(current_user)]
Admin = Annotated[CurrentUser, Depends(knowledge_admin)]
DB = Annotated[AsyncSession, Depends(db)]


def tenant_admin(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if user.role != Role.tenant_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Butuh peran Tenant Admin")
    return user


TenantAdmin = Annotated[CurrentUser, Depends(tenant_admin)]
