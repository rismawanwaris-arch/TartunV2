# Tartun V2 - Laporan Tarik Tunai Outlet

Aplikasi dashboard modern untuk manajemen dan analisis data laporan tarik tunai outlet. Aplikasi ini telah dimigrasi sepenuhnya dari REST API Supabase ke backend Express.js lokal dengan penyimpanan SQLite3, sehingga sangat cocok dijalankan mandiri di perangkat lokal atau server **ZimaOS** menggunakan Docker.

---

## 🚀 Fitur Utama
*   **Audit Reversal Otomatis**: Mendeteksi pasangan data transaksi reversal secara otomatis berdasarkan kata kunci tertentu.
*   **Perhitungan Biaya Admin Dinamis**: Menghitung biaya admin secara otomatis berdasarkan nominal transaksi dengan 31 aturan segmentasi untuk metode *QR*, *TF/EDC*, dan *TIKET/Auto Deposit*.
*   **Konsolidasi Penggabungan Nama**: Otomatis menggabungkan nama outlet/merchant yang bervariasi ke satu nama *Parent* yang rapi.
*   **Manajemen Sesi Tunggal (*Single Session Lock*)**: Mencegah akun yang sama login bersamaan di beberapa perangkat secara bersamaan.
*   **Keamanan Ekstra**: Dilengkapi middleware Express Rate Limit untuk mencegah brute force dan Helmet untuk perlindungan headers HTTP.
*   **Impor Data Massal**: Mendukung copy-paste data massal langsung dari spreadsheet (Excel/Google Sheets) atau unggah file CSV.

---

## 🛠️ Tech Stack
*   **Backend**: Node.js, Express.js
*   **Database**: SQLite3 (melalui driver `sqlite3` npm package)
*   **Keamanan & Otentikasi**: JWT (JSON Web Tokens), bcryptjs, Helmet, Express Rate Limit
*   **Frontend**: HTML5, Tailwind CSS, Javascript (Vanilla ES6), Lucide Icons, Virtual Scroll (untuk render ratusan ribu baris data secara instan).

---

## 🔑 Akun Master Bawaan (Default)
Saat database pertama kali diinisialisasi, akun Master berikut akan dibuat secara otomatis:
*   **Email**: `firz411@gmail.com`
*   **Password**: `FkOf2025`
*   **Role**: `Master`

*(Catatan: Anda dapat mengganti password Anda secara mandiri di menu Pengaturan Akun).*

---

## 💻 Cara Menjalankan Project Secara Lokal

### Prasyarat
*   Node.js (versi 18 ke atas direkomendasikan)
*   NPM (Package Manager bawaan Node.js)

### Langkah-langkah
1.  **Clone atau Unduh Repository** ke komputer lokal Anda.
2.  **Buka Terminal** dan masuk ke direktori project:
    ```bash
    cd "Tartun V2"
    ```
3.  **Install Dependensi**:
    ```bash
    npm install
    ```
4.  **Jalankan Server**:
    ```bash
    npm start
    ```
5.  **Akses Aplikasi**: Buka browser Anda dan akses halaman [http://localhost:3000](http://localhost:3000).

---

## 🐳 Cara Deploy Menggunakan Docker (ZimaOS / VPS)

Project ini sudah dilengkapi dengan berkas `Dockerfile` dan `docker-compose.yml` untuk deployment container sekali jalan. Data database SQLite akan disimpan di dalam volume mount host agar tidak hilang saat container di-restart.

### Langkah-langkah
1.  Pastikan Docker dan Docker Compose sudah terpasang di server/perangkat Anda.
2.  Jalankan perintah berikut di direktori utama project:
    ```bash
    docker-compose up -d --build
    ```
3.  Container akan berjalan di latar belakang, dan aplikasi dapat diakses melalui port `3000` (e.g. `http://<ip-server-zimaos>:3000`).

---

## 📁 Struktur Direktori Project

*   `server.js` - Berkas utama server Express.js dan registrasi rute API.
*   `db.js` - Logika inisialisasi database SQLite3 dan helper CRUD database ter-promisify.
*   `routes/` - Kumpulan berkas router backend (modular):
    *   `auth.js` - Registrasi, login, verifikasi JWT, dan sesi tunggal.
    *   `transactions.js` - API penambahan, pengeditan, penghapusan massal, dan pengecekan duplikat transaksi.
    *   `users.js` - API manajemen pengguna (Master/Admin), role, status, dan ubah password.
    *   `settings.js` - API penyimpanan konfigurasi umum, parameter biaya admin, dan rule audit.
    *   `logs.js` - API pencatatan log aktivitas sistem/pengguna.
*   `middleware/` - Kumpulan middleware (termasuk `auth.js` untuk proteksi otentikasi rute).
*   `public/` - Berkas frontend (Client-side):
    *   `index.html` - Kerangka dasar antarmuka SPA (Single Page Application).
    *   `style.css` - Custom styling dan tema dashboard.
    *   `js/` - Logika Javascript modular frontend:
        *   `main.js` - Pengatur alur utama aplikasi (bootloader & inisialisasi modul).
        *   `api.js` - Wrapper pemanggilan REST API backend Express.
        *   `auth.js` - Logika otentikasi frontend (login, logout, sinkronisasi token).
        *   `ui.js` - Manajemen manipulasi DOM, rendering chart, dan visualisasi dasbor.
        *   `handlers.js` - Penanganan aksi interaksi user (impor data, validasi, export, dll).
        *   `state.js` - Penyimpan state global runtime aplikasi.
        *   `utils.js` - Helper pemformatan uang, tanggal, dan pengolahan angka.
*   `data/` - Direktori penyimpanan berkas database SQLite (`tartun.db`) (ter-ignore di git, tersimpan di volume Docker).
*   `uploads/` - Tempat penyimpanan aset gambar unggahan seperti avatar profil pengguna.
