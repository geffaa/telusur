"""Who may read which document.

A document is readable when a grant matches the reader on its collection, or on the
document itself when `acl_override` is set. Grants are evaluated live against current
group membership, so revoking access takes effect on the very next query.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser
from app.models import GroupUser


@dataclass(frozen=True)
class Reader:
    user_id: uuid.UUID
    group_ids: tuple[uuid.UUID, ...]

    @property
    def params(self) -> dict:
        return {"acl_user": self.user_id, "acl_groups": list(self.group_ids)}


async def reader_for(session: AsyncSession, user: CurrentUser) -> Reader:
    groups = await session.scalars(select(GroupUser.group_id).where(GroupUser.user_id == user.id))
    return Reader(user.id, tuple(groups))


GRANT_MATCHES_READER = """
    (g.principal_type = 'everyone'
     OR (g.principal_type = 'group' AND g.principal_id = ANY(CAST(:acl_groups AS uuid[])))
     OR (g.principal_type = 'user' AND g.principal_id = :acl_user))
"""

# CTE body: ids of the documents the reader may see. Use with `reader.params`.
READABLE_DOCUMENTS = f"""
    SELECT d.id
    FROM documents d
    WHERE d.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM access_grants g
        WHERE ((NOT d.acl_override AND g.resource_type = 'collection' AND g.resource_id = d.collection_id)
            OR (d.acl_override AND g.resource_type = 'document' AND g.resource_id = d.id))
          AND {GRANT_MATCHES_READER}
      )
"""


async def readable_document_ids(session: AsyncSession, reader: Reader) -> set[uuid.UUID]:
    rows = await session.scalars(text(READABLE_DOCUMENTS), reader.params)
    return set(rows)


async def can_read_document(session: AsyncSession, reader: Reader, document_id: uuid.UUID) -> bool:
    row = await session.scalar(
        text(f"SELECT 1 FROM ({READABLE_DOCUMENTS}) r WHERE r.id = :doc"),
        {**reader.params, "doc": document_id},
    )
    return row is not None


async def readable_collection_ids(session: AsyncSession, reader: Reader) -> set[uuid.UUID]:
    """Collections granted to the reader, plus collections holding a document they can read."""
    rows = await session.scalars(
        text(
            f"""
            SELECT g.resource_id FROM access_grants g
            WHERE g.resource_type = 'collection' AND {GRANT_MATCHES_READER}
            UNION
            SELECT d.collection_id FROM documents d WHERE d.id IN ({READABLE_DOCUMENTS})
            """
        ),
        reader.params,
    )
    return set(rows)
