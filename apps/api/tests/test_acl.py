"""Permission leaks: the claims a security reviewer would try to break first."""

import uuid

from sqlalchemy import select

from app.acl import reader_for
from app.db import SessionLocal, tenant_session
from app.deps import CurrentUser
from app.models import Document, Tenant, User
from app.rag.chat import verify_citations
from app.rag.retrieval import retrieve
from tests.conftest import login

SECRET_QUESTION = "Berapa gaji pokok direktur utama?"
SECRET_TITLE = "Struktur Remunerasi Direksi 2026"


async def _user(slug: str, local: str) -> CurrentUser:
    async with SessionLocal() as s:
        tid = await s.scalar(select(Tenant.id).where(Tenant.slug == slug))
    async with tenant_session(tid) as s:
        u = await s.scalar(select(User).where(User.email == f"{local}@{slug}.test"))
        return CurrentUser(u.id, tid, u.role)


async def _titles(user: CurrentUser, query: str) -> set[str]:
    async with tenant_session(user.tenant_id) as s:
        result = await retrieve(s, await reader_for(s, user), query)
    return {c.title for c in result.candidates}


async def _secret_doc(client, headers) -> dict:
    cols = (await client.get("/collections", headers=headers)).json()
    hr = next(c for c in cols if c["name"] == "Kebijakan HR")
    docs = (await client.get(f"/collections/{hr['id']}/documents", headers=headers)).json()
    return next(d for d in docs if d["title"] == SECRET_TITLE)


async def test_restricted_document_never_reaches_retrieval_for_other_groups():
    assert SECRET_TITLE not in await _titles(await _user("nusantara", "staff"), SECRET_QUESTION)
    assert SECRET_TITLE not in await _titles(await _user("nusantara", "manager"), SECRET_QUESTION)
    assert SECRET_TITLE in await _titles(await _user("nusantara", "direksi"), SECRET_QUESTION)


async def test_admin_role_does_not_bypass_document_acl_in_answers():
    # HR manages documents but is not in the Direksi group: it must not get the answer.
    assert SECRET_TITLE not in await _titles(await _user("nusantara", "hr"), SECRET_QUESTION)


async def test_retrieval_never_crosses_tenants():
    titles = await _titles(await _user("garuda", "staff"), "berapa hari cuti tahunan")
    assert titles == {"Kebijakan Cuti Garuda"}
    assert "Kebijakan Cuti Garuda" not in await _titles(
        await _user("nusantara", "staff"), "cuti tahunan 14 hari Garuda"
    )


async def test_restricted_document_is_hidden_from_listing_detail_and_file(client):
    admin = await login(client, "nusantara", "hr")
    staff = await login(client, "nusantara", "staff")
    direksi = await login(client, "nusantara", "direksi")
    secret = await _secret_doc(client, admin)

    hr_id = secret["collection_id"]
    staff_titles = {
        d["title"]
        for d in (await client.get(f"/collections/{hr_id}/documents", headers=staff)).json()
    }
    assert SECRET_TITLE not in staff_titles and "Kebijakan Cuti Karyawan" in staff_titles
    for path in (f"/documents/{secret['id']}", f"/documents/{secret['id']}/file"):
        assert (await client.get(path, headers=staff)).status_code == 404
        assert (await client.get(path, headers=direksi)).status_code == 200


async def test_revoking_access_applies_immediately(client):
    admin = await login(client, "nusantara", "hr")
    cols = (await client.get("/collections", headers=admin)).json()
    it = next(c for c in cols if c["name"] == "IT & Keamanan")
    staff = await _user("nusantara", "staff")
    question = "boleh pakai laptop pribadi untuk VPN?"
    assert "Kebijakan Password dan Akses Sistem" in await _titles(staff, question)

    groups = {g["name"]: g["id"] for g in (await client.get("/groups", headers=admin)).json()}
    res = await client.put(
        f"/collections/{it['id']}/access",
        headers=admin,
        json={"everyone": False, "group_ids": [groups["Manager"]]},
    )
    assert res.status_code == 200
    try:
        assert "Kebijakan Password dan Akses Sistem" not in await _titles(staff, question)
        assert "Kebijakan Password dan Akses Sistem" in await _titles(
            await _user("nusantara", "manager"), question
        )
    finally:
        await client.put(f"/collections/{it['id']}/access", headers=admin, json={"everyone": True})


async def test_employee_cannot_change_access(client):
    staff = await login(client, "nusantara", "staff")
    cols = (await client.get("/collections", headers=staff)).json()
    res = await client.put(
        f"/collections/{cols[0]['id']}/access", headers=staff, json={"everyone": True}
    )
    assert res.status_code == 403


async def test_conversations_are_private_to_their_owner(client):
    staff_user = await _user("nusantara", "staff")
    from app.models import Conversation

    async with tenant_session(staff_user.tenant_id) as s:
        convo = Conversation(tenant_id=staff_user.tenant_id, user_id=staff_user.id, title="rahasia")
        s.add(convo)
        await s.flush()
        convo_id = convo.id
    manager = await login(client, "nusantara", "manager")
    assert (
        await client.get(f"/conversations/{convo_id}/messages", headers=manager)
    ).status_code == 404
    assert (await client.delete(f"/conversations/{convo_id}", headers=manager)).status_code == 404
    ids = [c["id"] for c in (await client.get("/conversations", headers=manager)).json()]
    assert str(convo_id) not in ids
    async with tenant_session(staff_user.tenant_id) as s:
        await s.delete(await s.get(Conversation, convo_id))


def test_invented_citations_are_removed():
    text, cited, invalid = verify_citations("Rp 450.000【1】 dan [2, 9] serta [7] .", 3)
    assert text == "Rp 450.000[1] dan [2] serta."
    assert cited == [1, 2] and invalid == [9, 7]


async def test_document_override_can_be_reverted_to_inherit(client):
    admin = await login(client, "nusantara", "hr")
    secret = await _secret_doc(client, admin)
    access = (await client.get(f"/documents/{secret['id']}/access", headers=admin)).json()
    assert access["inherit"] is False and not access["everyone"] and len(access["group_ids"]) == 1
    async with SessionLocal() as s:
        assert (
            await s.scalar(select(Document.id).where(Document.id == uuid.UUID(secret["id"])))
            is None
        )  # RLS
