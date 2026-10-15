import uuid

import pytest
from sqlalchemy import func, select, text

from app.db import SessionLocal, tenant_session
from app.ingestion.pipeline import ingest_version
from app.models import Chunk, Collection, Document, Tenant
from app.routers import documents as documents_router
from tests.conftest import PASSWORD, login


async def tenant_id(slug: str) -> uuid.UUID:
    async with SessionLocal() as s:
        return await s.scalar(select(Tenant.id).where(Tenant.slug == slug))


async def test_login_errors_do_not_reveal_which_part_is_wrong(client):
    bad_password = await client.post(
        "/auth/login",
        json={"workspace": "nusantara", "email": "hr@nusantara.test", "password": "salah"},
    )
    bad_workspace = await client.post(
        "/auth/login",
        json={"workspace": "tidak-ada", "email": "hr@nusantara.test", "password": PASSWORD},
    )
    assert bad_password.status_code == bad_workspace.status_code == 401
    assert bad_password.json() == bad_workspace.json()


async def test_requests_without_token_are_rejected(client):
    assert (await client.get("/collections")).status_code == 401
    bad = {"Authorization": "Bearer not-a-jwt"}
    assert (await client.get("/collections", headers=bad)).status_code == 401


async def test_employee_cannot_upload_or_create_collections(client):
    headers = await login(client, "nusantara", "staff")
    collections = (await client.get("/collections", headers=headers)).json()
    res = await client.post(
        f"/collections/{collections[0]['id']}/documents",
        headers=headers,
        files={"file": ("x.md", b"# x\n\nisi", "text/markdown")},
    )
    assert res.status_code == 403
    res = await client.post("/collections", headers=headers, json={"name": "Baru"})
    assert res.status_code == 403


async def test_tenant_cannot_see_other_tenant_resources(client):
    nusantara = await login(client, "nusantara", "hr")
    garuda = await login(client, "garuda", "hr")
    nusantara_cols = (await client.get("/collections", headers=nusantara)).json()
    garuda_cols = (await client.get("/collections", headers=garuda)).json()
    assert {c["id"] for c in nusantara_cols}.isdisjoint({c["id"] for c in garuda_cols})

    foreign = nusantara_cols[0]["id"]
    assert (await client.get(f"/collections/{foreign}", headers=garuda)).status_code == 404
    assert (await client.get(f"/collections/{foreign}/documents", headers=garuda)).json() == []
    upload = await client.post(
        f"/collections/{foreign}/documents",
        headers=garuda,
        files={"file": ("x.md", b"# x\n\nisi", "text/markdown")},
    )
    assert upload.status_code == 404


async def test_rls_blocks_queries_that_forget_the_tenant_filter():
    nusantara, garuda = await tenant_id("nusantara"), await tenant_id("garuda")
    async with tenant_session(nusantara) as s:
        nusantara_cols = await s.scalar(select(func.count(Collection.id)))
    async with tenant_session(garuda) as s:
        # Unfiltered query: RLS must still only return garuda's rows.
        tenants = set(await s.scalars(select(Collection.tenant_id)))
        assert tenants == {garuda}
    assert nusantara_cols and nusantara_cols > 0

    async with SessionLocal() as s:  # no tenant set at all
        assert await s.scalar(select(func.count(Collection.id))) == 0
        assert await s.scalar(select(func.count(Chunk.id))) == 0


async def test_rls_rejects_writes_into_another_tenant():
    nusantara, garuda = await tenant_id("nusantara"), await tenant_id("garuda")
    with pytest.raises(Exception, match="row-level security"):
        async with tenant_session(garuda) as s:
            s.add(Collection(tenant_id=nusantara, name="Selundupan"))
            await s.flush()


async def test_upload_ingest_and_chunk_preview(client, monkeypatch):
    queued: list[tuple[uuid.UUID, uuid.UUID]] = []

    async def fake_enqueue(tenant, version, retry=False):
        queued.append((tenant, version))

    monkeypatch.setattr(documents_router, "enqueue_ingest", fake_enqueue)
    headers = await login(client, "garuda", "hr")
    col = (
        await client.post("/collections", headers=headers, json={"name": f"Test {uuid.uuid4()}"})
    ).json()
    body = f"# Panduan Gudang {uuid.uuid4()}\n\n## Jam Operasional\n\nGudang buka 07.00-19.00.\n\n## Forklift\n\n| Tipe | Kapasitas |\n|---|---|\n| A | 2 ton |\n"
    res = await client.post(
        f"/collections/{col['id']}/documents",
        headers=headers,
        files={"file": ("panduan_gudang.md", body.encode(), "text/markdown")},
    )
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["title"] == "Panduan gudang"
    assert doc["latest"]["status"] == "queued" and doc["current"] is None

    tenant, version = queued[0]
    assert await ingest_version(tenant, version) == 2

    doc = (await client.get(f"/documents/{doc['id']}", headers=headers)).json()
    assert doc["current"]["status"] == "ready" and doc["current"]["chunk_count"] == 2
    chunks = (await client.get(f"/documents/{doc['id']}/chunks", headers=headers)).json()
    assert [c["kind"] for c in chunks] == ["text", "table"]
    assert chunks[0]["heading_path"].endswith("> Jam Operasional")
    assert chunks[-1]["heading_path"].endswith("> Forklift")

    duplicate = await client.post(
        f"/collections/{col['id']}/documents",
        headers=headers,
        files={"file": ("lagi.md", body.encode(), "text/markdown")},
    )
    assert duplicate.status_code == 409

    async with tenant_session(tenant) as s:
        await s.execute(text("DELETE FROM collections WHERE id = :id"), {"id": col["id"]})
        assert (
            await s.scalar(
                select(func.count(Document.id)).where(Document.collection_id == col["id"])
            )
            == 0
        )
