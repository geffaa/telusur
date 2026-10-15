# Telusur

Asisten pengetahuan internal (RAG) untuk perusahaan: jawaban dari dokumen internal dengan sitasi,
hanya dari dokumen yang boleh dilihat penanya. Rencana lengkap: [BREAKDOWN.md](BREAKDOWN.md).

**Status:** Milestone 1–4 selesai: multi-tenant + RLS, ingestion PDF/DOCX/MD dengan chunking
struktural, hak akses per collection/dokumen, retrieval hybrid (vector + full-text + RRF + reranker),
chat streaming dengan sitasi yang membuka halaman sumber, penolakan menjawab bila sumber tidak ada,
versioning dokumen, audit log append-only, pertanyaan tak terjawab per topik, feedback, manajemen
pengguna/grup, simulasi "cek akses", dan evaluation harness dengan hasil terukur (di bawah).

## Stack

| Bagian | Teknologi |
|---|---|
| Frontend | Next.js 15, shadcn/ui, TanStack Query |
| API | FastAPI, SQLAlchemy 2 (async), Alembic |
| Worker | arq + Redis |
| Database | Postgres 16 + pgvector (HNSW) + full-text search, Row-Level Security per tenant |
| Embedding | `BAAI/bge-m3` lokal (multilingual, 1024 dim, gratis) |
| Reranker | `BAAI/bge-reranker-v2-m3` lokal |
| LLM | Groq free tier (`gpt-oss-120b` menjawab, `gpt-oss-20b` rewrite); fallback Gemini / Ollama |

## Menjalankan lokal

Kebutuhan: Docker, [uv](https://docs.astral.sh/uv/), Node 20+.

```bash
docker compose up -d                       # Postgres :5441, Redis :6390

cd apps/api
cp .env.example .env                       # isi JWT_SECRET dan GROQ_API_KEY (gratis, console.groq.com)
uv sync
uv run alembic upgrade head
uv run python -m scripts.make_sample_docs  # dokumen fiktif ke ../../samples
uv run python -m scripts.seed              # 2 tenant, grup, hak akses, 22 dokumen terindeks
uv run uvicorn app.main:app --port 8000    # terminal 1
uv run arq app.worker.WorkerSettings       # terminal 2 (unduh bge-m3 ~2,2 GB saat pertama)

cd ../web
cp .env.local.example .env.local
npm install && npm run dev                 # http://localhost:3000
```

Login demo: workspace `nusantara`, password `telusur123`:

| Email | Peran | Yang bisa dicoba |
|---|---|---|
| `hr@nusantara.test` | Knowledge Admin | upload, atur akses, lihat potongan teks |
| `staff@nusantara.test` | Karyawan (Staff) | tanya; dokumen remunerasi tidak terlihat |
| `direksi@nusantara.test` | Karyawan (Direksi) | pertanyaan yang sama tentang gaji direksi terjawab |
| `admin@nusantara.test` | Tenant Admin | kelola pengguna & grup, audit log |

Tenant kedua: `garuda` (data terpisah total).

## Test

```bash
cd apps/api && uv run pytest
```

Termasuk test isolasi tenant (RLS) dan test kebocoran hak akses: dokumen terbatas tidak pernah
masuk retrieval bagi grup lain (admin pun tidak), pencabutan akses berlaku seketika, file sumber
mengembalikan 404 bagi yang tidak berhak, dan percakapan hanya bisa dibuka pemiliknya.

## Hasil evaluasi

Diukur dengan `python -m app.eval` pada korpus 22 dokumen kebijakan fiktif (232 potongan) dan
71 kasus uji: 58 pertanyaan yang bisa dijawab (±30% berbahasa Inggris), 10 pertanyaan tanpa
jawaban di dokumen, dan 3 pertanyaan tentang dokumen yang tidak boleh diakses penanyanya.

| Konfigurasi | Recall@1 | Recall@5 | MRR | Tolak benar | Tolak keliru |
|---|---|---|---|---|---|
| Kata kunci saja | 0,60 | 0,91 | 0,71 | n/a | n/a |
| Vector saja (bge-m3) | 0,84 | 0,95 | 0,89 | n/a | n/a |
| Hybrid (vector + kata kunci, RRF) | 0,72 | 0,97 | 0,83 | n/a | n/a |
| Hybrid + rerank, tanpa terjemahan query | 0,95 | 1,00 | 0,97 | 0,92 | 0,10 |
| **Hybrid + rerank (produksi)** | **0,97** | **1,00** | **0,98** | **1,00** | **0,02** |

Kualitas jawaban konfigurasi produksi (dijawab `gpt-oss-120b`, dinilai juri `gpt-oss-20b`):

| Faithfulness | Correctness | Jawaban bersitasi | Dokumen terlarang bocor |
|---|---|---|---|
| 0,97 | 0,94 | 93% | 0 dari 3 |

Yang dipelajari dari angka ini:

- **Reranker adalah komponen terpenting.** Ia menaikkan Recall@1 dari 0,84 ke 0,97 dan menjadi
  satu-satunya skor yang cukup terkalibrasi untuk keputusan "tidak tahu".
- **Hybrid tanpa rerank lebih buruk dari vector saja** (MRR 0,83 vs 0,89): pencarian kata kunci
  menarik banyak kandidat yang tidak relevan ke peringkat atas. Gunanya baru terasa sebagai
  penyedia kandidat untuk reranker.
- **Terjemahan query memperbaiki penolakan keliru dari 10% ke 2%.** Semua penolakan keliru
  awalnya pertanyaan berbahasa Inggris yang sumbernya sudah di peringkat 1, tetapi skor reranker
  lintas bahasa terlalu rendah. Sekarang pertanyaan non-Indonesia diterjemahkan sebelum dicari.
- **Ambang "tidak tahu" 0,35 dipilih dari data:** 0,34–0,40 menolak semua 13 kasus negatif sambil
  hanya salah menolak 1 dari 58.

Keterbatasan yang diketahui:

- Kasus uji dibuat otomatis oleh LLM dari potongan dokumen, lalu disaring dari pertanyaan ambigu.
  Pertanyaan seperti ini cenderung lebih mudah daripada pertanyaan nyata karyawan; verifikasi
  manual tersedia di halaman Evaluasi, dan feedback 👎 bisa dijadikan kasus uji.
- Kasus negatif hanya 13, jadi ambang perlu dikalibrasi ulang saat data bertambah.
- 2 jawaban salah sama-sama pertanyaan "siapa yang tercakup kebijakan X": model mempersempit
  cakupan sendiri. Juri LLM juga sesekali tidak konsisten; nilai jawaban perlu dicek sampel manual.
- Latensi retrieval di tabel diukur di laptop (Apple Silicon, MPS) dengan API dan worker berjalan
  bersamaan; p50 ~1,5 detik didominasi reranker.

Reproduksi:

```bash
cd apps/api
uv run python -m app.eval generate                         # buat kasus uji (LLM)
uv run python -m app.eval run --mode vector                # atau lexical, hybrid, hybrid_rerank
uv run python -m app.eval run --mode hybrid_rerank --answers   # + kualitas jawaban (~30 menit di free tier)
uv run python -m app.eval compare                          # tabel perbandingan
```

Atau dari UI: **Evaluasi → Jalankan evaluasi** (berjalan di worker, dengan progres dan
perbandingan per pertanyaan antar run).

## Keputusan desain

- **RLS di Postgres, bukan hanya `WHERE tenant_id`.** Setiap transaksi menjalankan
  `set_config('app.tenant_id', …, true)` (lihat `app/db.py`). App memakai role non-superuser
  `telusur_app`, sehingga bug di kode pun tidak bisa membocorkan data lintas tenant.
- **Chunking mengikuti struktur dokumen.** Chunk tidak pernah melewati batas heading, tabel tidak
  dipotong (tabel besar dipecah per baris dengan header diulang), dan setiap chunk membawa
  `heading_path` + nomor halaman untuk sitasi.
- **Contextual header saat embedding.** Teks yang di-embed diawali judul dokumen + section,
  sehingga chunk pendek seperti tabel tetap bisa ditemukan.
- **Ingestion idempoten dan tahan crash.** Retry menghapus chunk versi itu sebelum insert; saat
  worker start, versi yang tertinggal di tengah pipeline diantrekan ulang.
- **ACL di dalam query retrieval.** Filter akses ada di SQL vector/full-text search, sehingga chunk
  terlarang tidak pernah sampai ke reranker maupun LLM. Hak akses dievaluasi live dari keanggotaan grup.
- **"Tidak tahu" sebelum memanggil LLM.** Bila skor reranker tertinggi di bawah ambang (0,3), LLM
  tidak dipanggil sama sekali: lebih murah dan tidak mungkin berhalusinasi.
- **Sitasi diverifikasi.** Nomor sitasi yang tidak ada di konteks dibuang; kutipan disimpan sebagai
  snapshot dan disembunyikan bila akses pembaca ke dokumen itu kemudian dicabut.
- **Audit log tidak bisa diubah.** Role aplikasi hanya punya hak INSERT/SELECT, dan trigger menolak
  UPDATE/DELETE bahkan untuk owner database. Tabel dipartisi per bulan (2026–2027 + partisi default;
  tambah partisi lewat job ops sebelum 2028).
- **Pertanyaan tak terjawab dikelompokkan per makna,** sehingga admin melihat topik yang kurang
  ("tunjangan kacamata", 2 penanya) alih-alih daftar kalimat yang berbeda-beda.
- **Pergantian versi atomik.** Chunk baru dan perpindahan `is_current` terjadi dalam satu transaksi.
