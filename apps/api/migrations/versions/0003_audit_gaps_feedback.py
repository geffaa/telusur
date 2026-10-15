"""audit log (partitioned, append-only), knowledge gaps, feedback

Revision ID: 0003
Revises: 0002
"""

from datetime import date

from alembic import op

from app.models import Feedback, KnowledgeGap

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

RLS = (
    "CREATE POLICY tenant_isolation ON {t} "
    "USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) "
    "WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)"
)


def _months(start: date, count: int):
    y, m = start.year, start.month
    for _ in range(count):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        yield f"{y}_{m:02d}", f"{y}-{m:02d}-01", f"{ny}-{nm:02d}-01"
        y, m = ny, nm


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE audit_logs (
            id uuid NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            tenant_id uuid NOT NULL,
            actor_id uuid,
            actor_name varchar(200),
            action varchar(64) NOT NULL,
            target_type varchar(32),
            target_id varchar(64),
            target_label varchar(300),
            before jsonb,
            after jsonb,
            meta jsonb NOT NULL DEFAULT '{}',
            ip varchar(64),
            PRIMARY KEY (id, created_at)
        ) PARTITION BY RANGE (created_at)
        """
    )
    # Monthly partitions for two years; anything later lands in the default partition
    # until an ops job adds more (see README).
    for suffix, start, end in _months(date(2026, 1, 1), 24):
        op.execute(
            f"CREATE TABLE audit_logs_{suffix} PARTITION OF audit_logs "
            f"FOR VALUES FROM ('{start}') TO ('{end}')"
        )
    op.execute("CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT")
    op.execute("CREATE INDEX audit_logs_tenant_time ON audit_logs (tenant_id, created_at DESC)")
    op.execute("CREATE INDEX audit_logs_tenant_action ON audit_logs (tenant_id, action, created_at DESC)")
    op.execute(
        """
        CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is append-only';
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs "
        "FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable()"
    )
    op.execute("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY")
    op.execute(RLS.format(t="audit_logs"))
    op.execute("GRANT SELECT, INSERT ON audit_logs TO telusur_app")

    bind = op.get_bind()
    for model in (KnowledgeGap, Feedback):
        model.__table__.create(bind)
        t = model.__tablename__
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        op.execute(RLS.format(t=t))
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {t} TO telusur_app")
    op.execute("CREATE INDEX knowledge_gaps_open ON knowledge_gaps (tenant_id, created_at DESC) WHERE resolved_at IS NULL")
    op.execute("CREATE UNIQUE INDEX feedback_one_per_user ON feedback (message_id, user_id)")


def downgrade() -> None:
    bind = op.get_bind()
    for model in (Feedback, KnowledgeGap):
        model.__table__.drop(bind)
    op.execute("DROP TABLE audit_logs CASCADE")
    op.execute("DROP FUNCTION audit_logs_immutable")
