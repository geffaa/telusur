"""Generate a larger fictional policy corpus for PT Nusantara Sejahtera with the LLM.

Run once; the output is committed under samples/corpus/ so evaluation is reproducible
without calling the LLM again. Each topic carries "anchor facts" with concrete numbers so
questions about it have one checkable answer, and several topics deliberately overlap
(BYOD vs VPN, advances vs business travel) to give retrieval realistic distractors.

uv run python -m scripts.generate_corpus [--force]
"""

import asyncio
import re
import sys
from pathlib import Path

from app.rag import llm

OUT = Path(__file__).resolve().parents[3] / "samples" / "corpus"

# (slug, collection, title, doc number, anchor facts)
TOPICS = [
    ("kebijakan-lembur", "Kebijakan HR", "Kebijakan Kerja Lembur", "HR-POL-011", [
        "lembur hari kerja dibayar 1,5x upah per jam untuk jam pertama dan 2x untuk jam berikutnya",
        "lembur hari libur dibayar 2x untuk 8 jam pertama, 3x jam ke-9, 4x jam ke-10 dan ke-11",
        "maksimal lembur 4 jam per hari dan 18 jam per minggu",
        "level Manager ke atas tidak mendapat upah lembur, diganti cuti pengganti 1 hari per 8 jam",
    ]),
    ("kebijakan-kerja-hybrid", "Kebijakan HR", "Kebijakan Kerja Hybrid", "HR-POL-014", [
        "karyawan boleh bekerja dari rumah maksimal 2 hari per minggu",
        "hari Selasa dan Kamis wajib hadir di kantor untuk semua tim",
        "tunjangan internet kerja hybrid Rp 250.000 per bulan",
        "karyawan dalam masa percobaan 3 bulan pertama wajib bekerja penuh dari kantor",
    ]),
    ("tunjangan-kesehatan", "Kebijakan HR", "Kebijakan Tunjangan Kesehatan", "HR-POL-005", [
        "plafon rawat jalan Rp 6.000.000 per tahun untuk karyawan, Rp 4.000.000 per anggota keluarga",
        "kacamata: frame maksimal Rp 750.000 setiap 2 tahun, lensa maksimal Rp 500.000 setiap tahun",
        "perawatan gigi maksimal Rp 2.500.000 per tahun, tidak termasuk kawat gigi estetika",
        "klaim diajukan maksimal 60 hari setelah tanggal kuitansi",
    ]),
    ("kode-etik", "Kebijakan HR", "Kode Etik dan Benturan Kepentingan", "HR-POL-001", [
        "hadiah dari vendor bernilai di atas Rp 500.000 wajib ditolak atau dilaporkan dalam 7 hari kerja",
        "laporan gratifikasi disampaikan ke Unit Kepatuhan melalui compliance@nusantara.test",
        "karyawan wajib mengisi deklarasi benturan kepentingan setiap bulan Januari",
        "pelanggaran kode etik diselidiki oleh Komite Etik yang terdiri dari HR, Legal, dan Internal Audit",
    ]),
    ("penilaian-kinerja", "Kebijakan HR", "Kebijakan Penilaian Kinerja", "HR-POL-008", [
        "penilaian kinerja dilakukan dua kali setahun: Juli (tengah tahun) dan Januari (akhir tahun)",
        "skala nilai 1 sampai 5; nilai 4 dan 5 maksimal 25 persen dari tim (distribusi terkendali)",
        "kenaikan gaji tahunan: nilai 5 sebesar 10 persen, nilai 4 sebesar 7 persen, nilai 3 sebesar 4 persen",
        "karyawan dengan nilai 1 masuk Performance Improvement Plan selama 3 bulan",
    ]),
    ("rekrutmen-referral", "Kebijakan HR", "Kebijakan Rekrutmen dan Referral Karyawan", "HR-POL-012", [
        "bonus referral Rp 3.000.000 untuk posisi staff dan Rp 7.500.000 untuk posisi manager",
        "bonus referral dibayar setelah kandidat lolos masa percobaan 3 bulan",
        "karyawan HR dan atasan langsung posisi tersebut tidak berhak atas bonus referral",
        "lowongan internal dibuka 10 hari kerja sebelum dipublikasikan ke eksternal",
    ]),
    ("pengadaan-barang-jasa", "Keuangan", "Prosedur Pengadaan Barang dan Jasa", "FIN-SOP-004", [
        "pengadaan sampai Rp 25.000.000 cukup 1 penawaran vendor",
        "pengadaan Rp 25.000.001 sampai Rp 250.000.000 wajib 3 penawaran pembanding",
        "pengadaan di atas Rp 250.000.000 wajib tender terbuka dan disetujui Direktur Keuangan",
        "vendor baru wajib lolos due diligence: NPWP, akta pendirian, dan cek daftar hitam",
    ]),
    ("kas-kecil", "Keuangan", "Kebijakan Kas Kecil", "FIN-POL-006", [
        "saldo kas kecil per kantor cabang maksimal Rp 5.000.000",
        "satu transaksi kas kecil maksimal Rp 1.000.000",
        "pengisian ulang kas kecil dilakukan setiap tanggal 1 dan 15",
        "kas kecil tidak boleh dipakai untuk pinjaman pribadi atau pembayaran gaji",
    ]),
    ("uang-muka-kerja", "Keuangan", "Kebijakan Uang Muka Kerja", "FIN-POL-009", [
        "uang muka kerja maksimal 80 persen dari anggaran kegiatan yang disetujui",
        "pertanggungjawaban uang muka paling lambat 7 hari kerja setelah kegiatan selesai",
        "karyawan tidak boleh mengajukan uang muka baru jika masih ada uang muka yang belum dipertanggungjawabkan",
        "sisa uang muka dikembalikan ke rekening perusahaan, bukan diganti barang",
    ]),
    ("kartu-kredit-korporat", "Keuangan", "Kebijakan Kartu Kredit Korporat", "FIN-POL-010", [
        "kartu kredit korporat hanya untuk level General Manager ke atas",
        "limit kartu: General Manager Rp 50.000.000, Direksi Rp 150.000.000 per bulan",
        "penarikan tunai dengan kartu korporat dilarang",
        "rekonsiliasi transaksi wajib diunggah ke HRIS paling lambat tanggal 5 bulan berikutnya",
    ]),
    ("perangkat-pribadi-byod", "IT & Keamanan", "Kebijakan Penggunaan Perangkat Pribadi (BYOD)", "IT-POL-004", [
        "ponsel pribadi boleh mengakses email dan chat kantor jika terdaftar di aplikasi MDM",
        "laptop pribadi tidak boleh dipakai untuk mengakses sistem internal mana pun",
        "perusahaan berhak menghapus data kantor dari ponsel pribadi dari jarak jauh saat karyawan keluar",
        "tunjangan pemakaian ponsel pribadi Rp 150.000 per bulan untuk karyawan yang terdaftar",
    ]),
    ("klasifikasi-data", "IT & Keamanan", "Kebijakan Klasifikasi dan Perlindungan Data", "IT-POL-006", [
        "empat tingkat klasifikasi: Publik, Internal, Rahasia, Sangat Rahasia",
        "data Sangat Rahasia (misalnya data gaji dan data pribadi pelanggan) wajib dienkripsi dan tidak boleh dikirim lewat email",
        "dokumen Rahasia dihapus otomatis dari folder bersama setelah 2 tahun kecuali ada retensi hukum",
        "kebocoran data pribadi dilaporkan ke DPO dalam 24 jam",
    ]),
    ("akses-onboarding-offboarding", "IT & Keamanan", "Prosedur Akses Karyawan Masuk dan Keluar", "IT-SOP-002", [
        "akun karyawan baru dibuat paling lambat 1 hari kerja sebelum tanggal mulai bekerja",
        "akses karyawan yang keluar dicabut pada pukul 17.00 di hari terakhir bekerja",
        "laptop wajib dikembalikan ke IT paling lambat hari terakhir; denda Rp 15.000.000 jika hilang",
        "review hak akses aplikasi dilakukan setiap 6 bulan oleh atasan langsung",
    ]),
    ("backup-pemulihan", "IT & Keamanan", "Kebijakan Backup dan Pemulihan Bencana", "IT-POL-009", [
        "backup database produksi dilakukan setiap 4 jam dan disimpan 35 hari",
        "target pemulihan (RTO) sistem inti 4 jam dan batas kehilangan data (RPO) 1 jam",
        "uji pemulihan bencana dilakukan setiap 6 bulan",
        "salinan backup disimpan di 2 lokasi berbeda, salah satunya di luar Jakarta",
    ]),
    ("keselamatan-kerja", "Operasional", "SOP Keselamatan dan Kesehatan Kerja Kantor", "OPS-SOP-001", [
        "simulasi evakuasi kebakaran dilakukan setiap 6 bulan",
        "titik kumpul evakuasi kantor pusat di lapangan parkir timur",
        "setiap lantai wajib memiliki minimal 2 petugas P3K bersertifikat",
        "kecelakaan kerja dilaporkan ke tim K3 dalam 1x24 jam melalui formulir insiden",
    ]),
    ("kendaraan-dinas", "Operasional", "Kebijakan Kendaraan Dinas", "OPS-POL-003", [
        "kendaraan dinas melekat hanya untuk level General Manager ke atas",
        "BBM kendaraan dinas ditanggung maksimal 200 liter per bulan",
        "kendaraan dinas tidak boleh dipakai ke luar kota tanpa izin tertulis atasan",
        "denda tilang dan biaya kerusakan akibat kelalaian ditanggung pengemudi",
    ]),
]

PROMPT = """Tulis dokumen kebijakan internal perusahaan fiktif PT Nusantara Sejahtera dalam Bahasa Indonesia formal, format Markdown.

Judul: {title}
Nomor dokumen: {number}

Fakta yang WAJIB muncul persis (angka tidak boleh diubah):
{facts}

Ketentuan:
- Mulai dengan "# {title}" lalu satu paragraf berisi nomor dokumen, tanggal berlaku (2026), dan pemilik dokumen.
- 4 sampai 6 bagian bernomor dengan heading "## 1. ...", beberapa punya sub-bagian "### 1.1 ...".
- Minimal satu tabel Markdown berisi angka konkret.
- Tambahkan ketentuan pendukung yang realistis (prosedur, pengecualian, sanksi), tetapi jangan menambah angka yang bertentangan dengan fakta wajib.
- 600 sampai 900 kata. Jangan menulis kalimat pembuka atau penutup di luar dokumen.
"""


def _clean(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:markdown)?\s*|\s*```$", "", text)
    return text.strip() + "\n"


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    force = "--force" in sys.argv
    for slug, _, title, number, facts in TOPICS:
        path = OUT / f"{slug}.md"
        if path.exists() and not force:
            print(f"skip {path.name}")
            continue
        text, usage = await llm.complete(
            [{"role": "user", "content": PROMPT.format(
                title=title, number=number, facts="\n".join(f"- {f}" for f in facts))}],
            max_tokens=2500,
            max_wait=120,
        )
        text = _clean(text)
        missing = [f for f in facts if not all(n in text for n in re.findall(r"\d[\d.,]*", f))]
        path.write_text(text)
        note = f" (cek angka: {len(missing)} fakta)" if missing else ""
        print(f"wrote {path.name}: {len(text.split())} kata, {usage.output_tokens} token{note}")


if __name__ == "__main__":
    asyncio.run(main())
