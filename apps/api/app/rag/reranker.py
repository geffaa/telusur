"""Local cross-encoder reranker (bge-reranker-v2-m3): scores how well each passage
answers the question, far more precisely than embedding similarity alone."""

import os
import threading
from functools import lru_cache

from app.config import get_settings

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


class Reranker:
    def __init__(self, model_name: str) -> None:
        import torch
        from sentence_transformers import CrossEncoder

        device = (
            "cuda"
            if torch.cuda.is_available()
            else "mps"
            if torch.backends.mps.is_available()
            else "cpu"
        )
        self.model = CrossEncoder(model_name, device=device, max_length=512)
        self._lock = threading.Lock()

    def score(self, query: str, passages: list[str]) -> list[float]:
        """Relevance in 0..1 (sigmoid of the cross-encoder logit) per passage."""
        if not passages:
            return []
        with self._lock:
            scores = self.model.predict([(query, p) for p in passages], batch_size=16)
        return [float(s) for s in scores]


@lru_cache
def get_reranker() -> Reranker:
    return Reranker(get_settings().reranker_model)
