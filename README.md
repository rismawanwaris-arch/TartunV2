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