import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import tenant_session
from app.i18n import AppError
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
        raise AppError(status.HTTP_401_UNAUTHORIZED, "not_logged_in")
    try:
        claims = decode_token(token)
        return CurrentUser(uuid.UUID(claims["sub"]), uuid.UUID(claims["tid"]), Role(claims["role"]))
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise AppError(status.HTTP_401_UNAUTHORIZED, "invalid_session") from exc


def knowledge_admin(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if not user.can_manage_knowledge:
        raise AppError(status.HTTP_403_FORBIDDEN, "needs_knowledge_admin")
    return user


async def db(user: Annotated[CurrentUser, Depends(current_user)]) -> AsyncIterator[AsyncSession]:
    async with tenant_session(user.tenant_id) as session:
        yield session


User = Annotated[CurrentUser, Depends(current_user)]
Admin = Annotated[CurrentUser, Depends(knowledge_admin)]
DB = Annotated[AsyncSession, Depends(db)]


def tenant_admin(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if user.role != Role.tenant_admin:
        raise AppError(status.HTTP_403_FORBIDDEN, "needs_tenant_admin")
    return user


TenantAdmin = Annotated[CurrentUser, Depends(tenant_admin)]
