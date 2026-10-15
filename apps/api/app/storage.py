"""File storage behind a tiny interface so S3/MinIO can replace the local disk later."""

import uuid
from pathlib import Path

from app.config import get_settings


def _safe_name(filename: str) -> str:
    name = Path(filename).name
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)[:200] or "file"


def save(tenant_id: uuid.UUID, version_id: uuid.UUID, filename: str, data: bytes) -> str:
    relative = Path(str(tenant_id)) / str(version_id) / _safe_name(filename)
    target = get_settings().storage_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return str(relative)


def path_for(storage_path: str) -> Path:
    root = get_settings().storage_dir.resolve()
    resolved = (root / storage_path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError("storage path escapes storage root")
    return resolved
