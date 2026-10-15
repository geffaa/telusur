# Kebijakan Backup dan Pemulihan Bencana  

**Nomor Dokumen:** IT-POL-009  
**Tanggal Berlaku:** 15 Oktober 2026  
**Pemilik Dokumen:** Departemen Teknologi Informasi – PT Nusantara Sejahtera  

## 1. Ruang Lingkup dan Tujuan  

Kebijakan ini mengatur prosedur backup data, penyimpanan salinan backup, serta proses pemulihan bencana (disaster recovery) untuk seluruh sistem informasi PT Nusantara Sejahtera. Kebijakan berlaku bagi semua unit bisnis, departemen, dan pihak ketiga yang mengelola atau mengakses infrastruktur TI perusahaan. Tujuannya adalah memastikan kontinuitas operasional, meminimalkan kehilangan data, dan memenuhi target pemulihan yang telah ditetapkan.

## 2. Definisi  

| Istilah | Penjelasan |
|---|---|
| **Backup** | Salinan data yang dibuat secara periodik untuk tujuan pemulihan. |
| **RTO (Recovery Time Objective)** | Waktu maksimum yang diperbolehkan untuk mengembalikan layanan setelah terjadinya gangguan. |
| **RPO (Recovery Point Objective)** | Batas maksimum kehilangan data yang dapat diterima, diukur dalam rentang waktu sebelum terjadinya gangguan. |
| **Lokasi Penyimpanan** | Tempat fisik atau virtual di mana salinan backup disimpan. |
| **Uji Pemulihan Bencana** | Simulasi pemulihan sistem yang dilakukan secara berkala untuk memverifikasi keandalan prosedur. |

## 3. Kebijakan Backup  

### 3.1 Frekuensi dan Retensi  

- **Database produksi** harus dibackup setiap **4 jam** dan salinan backup disimpan selama **35 hari**.  
- Backup file aplikasi, konfigurasi server, dan data pengguna dilakukan minimal **setiap 8 jam** dengan retensi **30 hari**.  

### 3.2 Lokasi Penyimpanan  

- Salinan backup disimpan di **2 lokasi berbeda**, salah satunya berada **di luar Jakarta** untuk mengurangi risiko kegagalan geografis.  
- Setiap lokasi harus memiliki kontrol akses fisik dan logika yang memadai, termasuk enkripsi data saat transit dan saat istirahat.  

### 3.3 Verifikasi Integritas  

- Setiap selesai proses backup, sistem otomatis melakukan checksum (SHA‑256) dan mencatat hasil pada log audit.  
- Verifikasi manual dilakukan oleh tim IT pada akhir setiap minggu kerja.  

## 4. Kebijakan Pemulihan Bencana  

### 4.1 Target Pemulihan  

- **RTO** untuk sistem inti (ERP, CRM, dan sistem keuangan) ditetapkan **4 jam**.  
- **RPO** ditetapkan **1 jam**, artinya data yang hilang tidak boleh melebihi satu jam sebelum gangguan.  

### 4.2 Prosedur Pemulihan  

1. **Deteksi Insiden** – Tim Keamanan Informasi (CSIRT) mengidentifikasi dan mengklasifikasikan insiden.  
2. **Pemberitahuan** – Notifikasi otomatis dikirim ke semua pemangku kepentingan kritis dalam waktu 15 menit.  
3. **Aktivasi DR Site** – Jika pusat data utama tidak dapat dipulihkan dalam 2 jam, tim DR mengaktifkan situs cadangan di luar Jakarta.  
4. **Pemulihan Data** – Menggunakan backup terakhir yang tidak lebih lama dari **1 jam** (sesuai RPO) untuk memulihkan database produksi.  
5. **Verifikasi Layanan** – Setelah sistem kembali online, dilakukan serangkaian tes fungsional untuk memastikan integritas data dan ketersediaan layanan.  

### 4.3 Uji Pemulihan  

- **Uji pemulihan bencana** dilakukan **setiap 6 bulan**.  
- Setiap siklus uji mencakup skenario kegagalan total pusat data, kegagalan jaringan, dan korupsi data.  
- Hasil uji dicatat dalam laporan yang harus ditandatangani oleh Kepala IT dan Manajer Risiko.  

## 5. Pengecualian dan Penanganan Khusus  

- **Data yang bersifat sensitif** (mis. data pribadi pelanggan) harus dienkripsi dengan kunci yang dikelola oleh Tim Keamanan Informasi; backup untuk data ini tidak boleh disimpan di lokasi yang tidak memiliki sertifikasi ISO 27001.  
- **Aplikasi legacy** yang tidak mendukung backup otomatis harus dijadwalkan secara manual oleh pemilik aplikasi, dengan persetujuan tertulis dari Manajer IT.  
- **Kondisi force majeure** (bencana alam, kerusuhan) dapat mempengaruhi jadwal backup; dalam hal ini, tim DR harus mengaktifkan prosedur darurat dan melaporkan penyesuaian jadwal dalam 24 jam.  

## 6. Penegakan, Audit, dan Sanksi  

- **Audit internal** terhadap kepatuhan kebijakan dilakukan **setiap kuartal** oleh Internal Audit Department.  
- Pelanggaran terhadap prosedur backup (mis. tidak melakukan backup sesuai jadwal, atau menyimpan backup di lokasi yang tidak disetujui) akan dikenakan sanksi administratif, mulai dari peringatan tertulis hingga **penurunan hak akses** pada sistem TI.  
- Jika pelanggaran mengakibatkan kerugian finansial atau reputasi perusahaan, sanksi dapat meliputi **pemutusan kontrak kerja** atau **tuntutan hukum** sesuai dengan peraturan ketenagakerjaan dan perundang‑undangan yang berlaku.  

## 7. Tanggung Jawab  

| Peran | Tanggung Jawab Utama |
|---|---|
| **Kepala IT** | Menyetujui kebijakan, memastikan alokasi sumber daya, dan melaporkan kepatuhan kepada Direksi. |
| **Manajer Infrastruktur** | Mengelola infrastruktur backup, memastikan retensi dan replikasi data sesuai kebijakan. |
| **Tim Operasional** | Menjalankan backup harian, memantau log, dan melaporkan kegagalan. |
| **CSIRT** | Menangani insiden, mengkoordinasikan pemulihan, dan melaporkan hasil uji DR. |
| **Internal Audit** | Melakukan audit kepatuhan dan merekomendasikan perbaikan. |

## 8. Revisi Kebijakan  

Kebijakan ini akan ditinjau kembali **setiap 12 bulan** atau lebih cepat bila terdapat perubahan signifikan pada infrastruktur TI, regulasi, atau hasil audit yang mengindikasikan kebutuhan revisi. Semua perubahan harus didokumentasikan dalam **Log Revisi** dan disetujui oleh Kepala IT serta Dewan Komisaris.  

---  

*Dokumen ini bersifat internal dan rahasia. Penyebaran atau penggunaan di luar lingkup PT Nusantara Sejahtera tanpa otorisasi dapat dikenakan sanksi hukum.*
