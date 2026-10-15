"""arq worker: `uv run arq app.worker.WorkerSettings`."""

import logging
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.ingestion.pipeline import ingest_version as run_ingest
from app.queue import redis_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("telusur.worker")


async def ingest_version(ctx, tenant_id: str, version_id: str) -> int:
    return await run_ingest(uuid.UUID(tenant_id), uuid.UUID(version_id))


async def run_eval(ctx, tenant_id: str, run_id: str) -> dict:
    from app.eval.runner import run

    return await run(uuid.UUID(tenant_id), uuid.UUID(run_id))


async def requeue_stuck(ctx) -> None:
    """Re-enqueue versions left mid-pipeline by a crashed worker.

    Runs as the owner role because it must see every tenant; the job itself then runs
    under the version's own tenant like any other job.
    """
    engine = create_async_engine(get_settings().database_url_owner)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT tenant_id, id FROM document_versions "
                    "WHERE status IN ('queued', 'parsing', 'embedding')"
                )
            )
        ).all()
    await engine.dispose()
    for tenant_id, version_id in rows:
        await ctx["redis"].enqueue_job(
            "ingest_version",
            str(tenant_id),
            str(version_id),
            _job_id=f"ingest:{version_id}:recover:{uuid.uuid4().hex[:8]}",
        )
    if rows:
        log.info("requeued %d unfinished versions", len(rows))


async def startup(ctx) -> None:
    # Load the embedding model once per worker instead of on the first job.
    from app.ingestion.embedder import get_embedder

    get_embedder()
    await requeue_stuck(ctx)


class WorkerSettings:
    functions = [ingest_version, run_eval]  # noqa: RUF012 - arq reads it as a class attribute
    on_startup = startup
    redis_settings = redis_settings()
    max_jobs = 2
    job_timeout = 60 * 90  # answer evaluation waits out free-tier rate limits
    max_tries = 3
