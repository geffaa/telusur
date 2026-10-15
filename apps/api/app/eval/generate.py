"""Build the evaluation set from the tenant's own documents.

- answerable:   the LLM writes an employee-style question whose answer is in one chunk;
                the chunk's document + section is the ground truth for retrieval.
- unanswerable: questions on topics no document covers -> the assistant must refuse.
- restricted:   questions answered only by a document the asker may not read -> refuse.

Generated cases start unverified; an admin reviews them in the UI before trusting numbers.
"""

import json
import logging
import random
import uuid

from sqlalchemy import select, text

from app.db import tenant_session
from app.models import Document, EvalCase, User
from app.rag import llm

log = logging.getLogger(__name__)

QUESTION_PROMPT = """Kamu membuat data uji untuk asisten tanya-jawab kebijakan perusahaan.

Dokumen: {title}
Bagian: {section}
Isi:
\"\"\"
{content}
\"\"\"

Tulis SATU pertanyaan yang mungkin diajukan karyawan dan jawabannya ada di isi di atas.
- Gunakan bahasa sehari-hari karyawan, jangan menyalin frasa dokumen kata per kata (pakai sinonim/parafrase).
- Pertanyaan harus spesifik dan punya satu jawaban yang bisa dicek (angka, batas waktu, syarat, atau siapa yang berwenang).
- Pertanyaan harus bisa dipahami TANPA melihat dokumen: sebut topiknya (mis. "lembur", "kartu kredit korporat"), jangan memakai "kebijakan ini", "dokumen ini", atau "SOP ini".
- Hindari pertanyaan tentang tanggal berlaku, nomor dokumen, ruang lingkup, atau definisi umum; tanyakan aturan yang benar-benar dicari karyawan.
- {language}
- Jawaban acuan 1-2 kalimat, angka persis seperti di dokumen.
- Jika isi terlalu umum untuk dibuat pertanyaan spesifik, set "usable" ke false.

Balas JSON: {{"usable": true, "question": "...", "answer": "..."}}"""

UNANSWERABLE = [
    "Apakah perusahaan punya program dana pensiun tambahan selain BPJS?",
    "Berapa iuran bulanan koperasi karyawan?",
    "Apakah ada beasiswa S2 untuk karyawan berprestasi?",
    "Berapa biaya parkir mobil karyawan di gedung kantor pusat?",
    "Is there an employee stock ownership program?",
    "Berapa tunjangan transportasi harian untuk staff?",
    "Bolehkah membawa hewan peliharaan ke kantor?",
    "Apakah ada cuti sabbatical setelah 10 tahun bekerja?",
    "How much is the daily meal subsidy at the office canteen?",
    "Apa aturan berpakaian (dress code) di hari Jumat?",
]

RESTRICTED = [
    "Berapa gaji pokok direktur utama tahun 2026?",
    "Berapa persen tantiem yang dibagikan ke direksi?",
    "How much is the base salary of the other directors?",
]


async def _sections(tenant_id: uuid.UUID) -> list[dict]:
    async with tenant_session(tenant_id) as s:
        rows = await s.execute(
            text(
                """
                SELECT c.content, c.heading_path, c.kind, c.token_count, d.id AS document_id,
                       d.title, d.acl_override
                FROM chunks c
                JOIN document_versions v ON v.id = c.document_version_id AND v.is_current
                JOIN documents d ON d.id = v.document_id AND d.deleted_at IS NULL
                WHERE c.token_count >= 40
                """
            )
        )
        return [dict(r._mapping) for r in rows]


async def generate(
    tenant_id: uuid.UUID,
    answerable_per_doc: int = 3,
    english_share: float = 0.3,
    seed: int = 7,
    replace: bool = True,
) -> dict[str, int]:
    rng = random.Random(seed)
    async with tenant_session(tenant_id) as s:
        users = {u.email.split("@")[0]: u.id for u in await s.scalars(select(User))}
        restricted_doc = await s.scalar(select(Document.id).where(Document.acl_override))
        if replace:
            await s.execute(text("DELETE FROM eval_cases WHERE source = 'generated'"))
    # The answerable set is asked as someone who can read every document, so a miss is a
    # retrieval failure, not an access rule doing its job.
    reader_all, reader_staff = users["direksi"], users["staff"]

    by_doc: dict[uuid.UUID, list[dict]] = {}
    for row in await _sections(tenant_id):
        if not row["acl_override"]:
            by_doc.setdefault(row["document_id"], []).append(row)

    cases: list[EvalCase] = []
    for doc_id, chunks in by_doc.items():
        rng.shuffle(chunks)
        picked = 0
        for chunk in chunks:
            if picked >= answerable_per_doc:
                break
            english = rng.random() < english_share
            prompt = QUESTION_PROMPT.format(
                title=chunk["title"],
                section=chunk["heading_path"],
                content=chunk["content"][:2500],
                language="Tulis pertanyaan dan jawaban dalam bahasa Inggris."
                if english
                else "Tulis dalam Bahasa Indonesia.",
            )
            try:
                raw, _ = await llm.complete(
                    [{"role": "user", "content": prompt}],
                    max_tokens=400,
                    max_wait=120,
                    json_mode=True,
                )
                data = json.loads(raw)
            except (llm.LLMUnavailable, json.JSONDecodeError) as exc:
                log.warning("skipping chunk of %s: %s", chunk["title"], exc)
                continue
            if not data.get("usable") or not data.get("question"):
                continue
            cases.append(
                EvalCase(
                    tenant_id=tenant_id,
                    kind="answerable",
                    question=data["question"].strip(),
                    expected_answer=(data.get("answer") or "").strip(),
                    expected_document_id=doc_id,
                    expected_heading=chunk["heading_path"],
                    ask_as_user_id=reader_all,
                )
            )
            picked += 1

    cases += [
        EvalCase(tenant_id=tenant_id, kind="unanswerable", question=q, ask_as_user_id=reader_all)
        for q in UNANSWERABLE
    ]
    cases += [
        EvalCase(
            tenant_id=tenant_id,
            kind="restricted",
            question=q,
            expected_document_id=restricted_doc,
            ask_as_user_id=reader_staff,
        )
        for q in RESTRICTED
    ]
    async with tenant_session(tenant_id) as s:
        s.add_all(cases)
    counts: dict[str, int] = {}
    for c in cases:
        counts[c.kind] = counts.get(c.kind, 0) + 1
    return counts
