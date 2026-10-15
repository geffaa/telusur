"""User-facing messages in English and Indonesian.

Errors are raised as `AppError(status, code, **vars)`; one exception handler renders the
message in the language of the request (`Accept-Language`, English by default) and also
returns the stable `code` so clients can react without parsing text.

Document-processing errors are stored as codes too (see ParseError), because the person
reading them later may use a different language than the worker that hit them.
"""

from fastapi import Request
from fastapi.responses import JSONResponse

DEFAULT_LANG = "en"
LANGS = ("en", "id")

MESSAGES: dict[str, dict[str, str]] = {
    # auth & permissions
    "invalid_login": {
        "en": "Wrong workspace, email, or password",
        "id": "Workspace, email, atau password salah",
    },
    "not_logged_in": {"en": "You are not signed in", "id": "Belum login"},
    "invalid_session": {"en": "Your session is no longer valid", "id": "Sesi tidak valid"},
    "user_not_found": {"en": "User not found", "id": "Pengguna tidak ditemukan"},
    "needs_knowledge_admin": {
        "en": "Requires the Knowledge Admin role",
        "id": "Butuh peran Knowledge Admin",
    },
    "needs_tenant_admin": {
        "en": "Requires the Tenant Admin role",
        "id": "Butuh peran Tenant Admin",
    },
    # resources
    "collection_not_found": {"en": "Collection not found", "id": "Collection tidak ditemukan"},
    "document_not_found": {"en": "Document not found", "id": "Dokumen tidak ditemukan"},
    "version_not_found": {"en": "Version not found", "id": "Versi tidak ditemukan"},
    "conversation_not_found": {"en": "Conversation not found", "id": "Percakapan tidak ditemukan"},
    "message_not_found": {"en": "Message not found", "id": "Pesan tidak ditemukan"},
    "feedback_not_found": {"en": "Feedback not found", "id": "Feedback tidak ditemukan"},
    "eval_case_not_found": {"en": "Test case not found", "id": "Kasus uji tidak ditemukan"},
    "group_not_found": {"en": "Group not found", "id": "Grup tidak ditemukan"},
    "unknown_group": {"en": "Unknown group", "id": "Grup tidak dikenal"},
    # uploads
    "unsupported_upload": {
        "en": "Supported formats: PDF, DOCX, Markdown, TXT",
        "id": "Format didukung: PDF, DOCX, Markdown, TXT",
    },
    "file_too_large": {"en": "Maximum {mb} MB", "id": "Maksimal {mb} MB"},
    "file_empty": {"en": "The file is empty", "id": "File kosong"},
    "duplicate_document": {
        "en": "An identical document already exists: “{title}”",
        "id": "Dokumen identik sudah ada: “{title}”",
    },
    "version_in_progress": {
        "en": "A version is still being processed",
        "id": "Masih ada versi yang sedang diproses",
    },
    "same_as_active": {
        "en": "The file is identical to the active version",
        "id": "File sama persis dengan versi aktif",
    },
    "only_failed_retry": {
        "en": "Only a failed version can be reprocessed",
        "id": "Hanya versi yang gagal yang bisa diproses ulang",
    },
    # people
    "email_taken": {"en": "That email is already registered", "id": "Email sudah terdaftar"},
    "last_tenant_admin": {
        "en": "There must be at least one Tenant Admin",
        "id": "Harus ada minimal satu Tenant Admin",
    },
    "group_name_taken": {"en": "That group name is already used", "id": "Nama grup sudah dipakai"},
    "group_in_use": {
        "en": "The group is still used in {n} access rules. Change them first.",
        "id": "Grup masih dipakai di {n} pengaturan akses. Ubah aksesnya dulu.",
    },
    # evaluation
    "eval_running": {
        "en": "An evaluation is already running",
        "id": "Masih ada evaluasi yang berjalan",
    },
    "rating_invalid": {"en": "rating must be 1 or -1", "id": "rating harus 1 atau -1"},
    # chat
    "llm_unavailable": {
        "en": "The AI service is unavailable right now. Try again shortly.",
        "id": "Layanan AI sedang tidak tersedia. Coba lagi sebentar.",
    },
    "chat_failed": {
        "en": "Something went wrong preparing the answer. Try again.",
        "id": "Terjadi kesalahan saat menyiapkan jawaban. Coba lagi.",
    },
}


def lang_of(request: Request | None) -> str:
    """First supported language in Accept-Language, else English."""
    header = request.headers.get("accept-language", "") if request else ""
    for part in header.split(","):
        tag = part.split(";")[0].strip().lower()[:2]
        if tag in LANGS:
            return tag
    return DEFAULT_LANG


def message(code: str, lang: str = DEFAULT_LANG, **vars: object) -> str:
    entry = MESSAGES.get(code)
    if not entry:
        return code
    return entry.get(lang, entry[DEFAULT_LANG]).format(**vars)


class AppError(Exception):
    def __init__(self, status_code: int, code: str, **vars: object) -> None:
        super().__init__(code)
        self.status_code, self.code, self.vars = status_code, code, vars


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": message(exc.code, lang_of(request), **exc.vars), "code": exc.code},
    )
