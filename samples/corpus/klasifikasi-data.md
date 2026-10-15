# Kebijakan Klasifikasi dan Perlindungan Data  

**Nomor Dokumen:** IT-POL-006  
**Tanggal Berlaku:** 1 Januari 2026  
**Pemilik Dokumen:** Departemen Teknologi Informasi – PT Nusantara Sejahtera  

---  

## 1. Tujuan dan Ruang Lingkup  

Kebijakan ini menetapkan standar klasifikasi, penanganan, dan perlindungan data yang dimiliki, dikelola, atau diproses oleh PT Nusantara Sejahtera. Kebijakan berlaku untuk seluruh karyawan, kontraktor, mitra bisnis, serta sistem informasi yang berada di dalam atau di luar jaringan perusahaan, termasuk layanan cloud yang disetujui.  

## 2. Tingkat Klasifikasi Data  

Data perusahaan dibagi menjadi empat tingkat klasifikasi:  

| Tingkat | Definisi Singkat | Contoh Data |
|--------|------------------|-------------|
| **Publik** | Informasi yang dapat diakses oleh publik tanpa menimbulkan risiko bagi perusahaan. | Materi pemasaran, laporan tahunan yang dipublikasikan. |
| **Internal** | Informasi yang hanya boleh diakses oleh karyawan dan pihak yang berwenang. | Prosedur operasional, agenda rapat internal. |
| **Rahasia** | Informasi yang bila terungkap dapat menimbulkan kerugian material atau reputasi. | Rencana bisnis, kontrak vendor. |
| **Sangat Rahasia** | Informasi yang paling sensitif; kebocoran dapat menyebabkan kerugian signifikan atau pelanggaran hukum. | Data gaji dan data pribadi pelanggan. |

### 2.1 Penetapan Tingkat Klasifikasi  

Penetapan tingkat klasifikasi dilakukan oleh pemilik data bersama dengan DPO (Data Protection Officer). Setiap perubahan klasifikasi harus didokumentasikan dalam sistem manajemen dokumen perusahaan.  

## 3. Penanganan Data Berdasarkan Klasifikasi  

### 3.1 Data Publik dan Internal  

- **Penyimpanan:** Dapat disimpan pada server internal atau layanan cloud yang telah disetujui.  
- **Akses:** Dibatasi melalui kontrol akses berbasis peran (RBAC).  

### 3.2 Data Rahasia  

- **Enkripsi:** Wajib dienkripsi saat disimpan di media yang dapat diakses secara eksternal.  
- **Penghapusan Otomatis:** Dokumen Rahasia dihapus otomatis dari folder bersama setelah **2 tahun** kecuali ada retensi hukum yang mengharuskan penyimpanan lebih lama.  
- **Distribusi:** Diperbolehkan melalui email internal dengan lampiran yang dilindungi password, namun password harus dikirimkan melalui kanal terpisah.  

### 3.3 Data Sangat Rahasia  

- **Enkripsi:** Data Sangat Rahasia (misalnya data gaji dan data pribadi pelanggan) wajib dienkripsi dengan algoritma AES‑256 atau setara.  
- **Pengiriman:** Tidak boleh dikirim lewat email dalam bentuk apapun; harus menggunakan platform transfer file yang aman dan terotorisasi.  
- **Akses:** Hanya diberikan kepada individu yang memiliki otorisasi tertulis dan telah menyelesaikan pelatihan keamanan data tingkat lanjutan.  

## 4. Insiden Kebocoran Data  

### 4.1 Pelaporan  

Setiap kebocoran data pribadi harus dilaporkan ke DPO dalam **24 jam** sejak terdeteksi. Laporan harus mencakup:  

1. Jenis data yang terdampak.  
2. Waktu dan cara kebocoran terjadi.  
3. Langkah mitigasi yang telah diambil.  

### 4.2 Tindakan Korektif  

- **Investigasi:** DPO bersama tim keamanan melakukan investigasi menyeluruh dalam waktu 48 jam.  
- **Notifikasi:** Jika kebocoran melibatkan data pribadi pelanggan, notifikasi kepada regulator dan pemilik data harus dilakukan sesuai dengan peraturan yang berlaku (misalnya GDPR atau peraturan lokal).  

### 4.3 Sanksi  

Pelanggaran terhadap kebijakan ini dapat dikenakan sanksi disipliner, mulai dari peringatan tertulis hingga pemutusan hubungan kerja, tergantung pada tingkat keparahan dan niat pelanggar.  

## 5. Prosedur Pengecualian dan Review  

### 5.1 Pengecualian  

Pengecualian atas ketentuan enkripsi atau pengiriman data Sangat Rahasia dapat diberikan hanya bila:  

- Diperlukan untuk kepatuhan hukum yang tidak memungkinkan penggunaan teknologi enkripsi yang ada.  
- Disetujui secara tertulis oleh Kepala Departemen TI dan DPO.  

Setiap pengecualian harus dicatat dalam log khusus dan dievaluasi kembali setiap 12 bulan.  

### 5.2 Review Kebijakan  

Kebijakan ini akan ditinjau secara periodik oleh Komite Keamanan Informasi minimal **setiap 12 bulan** atau lebih cepat bila terdapat perubahan regulasi, teknologi, atau insiden signifikan. Revisi akan disebarkan melalui portal internal dan disertai pelatihan ulang bagi semua pemangku kepentingan.  

---  

*Dokumen ini bersifat rahasia dan hanya boleh diakses oleh pihak yang berwenang sesuai dengan tingkat klasifikasi data yang tercantum.*
