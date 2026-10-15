"""initial schema: tenants, identity, documents, chunks, RLS

Revision ID: 0001
Revises:
"""
from alembic import op

from app.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = [
    "users",
    "groups",
    "group_user",
    "collections",
    "documents",
    "document_versions",
    "chunks",
]


def upgrade() -> None:
    bind = op.get_bind()
    tables = [Base.metadata.tables[t] for t in ["tenants", *TENANT_TABLES]]
    Base.metadata.create_all(bind, tables=tables)

    op.execute("CREATE UNIQUE INDEX users_tenant_email ON users (tenant_id, lower(email))")
    op.execute("CREATE UNIQUE INDEX groups_tenant_name ON groups (tenant_id, name)")
    op.execute("CREATE INDEX document_versions_sha ON document_versions (tenant_id, sha256)")
    op.execute(
        "CREATE UNIQUE INDEX document_versions_one_current ON document_versions (document_id) "
        "WHERE is_current"
    )

    # Lexical side of hybrid search. 'simple' config: no stemming, works for ID + EN.
    op.execute(
        "ALTER TABLE chunks ADD COLUMN tsv tsvector GENERATED ALWAYS AS "
        "(to_tsvector('simple', coalesce(heading_path, '') || ' ' || content)) STORED"
    )
    op.execute("CREATE INDEX chunks_tsv ON chunks USING gin (tsv)")
    op.execute(
        "CREATE INDEX chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops)"
    )

    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) "
            "WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)"
        )

    # The app role may read tenants (to resolve a workspace slug at login) but not change them.
    op.execute("GRANT SELECT ON tenants TO telusur_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON " + ", ".join(TENANT_TABLES) + " TO telusur_app"
    )
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO telusur_app")


def downgrade() -> None:
    tables = [Base.metadata.tables[t] for t in ["tenants", *TENANT_TABLES]]
    Base.metadata.drop_all(op.get_bind(), tables=tables)
    op.execute("DROP TYPE IF EXISTS user_role, version_status")
