import uuid

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import get_settings

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def enqueue_ingest(tenant_id: uuid.UUID, version_id: uuid.UUID, retry: bool = False) -> None:
    global _pool
    if _pool is None:
        _pool = await create_pool(redis_settings())
    # Job id = version id, so a double click never queues the same version twice.
    await _pool.enqueue_job(
        "ingest_version",
        str(tenant_id),
        str(version_id),
        _job_id=f"ingest:{version_id}" + (f":retry:{uuid.uuid4().hex[:8]}" if retry else ""),
    )


async def enqueue_eval(tenant_id: uuid.UUID, run_id: uuid.UUID) -> None:
    global _pool
    if _pool is None:
        _pool = await create_pool(redis_settings())
    await _pool.enqueue_job("run_eval", str(tenant_id), str(run_id), _job_id=f"eval:{run_id}")
