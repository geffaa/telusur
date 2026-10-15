"""Seed two demo tenants with users, groups, access grants and indexed sample documents.

Identity rows are written as the owner role (bypasses RLS); documents then go through the
normal ingestion pipeline under each tenant.

uv run python -m scripts.seed            # run make_sample_docs first
uv run python -m scripts.seed --no-docs  # identity only
"""

import asyncio
import hashlib
import sys
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text

from app.config import get_settings
from app import storage
from app.ingestion.pipeline import ingest_version
from app.security import hash_password
from scripts.generate_corpus import TOPICS as CORPUS_TOPICS

SAMPLES = Path(__file__).resolve().parents[3] / "samples"

PASSWORD = "telusur123"
TENANTS = {
    "nusantara": "PT Nusantara Sejahtera",
    "garuda": "PT Garuda Logistik",
}
GROUPS = ["Staff", "Manager", "HR", "Finance", "Direksi"]
USERS = [
    # (local part, name, role, groups)
    ("admin", "Rina Admin", "tenant_admin", ["Direksi"]),
    ("hr", "Dewi HR", "knowledge_admin", ["HR", "Manager"]),
    ("finance", "Bayu Finance", "knowledge_admin", ["Finance", "Manager"]),
    ("manager", "Arif Manager", "employee", ["Manager"]),
    ("staff", "Sari Staff", "employee", ["Staff"]),
    ("direksi", "Hendra Direksi", "employee", ["Direksi", "Manager"]),
]
COLLECTIONS = [
    ("Kebijakan HR", "Cuti, perjalanan dinas, benefit, dan kode etik"),
    ("Keuangan", "Reimbursement, pengadaan, dan otorisasi pembayaran"),
    ("IT & Keamanan", "Akses sistem, password, dan perangkat kerja"),
    ("Operasional", "Keselamatan kerja, fasilitas, dan kendaraan"),
]
# (tenant, collection, file, title, groups that may read it; None = inherit collection)
DOCUMENTS = [
    (
        "nusantara",
        "Kebijakan HR",
        "kebijakan-perjalanan-dinas.pdf",
        "Kebijakan Perjalanan Dinas",
        None,
    ),
    ("nusantara", "Kebijakan HR", "kebijakan-cuti.pdf", "Kebijakan Cuti Karyawan", None),
    (
        "nusantara",
        "Kebijakan HR",
        "remunerasi-direksi-2026.pdf",
        "Struktur Remunerasi Direksi 2026",
        ["Direksi"],
    ),
    (
        "nusantara",
        "Keuangan",
        "sop-reimbursement.docx",
        "SOP Reimbursement Biaya Operasional",
        None,
    ),
    (
        "nusantara",
        "IT & Keamanan",
        "kebijakan-password.md",
        "Kebijakan Password dan Akses Sistem",
        None,
    ),
    ("garuda", "Kebijakan HR", "garuda-cuti.md", "Kebijakan Cuti Garuda", None),
    # LLM-generated corpus (scripts/generate_corpus.py), committed for reproducible evaluation.
    *[
        ("nusantara", collection, f"corpus/{slug}.md", title, None)
        for slug, collection, title, _, _ in CORPUS_TOPICS
    ],
]
GARUDA_CUTI = """# Kebijakan Cuti Garuda

## Cuti Tahunan

Karyawan PT Garuda Logistik berhak atas cuti tahunan 14 hari kerja setelah enam bulan bekerja.
"""
MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown",
}


def main() -> None:
    engine = create_engine(get_settings().database_url_owner.replace("+asyncpg", "+psycopg"))
    password_hash = hash_password(PASSWORD)
    ids: dict[tuple[str, str], uuid.UUID] = {}
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE tenants CASCADE"))
        # Dev reset only: TRUNCATE bypasses the append-only row trigger. The app role has
        # no TRUNCATE privilege, so production audit rows stay untouchable.
        conn.execute(text("TRUNCATE audit_logs"))
        for slug, name in TENANTS.items():
            tenant_id = uuid.uuid4()
            conn.execute(
                text("INSERT INTO tenants (id, name, slug, settings) VALUES (:id, :n, :s, '{}')"),
                {"id": tenant_id, "n": name, "s": slug},
            )
            group_ids = {g: uuid.uuid4() for g in GROUPS}
            for group, gid in group_ids.items():
                conn.execute(
                    text("INSERT INTO groups (id, tenant_id, name) VALUES (:id, :t, :n)"),
                    {"id": gid, "t": tenant_id, "n": group},
                )
            admin_id = None
            for local, person, role, groups in USERS:
                uid = uuid.uuid4()
                admin_id = admin_id or uid
                conn.execute(
                    text(
                        "INSERT INTO users (id, tenant_id, name, email, password_hash, role) "
                        "VALUES (:id, :t, :n, :e, :p, :r)"
                    ),
                    {
                        "id": uid,
                        "t": tenant_id,
                        "n": person,
                        "e": f"{local}@{slug}.test",
                        "p": password_hash,
                        "r": role,
                    },
                )
                for group in groups:
                    conn.execute(
                        text(
                            "INSERT INTO group_user (group_id, user_id, tenant_id) VALUES (:g, :u, :t)"
                        ),
                        {"g": group_ids[group], "u": uid, "t": tenant_id},
                    )
            for name, desc in COLLECTIONS:
                cid = uuid.uuid4()
                conn.execute(
                    text(
                        "INSERT INTO collections (id, tenant_id, name, description, created_by) "
                        "VALUES (:id, :t, :n, :d, :u)"
                    ),
                    {"id": cid, "t": tenant_id, "n": name, "d": desc, "u": admin_id},
                )
                conn.execute(
                    text(
                        "INSERT INTO access_grants (id, tenant_id, resource_type, resource_id, "
                        "principal_type) VALUES (:id, :t, 'collection', :r, 'everyone')"
                    ),
                    {"id": uuid.uuid4(), "t": tenant_id, "r": cid},
                )
                ids[(slug, name)] = cid
            ids[(slug, "tenant")] = tenant_id
            ids[(slug, "admin")] = admin_id
            ids.update({(slug, f"group:{g}"): gid for g, gid in group_ids.items()})
    if "--no-docs" not in sys.argv:
        (SAMPLES / "garuda-cuti.md").write_text(GARUDA_CUTI)
        asyncio.run(index_all(seed_documents(engine, ids)))
    print(
        f"Seeded {len(TENANTS)} tenants. Login: workspace=nusantara, "
        f"email=hr@nusantara.test, password={PASSWORD}"
    )


async def index_all(versions) -> None:
    for tenant_id, version_id, name in versions:
        chunks = await ingest_version(tenant_id, version_id)
        print(f"  indexed {name}: {chunks} chunks")


def seed_documents(engine, ids) -> list[tuple[uuid.UUID, uuid.UUID, str]]:
    versions = []
    with engine.begin() as conn:
        for slug, collection, filename, title, groups in DOCUMENTS:
            tenant_id = ids[(slug, "tenant")]
            data = (SAMPLES / filename).read_bytes()
            doc_id, version_id = uuid.uuid4(), uuid.uuid4()
            conn.execute(
                text(
                    "INSERT INTO documents (id, tenant_id, collection_id, title, acl_override, created_by) "
                    "VALUES (:id, :t, :c, :title, :override, :u)"
                ),
                {
                    "id": doc_id,
                    "t": tenant_id,
                    "c": ids[(slug, collection)],
                    "title": title,
                    "override": groups is not None,
                    "u": ids[(slug, "admin")],
                },
            )
            for group in groups or []:
                conn.execute(
                    text(
                        "INSERT INTO access_grants (id, tenant_id, resource_type, resource_id, "
                        "principal_type, principal_id) VALUES (:id, :t, 'document', :r, 'group', :g)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "t": tenant_id,
                        "r": doc_id,
                        "g": ids[(slug, f"group:{group}")],
                    },
                )
            conn.execute(
                text(
                    "INSERT INTO document_versions (id, tenant_id, document_id, version, filename, "
                    "storage_path, mime, size_bytes, sha256, chunk_count, status, is_current) "
                    "VALUES (:id, :t, :d, 1, :f, :p, :m, :size, :sha, 0, 'queued', false)"
                ),
                {
                    "id": version_id,
                    "t": tenant_id,
                    "d": doc_id,
                    "f": Path(filename).name,
                    "p": storage.save(tenant_id, version_id, Path(filename).name, data),
                    "m": MIME[Path(filename).suffix],
                    "size": len(data),
                    "sha": hashlib.sha256(data).hexdigest(),
                },
            )
            versions.append((tenant_id, version_id, f"{slug}/{filename}"))
    return versions


if __name__ == "__main__":
    main()
