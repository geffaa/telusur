"""One lock for every model forward pass in this process.

The embedder and the reranker share the GPU. Apple's MPS backend aborts the whole process
(MTLCommandBuffer assertion) when two threads submit work at once, which the load test hit
at 5 concurrent users while each model only had its own lock. CUDA is safer but still gains
nothing from interleaving two models on one device, so all inference goes through here.
"""

import threading

INFERENCE_LOCK = threading.Lock()


def pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"
