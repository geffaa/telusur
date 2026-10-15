import uuid

import pytest

from app.i18n import MESSAGES, lang_of, message
from app.ingestion.parsers import ParseError, parse_markdown
from tests.conftest import login


async def test_api_errors_follow_accept_language(client):
    headers = await login(client, "nusantara", "hr")
    missing = f"/documents/{uuid.uuid4()}"
    en = await client.get(missing, headers=headers)
    idn = await client.get(missing, headers={**headers, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"})
    assert en.status_code == idn.status_code == 404
    assert en.json() == {"detail": "Document not found", "code": "document_not_found"}
    assert idn.json() == {"detail": "Dokumen tidak ditemukan", "code": "document_not_found"}


async def test_login_error_is_translated(client):
    body = {"workspace": "nusantara", "email": "hr@nusantara.test", "password": "wrong"}
    res = await client.post("/auth/login", json=body, headers={"Accept-Language": "id"})
    assert res.status_code == 401 and res.json()["detail"] == "Workspace, email, atau password salah"


def test_every_message_has_both_languages():
    assert all(set(v) == {"en", "id"} for v in MESSAGES.values())


def test_language_negotiation_defaults_to_english():
    class R:
        def __init__(self, h):
            self.headers = {"accept-language": h} if h else {}

    assert lang_of(R("id-ID,id;q=0.9")) == "id"
    assert lang_of(R("fr-FR,fr;q=0.9")) == "en"
    assert lang_of(R(None)) == "en"
    assert message("file_too_large", "id", mb=50) == "Maksimal 50 MB"


def test_parse_errors_are_codes_not_sentences():
    with pytest.raises(ParseError, match="^empty_document$"):
        parse_markdown("   \n\n")
