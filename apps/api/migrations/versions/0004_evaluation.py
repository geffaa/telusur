"""evaluation: cases, runs, results

Revision ID: 0004
Revises: 0003
"""

from alembic import op

from app.models import EvalCase, EvalResult, EvalRun

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

TABLES = [EvalCase, EvalRun, EvalResult]


def upgrade() -> None:
    bind = op.get_bind()
    for model in TABLES:
        model.__table__.create(bind)
        t = model.__tablename__
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {t} "
            "USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) "
            "WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {t} TO telusur_app")


def downgrade() -> None:
    bind = op.get_bind()
    for model in reversed(TABLES):
        model.__table__.drop(bind)
