from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    database_url_owner: str
    redis_url: str = "redis://localhost:6390"
    jwt_secret: str
    jwt_ttl_minutes: int = 60 * 8
    storage_dir: Path = Path("./storage")
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024
    cors_origins: str = "http://localhost:3000"
    max_upload_mb: int = 50

    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    # Fused candidates passed to the cross-encoder; its cost grows linearly with this.
    rerank_candidates: int = 20
    # Below this reranker score (0..1) the assistant says it does not know instead of
    # answering, so weak matches never become confident-sounding answers. Calibrated on the
    # eval set (python -m app.eval): 0.34-0.40 refused all 13 negative cases while wrongly
    # refusing 1 of 58 answerable ones. Recalibrate when the test set grows.
    relevance_threshold: float = 0.35

    # LLM providers, tried in order: the next one is used when one is rate-limited or down.
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    groq_fast_model: str = "openai/gpt-oss-20b"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    ollama_url: str | None = None  # e.g. http://localhost:11434
    ollama_model: str = "qwen2.5:7b"

    # Load testing only: replace every LLM call with a canned reply after a realistic delay,
    # so the test measures this system (embedding, search, rerank, DB), not a provider's
    # free-tier rate limit. Never enable in production.
    fake_llm: bool = False
    fake_llm_first_token_ms: int = 700
    fake_llm_tokens_per_s: int = 250


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
