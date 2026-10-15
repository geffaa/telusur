import json
import uuid

import pytest
from sqlalchemy import select, text

from app.db import SessionLocal, tenant_session
from app.ingestion.pipeline import ingest_version
from app.models import AuditLog, DocumentVersion, Tenant
from app.routers import documents as documents_router
from app.routers.gaps import cluster
from tests.conftest import login


async def _sse(client, headers, message, conversation_id=None) -> dict:
    events: dict = {}
    async with client.stream(
        "POST",
        "/chat",
        headers=headers,
        json={"message": message, "conversation_id": conversation_id},
    ) as res:
        event = None
        async for line in res.aiter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                events.setdefault(event, []).append(json.loads(line[5:]))
    return events


async def _tenant(slug):
    async with SessionLocal() as s:
        return await s.scalar(select(Tenant.id).where(Tenant.slug == slug))


async def test_unanswerable_question_becomes_clustered_gap_and_is_audited(client):
    staff = await login(client, "nusantara", "staff")
    manager = await login(client, "nusantara", "manager")
    marker = uuid.uuid4().hex[:6]
    tid = await _tenant("nusantara")
    async with tenant_session(tid) as s:  # leftovers from an earlier failed run
        await s.execute(text("DELETE FROM knowledge_gaps WHERE query ILIKE '%beasiswa%'"))
    # A topic no document covers (the corpus does cover eyeglasses, so not that one).
    a = await _sse(client, staff, f"Apakah ada beasiswa S2 untuk karyawan? ({marker})")
    b = await _sse(client, manager, f"Ada program beasiswa S2 dari kantor? ({marker})")
    assert a["done"][0]["refused"] and b["done"][0]["refused"]

    admin = await login(client, "nusantara", "hr")
    clusters = (await client.get("/knowledge-gaps", headers=admin)).json()
    topic = next(c for c in clusters if any(marker in e["query"] for e in c["examples"]))
    assert topic["count"] >= 2 and topic["askers"] >= 2

    res = await client.post(
        "/knowledge-gaps/resolve", headers=admin, json={"gap_ids": topic["gap_ids"]}
    )
    assert res.json()["resolved"] == topic["count"]
    clusters = (await client.get("/knowledge-gaps", headers=admin)).json()
    assert not any(marker in e["query"] for c in clusters for e in c["examples"])

    async with tenant_session(tid) as s:
        asked = await s.scalar(
            select(AuditLog).where(
                AuditLog.action == "query.asked", AuditLog.target_label.contains(marker)
            )
        )
    assert asked.meta["refused"] is True and asked.actor_name


async def test_audit_log_cannot_be_changed_by_the_app():
    tid = await _tenant("nusantara")
    with pytest.raises(Exception, match="permission denied"):
        async with tenant_session(tid) as s:
            await s.execute(text("UPDATE audit_logs SET action = 'tampered'"))
    with pytest.raises(Exception, match="permission denied"):
        async with tenant_session(tid) as s:
            await s.execute(text("DELETE FROM audit_logs"))


async def test_feedback_only_on_own_answers(client):
    staff = await login(client, "nusantara", "staff")
    events = await _sse(client, staff, "Apa warna kesukaan direktur? xyz")
    message_id = events["done"][0]["message_id"]
    conversation_id = events["conversation"][0]["id"]
    res = await client.put(
        f"/messages/{message_id}/feedback",
        headers=staff,
        json={"rating": -1, "reason": "incomplete"},
    )
    assert res.status_code == 204
    # Changing your mind updates the same row.
    await client.put(f"/messages/{message_id}/feedback", headers=staff, json={"rating": 1})
    mine = (
        await client.get(f"/messages/feedback?conversation_id={conversation_id}", headers=staff)
    ).json()
    assert mine == {message_id: 1}

    manager = await login(client, "nusantara", "manager")
    res = await client.put(f"/messages/{message_id}/feedback", headers=manager, json={"rating": -1})
    assert res.status_code == 404
    admin = await login(client, "nusantara", "hr")
    summary = (await client.get("/feedback", headers=admin)).json()
    item = next(i for i in summary["items"] if i["message_id"] == message_id)
    assert item["rating"] == 1 and "warna kesukaan" in item["question"]
    assert (await client.get("/feedback", headers=staff)).status_code == 403


async def test_new_version_swaps_atomically_and_delete_hides_document(client, monkeypatch):
    queued = []

    async def fake_enqueue(tenant, version, retry=False):
        queued.append((tenant, version))

    monkeypatch.setattr(documents_router, "enqueue_ingest", fake_enqueue)
    admin = await login(client, "nusantara", "hr")
    col = (
        await client.post("/collections", headers=admin, json={"name": f"Versi {uuid.uuid4()}"})
    ).json()
    v1 = f"# Panduan Parkir\n\n## Tarif\n\nParkir motor gratis. {uuid.uuid4()}\n"
    doc = (
        await client.post(
            f"/collections/{col['id']}/documents",
            headers=admin,
            files={"file": ("parkir.md", v1.encode(), "text/markdown")},
        )
    ).json()
    await ingest_version(*queued.pop())

    same = await client.post(
        f"/documents/{doc['id']}/versions",
        headers=admin,
        files={"file": ("parkir.md", v1.encode(), "text/markdown")},
    )
    assert same.status_code == 409

    v2 = v1.replace("gratis", "Rp 2.000 per hari")
    res = await client.post(
        f"/documents/{doc['id']}/versions",
        headers=admin,
        files={"file": ("parkir-v2.md", v2.encode(), "text/markdown")},
    )
    assert res.status_code == 201
    body = res.json()
    # Until v2 is indexed, v1 keeps answering.
    assert body["current"]["version"] == 1 and body["latest"]["version"] == 2
    busy = await client.post(
        f"/documents/{doc['id']}/versions",
        headers=admin,
        files={"file": ("parkir-v3.md", b"# x\n\ny", "text/markdown")},
    )
    assert busy.status_code == 409

    await ingest_version(*queued.pop())
    body = (await client.get(f"/documents/{doc['id']}", headers=admin)).json()
    assert body["current"]["version"] == 2
    tid = await _tenant("nusantara")
    async with tenant_session(tid) as s:
        current = await s.scalars(
            select(DocumentVersion.version).where(
                DocumentVersion.document_id == uuid.UUID(doc["id"]), DocumentVersion.is_current
            )
        )
        assert list(current) == [2]

    assert (await client.delete(f"/documents/{doc['id']}", headers=admin)).status_code == 204
    assert (await client.get(f"/documents/{doc['id']}", headers=admin)).status_code == 404
    log = (
        await client.get(
            "/audit-logs?action=document.", headers=await login(client, "nusantara", "admin")
        )
    ).json()
    actions = [i["action"] for i in log["items"] if i["target_id"] == doc["id"]]
    assert actions[:3] == ["document.deleted", "document.version_uploaded", "document.uploaded"]
    async with tenant_session(tid) as s:
        await s.execute(text("DELETE FROM collections WHERE id = :id"), {"id": col["id"]})


async def test_people_management_is_tenant_admin_only_and_audited(client):
    admin = await login(client, "nusantara", "admin")
    hr = await login(client, "nusantara", "hr")
    groups = {g["name"]: g["id"] for g in (await client.get("/groups", headers=admin)).json()}
    email = f"baru-{uuid.uuid4().hex[:6]}@nusantara.test"
    body = {"name": "Karyawan Baru", "email": email, "group_ids": [groups["Staff"]]}
    assert (await client.post("/users", headers=hr, json=body)).status_code == 403

    created = (await client.post("/users", headers=admin, json=body)).json()
    assert len(created["temporary_password"]) >= 10
    res = await client.post(
        "/auth/login",
        json={"workspace": "nusantara", "email": email, "password": created["temporary_password"]},
    )
    assert res.status_code == 200

    patched = await client.patch(
        f"/users/{created['id']}",
        headers=admin,
        json={"role": "knowledge_admin", "group_ids": [groups["HR"], groups["Staff"]]},
    )
    assert patched.status_code == 200 and patched.json()["role"] == "knowledge_admin"
    log = (await client.get("/audit-logs?action=user.", headers=admin)).json()["items"]
    mine = [i for i in log if i["target_label"] == email]
    assert {i["action"] for i in mine} == {
        "user.created",
        "user.role_changed",
        "user.groups_changed",
    }
    change = next(i for i in mine if i["action"] == "user.groups_changed")
    assert change["before"] == {"groups": ["Staff"]} and change["after"] == {
        "groups": ["HR", "Staff"]
    }

    me = (await client.get("/auth/me", headers=admin)).json()
    demote = await client.patch(f"/users/{me['id']}", headers=admin, json={"role": "employee"})
    assert demote.status_code == 409  # last tenant admin

    csv = await client.get("/audit-logs/export.csv?action=user.", headers=admin)
    assert csv.status_code == 200 and email in csv.text


async def test_access_check_shows_what_a_person_would_get(client):
    hr = await login(client, "nusantara", "hr")
    users = {u["email"]: u for u in (await client.get("/users", headers=hr)).json()}
    staff = users["staff@nusantara.test"]
    res = (
        await client.post(
            "/access-check",
            headers=hr,
            json={"user_id": staff["id"], "question": "Berapa gaji pokok direktur utama?"},
        )
    ).json()
    assert res["groups"] == ["Staff"]
    readable = {d["title"]: d["readable"] for d in res["documents"]}
    assert readable["Struktur Remunerasi Direksi 2026"] is False
    assert readable["Kebijakan Cuti Karyawan"] is True
    assert res["retrieval"]["would_refuse"] is True
    assert all(
        p["title"] != "Struktur Remunerasi Direksi 2026" for p in res["retrieval"]["passages"]
    )


def test_cluster_groups_similar_vectors():
    class G:
        def __init__(self, vec, t):
            self.embedding, self.created_at = vec, t

    a, b, c = G([1.0, 0.0], 1), G([0.96, 0.28], 2), G([0.0, 1.0], 3)
    groups = cluster([a, b, c])
    assert [len(g) for g in groups] == [2, 1]
