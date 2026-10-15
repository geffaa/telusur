"""Local embedding model (bge-m3): free, multilingual, no data leaves the server."""

import os
import threading
from functools import lru_cache

from app.config import get_settings

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


class Embedder:
    def __init__(self, model_name: str) -> None:
        import torch
        from sentence_transformers import SentenceTransformer

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        if torch.cuda.is_available():
            device = "cuda"
        self.model = SentenceTransformer(model_name, device=device)
        self.tokenizer = self.model.tokenizer
        self.dim = self.model.get_embedding_dimension()
        # The GPU (MPS) backend crashes on concurrent forward passes; one at a time.
        self._lock = threading.Lock()

    def count_tokens(self, text: str) -> int:
        return len(self.tokenizer.encode(text, add_special_tokens=False))

    def embed(self, texts: list[str], batch_size: int = 16) -> list[list[float]]:
        with self._lock:
            vectors = self.model.encode(
                texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=False
            )
        return vectors.tolist()


@lru_cache
def get_embedder() -> Embedder:
    return Embedder(get_settings().embedding_model)
