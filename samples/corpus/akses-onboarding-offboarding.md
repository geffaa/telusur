# Prosedur Akses Karyawan Masuk dan Keluar  

**Nomor Dokumen:** IT‑SOP‑002  
**Tanggal Berlaku:** 1 Januari 2026  
**Pemilik Dokumen:** Departemen Teknologi Informasi – PT Nusantara Sejahtera  

---  

## 1. Ruang Lingkup dan Tujuan  

Prosedur ini mengatur tata cara pembuatan akun, pemberian hak akses, serta pencabutan akses bagi karyawan yang baru bergabung maupun yang mengakhiri masa kerja di PT Nusantara Sejahtera. Tujuannya adalah memastikan keamanan informasi, kepatuhan terhadap regulasi internal, dan kelancaran operasional TI.  

## 2. Definisi Istilah  

| No | Istilah                | Penjelasan singkat                                                                 |
|----|------------------------|------------------------------------------------------------------------------------|
| 1  | **Karyawan Baru**      | Individu yang telah menandatangani kontrak kerja dan akan mulai bekerja.          |
| 2  | **Karyawan Keluar**    | Individu yang mengakhiri hubungan kerja, baik karena resign, PHK, atau pensiun.   |
| 3  | **Akun TI**            | Username, password, dan hak akses yang diberikan pada sistem perusahaan.          |
| 4  | **Laptop Perusahaan**  | Perangkat keras yang dikeluarkan oleh IT untuk keperluan kerja.                    |
| 5  | **Atasan Langsung**    | Supervisor atau manajer yang memiliki otoritas atas karyawan bersangkutan.        |

## 3. Prosedur Karyawan Masuk  

### 3.1 Persiapan Akun  

1. **Permintaan Akun** – HR mengirimkan formulir “Request New Employee Account” ke IT paling lambat **1 hari kerja sebelum tanggal mulai bekerja**.  
2. **Pembuatan Akun** – Tim IT membuat username, password sementara, dan mengaktifkan grup keamanan sesuai jabatan.  
3. **Notifikasi** – Karyawan menerima email berisi kredensial sementara dan panduan perubahan password pada hari pertama kerja.  

### 3.2 Penyerahan Perangkat  

1. **Laptop** – IT menyiapkan laptop yang telah terinstal sistem operasi standar, antivirus, dan aplikasi wajib.  
2. **Pengembalian Jaminan** – Karyawan menandatangani formulir penerimaan perangkat.  

### 3.3 Orientasi Keamanan  

1. **Pelatihan** – Karyawan wajib mengikuti modul “Keamanan Informasi” dalam 3 hari kerja pertama.  
2. **Konfirmasi** – Setelah selesai, karyawan menandatangani lembar persetujuan kebijakan keamanan.  

## 4. Prosedur Karyawan Keluar  

### 4.1 Pencabutan Akses  

- Semua hak akses aplikasi, email, VPN, dan sistem internal **dicabut pada pukul 17.00 di hari terakhir bekerja**.  
- IT melakukan verifikasi pencabutan melalui log audit dan melaporkan hasil ke HR.  

### 4.2 Pengembalian Perangkat  

- **Laptop wajib dikembalikan ke IT paling lambat hari terakhir**.  
- Jika laptop tidak dikembalikan atau hilang, karyawan dikenakan denda **Rp 15.000.000** sesuai kebijakan aset perusahaan.  

### 4.3 Dokumentasi dan Exit Interview  

1. **Form Exit** – HR mengirimkan formulir exit yang mencakup konfirmasi pengembalian aset dan persetujuan denda bila diperlukan.  
2. **Exit Interview** – Dilakukan oleh HR untuk mengumpulkan umpan balik dan memastikan tidak ada data perusahaan yang tertinggal.  

## 5. Review dan Pemeliharaan Hak Akses  

- **Review hak akses aplikasi dilakukan setiap 6 bulan oleh atasan langsung**. Atasan menilai apakah hak akses masih relevan dengan tugas karyawan.  
- Hasil review dicatat dalam “Access Review Log” dan diserahkan ke IT untuk penyesuaian bila diperlukan.  

## 6. Pengecualian, Sanksi, dan Penanganan Insiden  

### 6.1 Pengecualian  

- **Karyawan kontrak jangka pendek (≤ 3 bulan)** dapat menerima akun dengan masa aktif terbatas, namun tetap mengikuti prosedur pencabutan pada pukul 17.00 hari terakhir.  
- **Proyek khusus** yang memerlukan akses sementara dapat diberikan “Temporary Access Token” yang otomatis kadaluarsa setelah 30 hari.  

### 6.2 Sanksi  

| Pelanggaran                              | Sanksi                                                                 |
|------------------------------------------|------------------------------------------------------------------------|
| Keterlambatan pengembalian laptop        | Denda Rp 15.000.000 dan/atau pemotongan gaji sesuai kebijakan HR.      |
| Penyalahgunaan akun (akses tidak sah)   | Peringatan tertulis, suspensi akun, atau pemutusan hubungan kerja.    |
| Tidak mengikuti review hak akses 6‑bulanan| Peringatan dan peninjauan kembali oleh manajemen TI.                  |

### 6.3 Penanganan Insiden  

1. **Deteksi** – Sistem SIEM (Security Information and Event Management) mencatat aktivitas mencurigakan.  
2. **Respons** – Tim Keamanan TI mengisolasi akun, melakukan analisis forensik, dan melaporkan ke Manajemen Risiko.  
3. **Pemulihan** – Setelah penyelidikan, akun dapat dipulihkan atau dinonaktifkan permanen sesuai keputusan.  

---  

**Catatan:** Dokumen ini bersifat dinamis dan akan direvisi bila terdapat perubahan regulasi, teknologi, atau kebijakan internal perusahaan. Semua revisi harus disetujui oleh Kepala Departemen TI dan Direksi PT Nusantara Sejahtera.
