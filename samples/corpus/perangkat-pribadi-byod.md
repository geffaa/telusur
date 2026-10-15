# Kebijakan Penggunaan Perangkat Pribadi (BYOD)

**Nomor Dokumen:** IT-POL-004  
**Tanggal Berlaku:** 1 Januari 2026  
**Pemilik Dokumen:** Departemen Teknologi Informasi – PT Nusantara Sejahtera  

---

## 1. Ruang Lingkup dan Definisi  

### 1.1. Ruang Lingkup  
Kebijakan ini mengatur penggunaan perangkat pribadi (smartphone, tablet, laptop, dan perangkat lainnya) oleh karyawan PT Nusantara Sejahtera untuk mengakses sumber daya TI perusahaan, termasuk email, aplikasi chat, dan data kantor. Kebijakan berlaku untuk seluruh karyawan tetap, kontrak, magang, serta konsultan yang memiliki akses ke jaringan internal perusahaan.

### 1.2. Definisi  
- **BYOD (Bring Your Own Device):** Kebijakan yang memperbolehkan karyawan menggunakan perangkat milik pribadi untuk keperluan pekerjaan.  
- **MDM (Mobile Device Management):** Sistem manajemen perangkat seluler yang dipasang pada ponsel pribadi untuk mengontrol keamanan, konfigurasi, dan kebijakan akses.  
- **Data Kantor:** Semua informasi, dokumen, email, dan pesan yang bersifat resmi milik PT Nusantara Sejahtera.  

---

## 2. Ketentuan Penggunaan Perangkat Pribadi  

### 2.1. Ponsel Pribadi  
- **Akses Email dan Chat:** *Ponsel pribadi boleh mengakses email dan chat kantor jika terdaftar di aplikasi MDM.*  
- **Registrasi MDM:** Setiap ponsel yang akan dipakai untuk keperluan kerja wajib didaftarkan melalui portal IT dan menginstal aplikasi MDM yang disetujui. Registrasi mencakup verifikasi identitas pengguna, nomor seri perangkat, serta persetujuan kebijakan keamanan.  
- **Penghapusan Data Jarak Jauh:** *Perusahaan berhak menghapus data kantor dari ponsel pribadi dari jarak jauh saat karyawan keluar.* Proses ini dilakukan melalui perintah MDM setelah prosedur off‑boarding selesai.  

### 2.2. Laptop Pribadi  
- **Pembatasan Akses:** *Laptop pribadi tidak boleh dipakai untuk mengakses sistem internal mana pun.* Semua akses ke jaringan internal, VPN, atau aplikasi berbasis web internal harus dilakukan melalui perangkat yang dikelola perusahaan (desktop atau laptop perusahaan).  

### 2.3. Tunjangan Perangkat  
- **Komponen Tunjangan:** *Tunjangan pemakaian ponsel pribadi Rp 150.000 per bulan untuk karyawan yang terdaftar.* Tunjangan ini diberikan secara bulanan melalui slip gaji dan tidak dapat digabungkan dengan tunjangan lain yang bersifat serupa.  

| No | Kategori | Besaran Tunjangan | Syarat Penerimaan |
|----|----------|-------------------|-------------------|
| 1  | Ponsel Pribadi (terdaftar MDM) | Rp 150.000 per bulan | Registrasi MDM, kepatuhan kebijakan keamanan, dan tidak ada pelanggaran selama 3 bulan terakhir |

---

## 3. Prosedur Pendaftaran dan Pengelolaan  

### 3.1. Prosedur Pendaftaran MDM  
1. **Pengajuan:** Karyawan mengisi formulir “Permohonan BYOD – Ponsel” melalui sistem HRIS.  
2. **Verifikasi:** Tim IT memeriksa keabsahan perangkat (IMEI, OS, versi keamanan).  
3. **Instalasi:** Karyawan mengunduh aplikasi MDM resmi dari portal internal dan mengikuti panduan instalasi.  
4. **Aktivasi:** Setelah instalasi, perangkat otomatis terdaftar dan mendapatkan profil keamanan (enkripsi, password kompleks, remote wipe).  

### 3.2. Prosedur Off‑Boarding  
1. **Notifikasi:** HR mengirimkan notifikasi kepada tim IT 5 hari kerja sebelum tanggal pemberhentian.  
2. **Remote Wipe:** Tim IT mengeksekusi perintah penghapusan data kantor pada semua ponsel pribadi yang terdaftar.  
3. **Konfirmasi:** Karyawan diminta menandatangani formulir konfirmasi bahwa data pribadi tidak terpengaruh oleh proses wipe.  

### 3.3. Pengecualian  
- **Perangkat Khusus:** Untuk pekerjaan yang memerlukan perangkat khusus (misalnya, perangkat medis atau alat ukur), perusahaan dapat memberikan perangkat khusus yang dikelola secara terpisah.  
- **Kondisi Darurat:** Dalam situasi darurat operasional, IT dapat memberikan akses sementara ke sistem internal melalui laptop pribadi dengan persetujuan tertulis dari Manajer TI. Akses ini akan dicatat dan dibatasi waktu.  

---

## 4. Keamanan, Pengawasan, dan Sanksi  

### 4.1. Keamanan Data  
- Semua ponsel yang terdaftar wajib mengaktifkan **enkripsi penuh** dan **kunci layar otomatis** (minimal 6 digit PIN atau biometrik).  
- Aplikasi email dan chat perusahaan harus di‑configure untuk **autentikasi dua faktor (2FA)**.  
- Perangkat harus menerima **pembaruan sistem operasi** dan **patch keamanan** secara rutin; kegagalan memperbarui dalam 30 hari akan dianggap pelanggaran.  

### 4.2. Pengawasan  
- Tim IT berhak melakukan **audit keamanan** secara berkala (minimal sekali setiap kuartal) terhadap perangkat yang terdaftar.  
- Log akses, instalasi aplikasi, dan perubahan konfigurasi akan disimpan selama **12 bulan** untuk keperluan investigasi.  

### 4.3. Sanksi  
| Tingkat Pelanggaran | Contoh Pelanggaran | Sanksi |
|---------------------|--------------------|--------|
| Ringan | Tidak mengaktifkan enkripsi, menolak instalasi MDM | Peringatan tertulis, penangguhan tunjangan selama 1 bulan |
| Sedang | Menggunakan laptop pribadi untuk mengakses sistem internal | Denda internal sebesar Rp 500.000, pencabutan hak BYOD selama 3 bulan |
| Berat | Membocorkan data kantor melalui perangkat pribadi, mengubah konfigurasi MDM secara tidak sah | Pemutusan hubungan kerja (PHK) dengan pemberitahuan sesuai UU Ketenagakerjaan, serta tindakan hukum bila diperlukan |

### 4.4. Penanganan Insiden  
- Setiap insiden keamanan (misalnya, kehilangan ponsel, pencurian data) harus dilaporkan ke **Helpdesk IT** dalam waktu **24 jam**.  
- Tim IT akan melakukan **investigasi**, mengaktifkan remote wipe, dan menyusun laporan insiden yang akan diserahkan kepada Manajemen Risiko.  

---

## 5. Peninjauan Kebijakan  

Kebijakan ini akan ditinjau **setiap tahun** atau lebih sering bila terdapat perubahan regulasi, teknologi, atau kebutuhan operasional. Revisi akan disetujui oleh **Chief Information Officer (CIO)** dan **Chief Human Resources Officer (CHRO)**, kemudian diumumkan melalui portal internal perusahaan.  

---  

*Dokumen ini bersifat internal dan rahasia. Penyebaran atau penggunaan di luar lingkup PT Nusantara Sejahtera tanpa otorisasi dapat dikenai sanksi sesuai ketentuan yang berlaku.*
