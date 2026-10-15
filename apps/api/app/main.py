import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    access,
    audit_logs,
    auth,
    chat,
    collections,
    documents,
    evaluation,
    feedback,
    gaps,
    overview,
    people,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load both models before the first question instead of during it (~6 s cold start).
    from app.ingestion.embedder import get_embedder
    from app.rag.reranker import get_reranker

    await asyncio.to_thread(get_embedder)
    await asyncio.to_thread(get_reranker)
    yield


app = FastAPI(title="Telusur API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(collections.router)
app.include_router(documents.router)
app.include_router(overview.router)
app.include_router(access.router)
app.include_router(chat.router)
for module in (feedback, gaps, audit_logs, people, evaluation):
    app.include_router(module.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
