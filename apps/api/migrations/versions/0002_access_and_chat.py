"""access grants, conversations, messages, citations

Revision ID: 0002
Revises: 0001
"""

from alembic import op

from app.models import AccessGrant, Conversation, Message, MessageCitation

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = [AccessGrant, Conversation, Message, MessageCitation]


def upgrade() -> None:
    bind = op.get_bind()
    for model in TABLES:
        model.__table__.create(bind)
    op.execute(
        "CREATE UNIQUE INDEX access_grants_unique ON access_grants "
        "(resource_type, resource_id, principal_type, coalesce(principal_id, "
        "'00000000-0000-0000-0000-000000000000'::uuid))"
    )
    op.execute("CREATE INDEX messages_conversation_created ON messages (conversation_id, created_at)")
    op.execute("CREATE INDEX conversations_user_updated ON conversations (user_id, updated_at DESC)")
    for model in TABLES:
        table = model.__tablename__
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) "
            "WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO telusur_app")


def downgrade() -> None:
    bind = op.get_bind()
    for model in reversed(TABLES):
        model.__table__.drop(bind)
    op.execute("DROP TYPE IF EXISTS principal_type")
