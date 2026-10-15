from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings
from app.models import Base

# Migrations run as the owner role; the app role is subject to RLS.
url = get_settings().database_url_owner.replace("+asyncpg", "+psycopg")


def run_migrations_online() -> None:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
