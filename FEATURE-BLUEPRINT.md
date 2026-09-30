# Tartun V2 — Blueprint Fitur

> Spesifikasi rinci **per fitur**: tujuan, siapa yang memakai, alur, komponen kode,
> data & endpoint, aturan bisnis, validasi, edge case, tes, dan status/utang yang
> diketahui. Pelengkap dari:
>
> - `ARCHITECTURE.md` — gambaran sistem (topologi, skema, pola kode, deploy).
> - `PERFORMANCE-BLUEPRINT.md` — playbook optimasi load.
> - `UPLOAD-BLUEPRINT.md` — playbook portabel sistem upload & anti double-upload.
> - `rebuild_prompt.md` — spesifikasi historis versi Supabase (**sudah tidak sesuai kode**).
>
> Terakhir diperbarui: 2026-09-29 · Basis kode: `main` (commit `774afd7` + sesudahnya).
> Referensi kode ditulis `file:fungsi`. Saat mengubah perilaku fitur, perbarui bagian
> fitur tersebut di dokumen ini.

---

## Daftar isi

| # | Fitur | Menu / lokasi |
|---|---|---|
| F1 | [Autentikasi & sesi tunggal](#f1-autentikasi--sesi-tunggal) | Tombol login di sidebar |
| F2 | [Manajemen pengguna & profil](#f2-manajemen-pengguna--profil) | Manajemen Pengguna |
| F3 | [Filter global & periode bisnis](#f3-filter-global--periode-bisnis) | Panel filter atas |
| F4 | [Pencarian teks](#f4-pencarian-teks) | Panel filter atas |
| F5 | [Preset filter](#f5-preset-filter) | Panel filter atas |
| F6 | [Dashboard & widget](#f6-dashboard--widget) | Dashboard |
| F7 | [Tabel Ringkasan](#f7-tabel-ringkasan) | Tabel Ringkasan |
| F8 | [Chart Data](#f8-chart-data) | Chart Data |
| F9 | [Analisis Data](#f9-analisis-data) | Analisis Data |
| F10 | [Batch Filter Keterangan (RRN)](#f10-batch-filter-keterangan-rrn) | Analisis Data |
| F11 | [Audit Reversal](#f11-audit-reversal) | Analisis Data |
| F12 | [Rincian Transaksi per outlet](#f12-rincian-transaksi-per-outlet) | Klik baris Tabel Ringkasan |
| F13 | [Input: paste spreadsheet (Opsi 1)](#f13-input-paste-spreadsheet-opsi-1) | Input Data |
| F14 | [Input: unggah file berbasis profil (Opsi 2)](#f14-input-unggah-file-berbasis-profil-opsi-2) | Input Data |
| F15 | [Input tunggal](#f15-input-tunggal) | Input Data |
| F16 | [Staging, submit & undo import](#f16-staging-submit--undo-import) | Input Data |
| F17 | [Deteksi duplikat](#f17-deteksi-duplikat) | Input Data, API |
| F18 | [Biaya admin](#f18-biaya-admin) | Semua tampilan angka |
| F19 | [Komisi outlet & CS](#f19-komisi-outlet--cs) | Dashboard, Ringkasan, Chart |
| F20 | [Cek Admin QRIS](#f20-cek-admin-qris) | Cek Admin QRIS (publik) |
| F21 | [Laporan WhatsApp](#f21-laporan-whatsapp) | Tombol lapor di Rincian Transaksi |
| F22 | [Ekspor data](#f22-ekspor-data) | Ringkasan, Analisis, Chart |
| F23 | [Pengaturan global](#f23-pengaturan-global) | Pengaturan |
| F24 | [Profil Format Import](#f24-profil-format-import) | Pengaturan > Data |
| F25 | [API Ingest transaksi QR](#f25-api-ingest-transaksi-qr) | Pengaturan > Sistem |
| F26 | [Userscript KlikBCA Sync](#f26-userscript-klikbca-sync) | `tools/klikbca-sync.user.js` |
| F27 | [Log aktivitas](#f27-log-aktivitas) | Sidebar "Aktivitas Terkini" |
| — | [Lampiran A: matriks hak akses](#lampiran-a-matriks-hak-akses) | |
| — | [Lampiran B: katalog log action](#lampiran-b-katalog-log-action) | |
| — | [Lampiran C: backlog & utang per fitur](#lampiran-c-backlog--utang-per-fitur) | |

Konvensi dalam dokumen ini:

- **Peran**: `Publik` (tidak login) < `Auditor` < `OED` < `Admin` < `Master`.
- **Server** = Express di `routes/` + `utils/`; **Klien** = `public/js/*`.
- Status: ✅ berjalan · ⚠️ berjalan dengan catatan · ❌ tidak berfungsi / kode mati.

---

## F1. Autentikasi & sesi tunggal

**Tujuan** — staf login dengan email & password; satu akun hanya boleh aktif di satu
browser dalam satu waktu.

**Pengguna** — semua peran yang punya akun. Publik tidak perlu login.

**Alur**

1. User klik ikon login (sidebar bawah) → modal login → `AppAuth.login(email, password)`.
2. `POST /api/auth/login` → server cek bcrypt, cek `is_active`, buat `session_id` UUID
   baru, simpan ke `users.session_id`, catat log `LOGIN_SUCCESS`, balas JWT (7 hari) +
   profil.
3. Klien simpan `localStorage.fkof_token` & `fkof_session_id`, lalu
   `handleAuthStateChange('SIGNED_IN')`: muat profil, settings, data, menu per peran.
4. Tiap **90 detik** (dilewati bila tab tersembunyi) `App.startSessionChecker` memanggil
   `GET /api/auth/me`; bila `session_id` DB ≠ lokal → modal **"Sesi Berakhir"** → reload.
5. Logout: `POST /api/auth/logout` mengosongkan `session_id`, log `LOGOUT`, hapus
   localStorage, reload.

**Komponen**

| Lapisan | Lokasi |
|---|---|
| Endpoint | `routes/auth.js`: `/login`, `/me`, `/check-session`, `/logout` |
| Middleware | `middleware/auth.js`: `authenticateToken`, `requireRole` |
| Klien | `public/js/auth.js`: `check`, `handleAuthStateChange`, `login`, `logout`; `main.js`: `startSessionChecker` |

**Data** — `users.session_id`, `users.last_active_at`, `users.is_active`.

**Aturan & validasi**

- Pesan gagal login seragam "Email atau password salah" (tidak membocorkan email mana yang ada).
- Akun nonaktif → 403 saat login; saat sesi berjalan → modal "Akun dinonaktifkan".
- `authenticateToken` membaca user dari DB **setiap request** → role/nonaktif berlaku
  seketika tanpa menunggu token kedaluwarsa.
- API key ingest (F25) **tidak** memakai mekanisme ini dan tidak memengaruhi sesi.

**Edge case**

- Login dari alat otomatis (userscript lama, skrip) dengan akun yang sama akan
  **mengeluarkan sesi manusia**. Solusi: akun terpisah atau API key (F25).
- Sesi tunggal hanya ditegakkan di **klien**: server tetap menerima JWT lama sampai
  kedaluwarsa (7 hari) karena `authenticateToken` tidak membandingkan `session_id`.

**Tes** — belum ada tes otomatis untuk F1.

**Status** ⚠️ — lihat Lampiran C (JWT secret fallback, limiter login, sesi server-side).

---

## F2. Manajemen pengguna & profil

**Tujuan** — Master/Admin membuat, mengubah peran, menonaktifkan, mereset password,
dan menghapus akun; setiap user mengelola profilnya sendiri.

**Pengguna** — Master (semua akun), Admin (semua kecuali Master), semua user (profil sendiri).

**Alur utama**

| Aksi | Klien (`handlers.js`) | Endpoint |
|---|---|---|
| Daftar user + chart peran | `setupUserManagementView`, `ui.renderUserRoleChart` | `GET /api/users` |
| Buat user | `handleCreateUser` | `POST /api/users` |
| Ubah peran | `handleSaveUser` | `PUT /api/users/:id/role` |
| Aktif/nonaktif | `handleToggleUserStatus` | `PUT /api/users/:id/status` |
| Reset password orang lain | `handleSendPasswordReset` (prompt password baru) | `PUT /api/users/:id/password` |
| Hapus user | `handleDeleteUser` (ketik email target) | `DELETE /api/users/:id` |
| Lihat log user | `handleViewUserLogs` | `GET /api/logs?actor=&limit=500` |
| Ganti password sendiri | `handleChangeMyPassword` | `PUT /api/users/me/password` |
| Upload avatar | `handleAvatarUpload` | `PUT /api/users/me/avatar` (multer, 2 MB, `uploads/avatars/`) |

**Aturan**

- Admin tidak melihat, membuat, mengubah, atau menghapus akun **Master** (dicek di server).
- Admin tidak bisa memberi peran Master.
- Password minimal 6 karakter (`/password`, `/me/password`).

**Edge case / celah**

- `POST /api/users` tidak memvalidasi format email, panjang password, maupun nilai
  `role` (CHECK constraint DB menolak role asing → 500, bukan 400).
- `PUT /:id/role` & `/:id/status` tidak mengecek user target ada (target `undefined` → 500).
- Upload avatar tidak membatasi tipe file (hanya ukuran).
- Tidak ada pencegahan menghapus / menonaktifkan **diri sendiri** atau Master terakhir.
- Log `UPDATE_USER_ROLE` / `TOGGLE_USER_STATUS` hanya dari `api.logAction` klien → **tidak tersimpan** (F27).

**Status** ⚠️

---

## F3. Filter global & periode bisnis

**Tujuan** — satu set filter (tanggal mulai/selesai, tipe, teks) yang berlaku untuk
Ringkasan, Chart, dan Analisis.

**Alur**

1. Saat app dimuat: `setDefaultDateFilters` → **kemarin s/d hari ini**.
2. Tombol **"Tarik Bulan Berjalan"** → `setToCurrentBusinessMonth`: periode bisnis
   `monthStartDay` (default 29) bulan ini/lalu s/d `monthEndDay` (default 28) bulan berikutnya.
3. Setiap perubahan → `ui.renderFilteredContent()` → view aktif dirender ulang.
4. **Reset Filter** → `handleFilterReset` (juga mengosongkan filter kolom Analisis).

**Komponen** — `handlers.js`: `getFilteredData` (filter + cache), `setDefaultDateFilters`,
`setToCurrentBusinessMonth`, `handleFilterReset`; `main.js`: listener panel filter.

**Aturan**

- Tanggal dibandingkan memakai `row._ts` (hasil `Date.parse` sekali saat data dimuat).
  Tanggal mulai jam 00:00:00, tanggal selesai 23:59:59.999 **waktu lokal browser**.
- Hasil filter di-cache (`state.filterCache`, maks 24 kombinasi); dikosongkan saat data dimuat ulang.
- Dashboard **tidak** memakai filter ini: selalu hari ini / kemarin / bulan bisnis berjalan.

**Edge case** — `/api/summary` & `/api/dashboard/kpi` (server) memakai **bulan kalender**,
bukan bulan bisnis 29–28. Frontend tidak memakai kedua endpoint itu.

**Status** ✅

---

## F4. Pencarian teks

**Tujuan** — menyaring transaksi berdasarkan nama, keterangan, dan jumlah.

**Aturan** (`handlers.js:buildSearchMatchers`, `getFilteredData`)

| Input | Arti |
|---|---|
| `tartun qr` | Semua kata wajib ada, urutan bebas |
| `"tartun qr"` | Frasa berurutan |
| `sinjay "tartun qr"` | Kombinasi kata + frasa |

- Pencocokan **awal kata** (prefix), tidak peka huruf besar/kecil, spasi ganda diabaikan:
  `qr` cocok dengan `QR`/`QRIS`, **tidak** dengan `Fiqri`/`…GQR`; `sinjay` cocok dengan
  `SINJAY2`; `1605` cocok dengan `1605000`.
- Teks yang dicari: `nama + keterangan + jumlah` (indeks dibangun malas, `ensureSearchIndex`).
- Kutip tak tertutup diperlakukan sebagai kata biasa; karakter regex di-escape.

**Tes** — `tests/search.test.js` (5 kasus: prefix, frasa, gabungan, karakter khusus, kutip tak tertutup).

**Status** ✅

---

## F5. Preset filter

**Tujuan** — user login menyimpan kombinasi filter (search, tanggal, tipe) dengan nama.

**Alur** — dropdown "Preset" → simpan (`handleSavePreset`) / pilih (`handleSelectPreset`)
/ hapus (`handleDeletePreset`). Disimpan per user: `PUT /api/users/me/filter-presets`
→ `users.filter_presets` (JSON).

**Aturan** — nama preset unik (case-insensitive); gagal simpan → state di-rollback.

**Edge case** — preset menyimpan tanggal **absolut**, bukan relatif ("bulan ini");
preset lama tetap menunjuk periode lama.

**Status** ✅

---

## F6. Dashboard & widget

**Tujuan** — ringkasan kinerja hari ini / kemarin / bulan bisnis berjalan, untuk publik
dan staf.

**Widget** (`ui.js:renderDashboardWidgets`, data dari `ui.populateDashboardData`)

| ID | Isi |
|---|---|
| `announcement` | Teks pengumuman + gaya (ukuran, tebal, warna, animasi) |
| `globalCommissionSummary` | Total biaya admin, komisi outlet, komisi CS (bulan ini) |
| `kpiMonthCommission` | Total komisi outlet (bulan ini) |
| `kpiTodayTotal` / `kpiYesterdayTotal` | Total biaya admin hari ini / kemarin |
| `kpiTodayCount` / `kpiYesterdayCount` | Jumlah transaksi hari ini / kemarin |
| `activeOutletsCount` | Jumlah outlet bertransaksi (bulan ini) |
| `kpiMonthTopUser` | Outlet teraktif |
| `progressCommission` | Progres komisi vs `targetCommission` |
| `trendChart` | Tren biaya admin 7 hari (`populateDashboardTrendChart`) |
| `tableTopOutlets` | Top 5 outlet berdasarkan komisi |
| `chartTxType` | Komposisi MANUAL vs TIKET |
| `tableRecentTx` | 5 transaksi terbaru |
| `utilAdminCalculator` | Kalkulator biaya admin (`handleFeeCalculation`) |

**Tata letak**

- Publik: `settings.publicDashboardLayout` (diatur Master di Pengaturan > Umum > Widget Dashboard Publik).
- User login: `users.dashboard_config` lewat modal "Atur Widget" (`openWidgetConfigModal`,
  `saveWidgetConfig`, `resetWidgetConfig`, `PUT /api/users/me/dashboard-config`).
- Ukuran: `small` (1/3), `half` (1/2), `full` (1/1); urutan via SortableJS.

**Aturan** — semua angka dihitung di klien dari `state.allData` memakai `aggregateData`
(F19) dan `admin_fee` tersimpan (F18). Periode bulan = bulan bisnis (F3).

**Edge case** — kalkulator memakai rumus klien (`utils.calculateAdminFee`) dengan baris
sintetis; hasilnya perkiraan untuk nominal yang belum tersimpan.

**Status** ✅

---

## F7. Tabel Ringkasan

**Tujuan** — agregasi per outlet untuk periode filter: biaya admin, nominal tiket, komisi.

**Alur** — `setupSummaryView` → `renderSummaryView`: `getFilteredData` → `aggregateData`
→ baris per outlet → sort (`handleSummarySort`, default komisi outlet menurun) →
virtual scroll (tinggi baris 41 px). Klik baris → Rincian Transaksi (F12).

**Kolom** (`settings.publicSummaryColumns`; publik hanya melihat kolom `visible`,
user login melihat semua)

| ID | Label | Sumber |
|---|---|---|
| `namaPengguna` | Nama Pengguna | nama outlet |
| `manualFee` | Admin | `manualFee + tiketFee` (fee aturan) |
| `tiketFee` | Nom. Tiket | `tiketUnik` (3 digit terakhir TIKET) |
| `totalAdminFee` | Total Biaya Admin | fee aturan + tiket unik |
| `commissionOutlet` | Komisi Outlet | F19 |
| `commissionCS` | Komisi CS | F19 (default tersembunyi untuk publik) |
| `count` | Transaksi | jumlah baris |

Panel info atas: total biaya admin MANUAL & TIKET, jumlah data terfilter / total data.

**Ekspor** — CSV / XLSX / JSON / PDF / Salin, termasuk baris TOTAL (F22).

**Status** ✅

---

## F8. Chart Data

**Tujuan** — visualisasi periode filter.

**Isi** (`handlers.js:renderChartsView`, `ui.js:renderDataCharts`)

- Bar chart per outlet (dibatasi `settings.chartDataLimit`, default 50 outlet teratas).
- Doughnut komposisi tipe MANUAL / TIKET + panel statistik tipe.
- Unduh laporan grafik: PNG / JPEG / PDF (`utils.downloadChartReport`, html2canvas + jsPDF, dimuat lazy).

**Status** ✅

---

## F9. Analisis Data

**Tujuan** — menjelajah, memeriksa, dan mengoreksi transaksi mentah.

**Pengguna** — Auditor, OED, Admin, Master (edit/hapus: Admin & Master).

**Fungsi**

| Fungsi | Detail | Kode |
|---|---|---|
| Tabel | Kolom: pilih, Tanggal, Nama, Jumlah, **Biaya Admin**, Keterangan, Tipe, Detail; virtual scroll 40 px | `renderAnalysisTableHeader`, `createAnalysisTableRow` |
| Filter per kolom | Teks di bawah header; cocok **substring** (`5000` juga cocok `15000`) | `getAnalysisData` |
| Sort | Klik header; default tanggal menurun; `admin_fee` diurutkan numerik | `handleSort` |
| Statistik | Jumlah tampil/total, total nilai, rata-rata, komposisi tipe | `updateAnalysisStats` |
| Mode Semua Data | Abaikan filter global | `handleAnalysisModeChange('allData')` |
| Detail & edit | Modal nama/jumlah/keterangan/tipe → `PUT /bulk-update` (biaya admin & `ref_code` dihitung ulang) | `handleDetailClick`, `handleSaveDetail` |
| Ubah nama massal | Pilih baris → "Ganti nama" → `PUT /bulk-update` `{id, data:{nama}}` | `handleBulkActionClick`, `handleApplyBulkAction` |
| Hapus terpilih | Konfirmasi ketik `HAPUS` → `POST /delete-bulk` | `handleDeleteSelectedAnalysis` |
| Batch filter RRN | F10 | |
| Audit | F11 | |

**Aturan server `PUT /api/transactions/bulk-update`**

- Hanya kolom `tanggal, nama, jumlah, keterangan, tipe_sheet` (whitelist; lainnya 400).
- `jumlah` harus angka; payload wajib `{ id, data }`.
- Perubahan `jumlah/keterangan/tipe_sheet` → hitung ulang `admin_fee` dan `ref_code`.
- Bentrok RRN+jumlah dengan transaksi lain → **409**.
- Berjalan dalam `db.withTransaction` (atomik, diantrikan).

**Tes** — `tests/transactionsFee.test.js` (hitung ulang fee, whitelist/injection, `ref_code`).

**Status** ✅

---

## F10. Batch Filter Keterangan (RRN)

**Tujuan** — menyaring Analisis ke daftar transaksi tertentu dengan menempel teks mentah
(mis. daftar RRN dari operator atau dari Cek Admin QRIS).

**Alur** — tombol Batch Filter → modal (`openBatchFilterModal`): tempel teks, atur regex
(default `RRN:\s*([^|]+?)\s*\|`), pratinjau kode yang terbaca → Terapkan →
`state.batchFilterCodes` → `getAnalysisData` hanya menampilkan baris yang keterangannya
**memuat** salah satu kode (tidak peka huruf besar/kecil).

**Komponen** — `utils.js:extractBatchFilterCodes` (grup tangkap pertama, dedupe, batas
20.000 kecocokan, regex tidak valid → pesan error, tombol Terapkan nonaktif).

**Keterkaitan** — teks "QRIS Bayar" dari Cek Admin QRIS (F20) dibuat agar terbaca oleh
regex default tanpa diubah.

**Status** ✅

---

## F11. Audit Reversal

**Tujuan** — menemukan pasangan transaksi reversal & aslinya untuk dibersihkan.

**Pengguna** — Auditor, Admin, Master; tombol tampil bila `settings.auditPanelEnabled`.

**Algoritma** (`handlers.js:getAutoAuditResultsHTML`) — untuk setiap aturan
`{ keyword1 (reversal), keyword2 (asli) }` di `settings.auditRules`:

1. Ambil data periode filter tanggal (`getAuditFilteredData`; search & tipe diabaikan).
2. Baris reversal: keterangan **diawali** `keyword1`; kandidat asli: diawali `keyword2`.
3. Pasangan sah bila `nama` sama, `|jumlah|` sama, dan sufiks keterangan setelah
   keyword saling prefix; setiap baris hanya dipakai sekali.
4. Tampil sebagai pasangan (merah = reversal, hijau = asli); bisa dipilih & dihapus
   (`handleDeleteSelectedAnalysis`, dihitung per pasangan).

**Default aturan** — `REV TARTUN QR ↔ TARTUN QR`, `REVISI TARTUN TF ↔ TARTUN TF`.

**Status** ✅

---

## F12. Rincian Transaksi per outlet

**Tujuan** — melihat semua transaksi satu outlet dalam periode filter.

**Alur** — klik baris Tabel Ringkasan (`handleSummaryRowClick`) →
`ui.showTransactionDetailModal`: kolom Tanggal, Nama, Jumlah, **Biaya Admin**,
Keterangan, Aksi; baris TOTAL berisi total jumlah & total biaya admin.

**Aksi** (user login; edit/hapus: Admin & Master) — lapor via WhatsApp (F21), edit
detail, pilih + hapus (`handleDeleteSelectedInModal`), ganti nama massal
(`handleApplyBulkEditInModal` → `PUT /bulk-update`).

**Status** ✅

---

## F13. Input: paste spreadsheet (Opsi 1)

**Tujuan** — menempel baris dari spreadsheet langsung ke staging.

**Alur** — textarea → "Proses & Validasi Data" → `processAndStageData` →
`parseRawDataInput` → `checkForDuplicates` → staging (F16).

**Aturan** (`handlers.js:parseRawDataInput`)

1. Baris pertama dilewati bila memuat "tanggal" dan "keterangan".
2. Pemisah: `dataParsingSettings.pasteDelimiter` (default Tab); urutan kolom:
   `dataParsingSettings.columnOrder` (Pengaturan > Data > Struktur Kolom & Format Tanggal).
3. Kolom kurang → error "Jumlah kolom tidak sesuai format".
4. Kata pengecualian (**kata utuh**, `AppImport.matchesKeyword`) → baris dilewati diam-diam.
5. Jumlah format Indonesia (`.` ribuan, `,` desimal); gagal → "Format jumlah salah".
6. Tanggal via `utils.parseDateWithPriority` + format aktif; gagal → "Format tanggal tidak dikenali".
7. Nama: rapikan spasi → `nameConsolidation`.
8. Tipe via `routingKeywords` (tiket dicek lebih dulu); tidak cocok → "Tidak ada routing cocok".
9. Duplikat di input via `AppImport.duplicateKey` (F17).

**Status** ✅

---

## F14. Input: unggah file berbasis profil (Opsi 2)

**Tujuan** — satu pintu untuk semua file (CSV/Excel). Cara membaca kolom tiap format
diatur di Profil Format Import (F24).

**Alur** (`handlers.js:handleImportFileUpload`)

1. Pilih format di dropdown (**Deteksi otomatis** atau profil tertentu) → pilih file
   `.csv` / `.xlsx` / `.xls`.
2. `readImportTables`: Excel → semua sheet (`XLSX.read`, dimuat lazy); CSV →
   `AppImport.parseDelimited` per pemisah profil (dukung tanda kutip, BOM, CRLF).
3. Profil: `AppImport.detectProfile` (skor = jumlah kata kunci header + kolom bernama
   yang ditemukan; kolom wajib harus lengkap) atau pilihan manual.
4. `AppImport.parseTables` → item `valid` / `error` per baris.
5. `stageImportedItems` → `AppImport.finalizeItems` (pengecualian, konsolidasi nama,
   duplikat input) → `checkForDuplicates` → staging.

**Profil bawaan** (`importEngine.js:DEFAULT_IMPORT_PROFILES`)

| Profil | File | Kunci pengenal | Catatan |
|---|---|---|---|
| CSV Template Aplikasi | CSV `;` | `tanggal`, `keterangan` (header opsional) | Kolom posisi #1–#4, tipe via routing, jumlah format Indonesia |
| Excel Merchant BCA | XLSX multi-sheet | `merchant name`, `original amount` | Header dicari di 10 baris awal, lewati Subtotal/Total/Note, jam `07:00 WIB` |
| Settlement QRIS (CSV) | CSV `,` | `outlet code`, `amount (rp)` | Hanya `Status = success`, REF cadangan `Transaction ID` |

**Pesan kesalahan untuk operator**

- "Format Tidak Dikenali" — tidak ada profil yang cocok.
- "Format Tidak Sesuai" — profil CSV dipakai untuk file Excel atau sebaliknya.
- Baris error "Kolom tidak ditemukan (sheet): Tanggal, …" — kolom wajib hilang.

**Paritas** — output identik dengan parser lama pada file asli (BCA 1.141 baris,
Settlement 885, CSV 41.677; 0 selisih).

**Tes** — `tests/importEngine.test.js` (10 kasus).

**Status** ✅

---

## F15. Input tunggal

**Tujuan** — menambah satu transaksi manual.

**Alur** (`handleSingleEntrySubmit`) — isian tanggal, nama, jumlah, keterangan → tipe via
routing (tidak cocok → error) → `POST /bulk` dengan `batch_id = single-<uuid>`.

**Catatan** — tidak melewati kata pengecualian, konsolidasi nama, maupun cek duplikat
klien; server tetap menghitung biaya admin & melewati RRN+jumlah yang sudah ada.

**Status** ⚠️

---

## F16. Staging, submit & undo import

**Tujuan** — memeriksa hasil parsing sebelum masuk DB.

**Staging** (`ui.createStagingTableRow`, `updateStagingStatsAndSubmitBtn`)

- Kolom: Status, Tanggal, Nama, Jumlah, **Biaya Admin (pratinjau)**, Keterangan, Aksi.
- Status: `valid`, `duplicate_input`, `duplicate_db`, `error` + alasan.
- Filter status, statistik (total/valid/duplikat/error/total nominal), hapus baris error
  satu per satu atau semua (ketik `HAPUS ERROR`).

**Submit** (`submitStagedData`) — hanya baris `valid` → `POST /api/transactions/bulk`
dengan `batch_id` baru (disimpan `localStorage.fkof_lastImportBatchId`).

Server `/bulk`:

- Menghitung `admin_fee` & `ref_code` sendiri (nilai dari klien diabaikan).
- `INSERT OR IGNORE`: baris ber-RRN yang sudah ada dilewati, batch tetap tersimpan.
- Balasan `{ inserted, skipped_duplicates }` → pesan sukses menyebut keduanya.

**Undo import terakhir** (`handleUndoLastImport`) — ketik `BATALKAN` →
`DELETE /api/transactions/batch/:batch_id` (hanya batch terakhir di browser ini).

**Edge case**

- Tombol revalidasi baris error (`revalidateStagingRow`) **tidak terpasang** di UI dan
  selektornya salah (`tr` vs `div`) — kode mati; baris error hanya bisa dihapus.
- Tabel staging kosong/tinggi 0 di lebar < 1024 px memunculkan error konsol
  `VirtualScrollManager: Container element did not become visible`.

**Status** ⚠️

---

## F17. Deteksi duplikat

**Tujuan** — mencegah transaksi yang sama tersimpan dua kali, dari jalur mana pun.

**Kunci** (`AppImport.duplicateKey` di klien, `utils/duplicateLookup.js` di server)

| Jenis baris | Kunci | Konsekuensi |
|---|---|---|
| Ber-RRN/REF (≈ semua QR) | `ref_code + jumlah` | Lintas outlet, format keterangan, dan tanggal |
| Tanpa RRN/REF (TF, EDC, Tiket) | `tanggal UTC | nama | jumlah | keterangan` | Harus sama persis |

**Ekstraksi referensi** — regex `(?:RRN|REF)\s*:\s*([A-Za-z0-9]{6,})`, uppercase; sama
persis di `utils/transactionRef.js` & `importEngine.js:extractReference` (dijaga tes).

**Tiga lapis**

1. **Di dalam input** — `finalizeItems` / parser paste → `duplicate_input`, alasan
   menyebut outlet pertama bila berbeda.
2. **Terhadap DB** — `POST /api/transactions/check-duplicates` → `{ duplicates, details }`;
   alasan "Duplikat: RRN X sudah ada di OUTLET (tgl)". Gagal request → validasi
   **dihentikan** (tidak lagi menganggap semua baru).
3. **Di DB** — indeks unik `uniq_transactions_ref_amount (ref_code, jumlah) WHERE ref_code <> ''`
   + `INSERT OR IGNORE` di `/bulk` & API ingest (aman untuk request paralel).

**Data** — kolom `transactions.ref_code` (string kosong bila tidak ada) + indeks
`idx_transactions_ref_code`; diisi saat insert/edit, di-backfill saat start.

**Edge case**

- RRN sama dengan **jumlah berbeda** tidak dianggap duplikat (3 kasus entri manual 6 Agustus).
- Migrasi melewati indeks unik bila data lama sudah memuat pasangan ganda (peringatan di log).

**Tes** — `tests/duplicateRef.test.js`, `tests/transactionsFee.test.js`, `tests/ingest.test.js`.

**Status** ✅

---

## F18. Biaya admin

**Tujuan** — setiap transaksi punya biaya admin yang dihitung sekali, konsisten di semua tampilan.

**Rumus** (`utils/adminFee.js:computeAdminFee`, identik dengan `public/js/utils.js:calculateAdminFee`)

1. `value = |jumlah|`, `keterangan` uppercase.
2. Aturan `settings.adminRules` diurutkan menaik berdasarkan `amount`; ambil yang salah
   satu keyword-nya (dipisah koma) muncul di keterangan.
3. Pilih aturan pertama dengan `value ≤ amount`; bila tidak ada, aturan terbesar.
4. `flat` → `feeValue`; `percentage` → `round(value × feeValue / 100)`.
5. `tipe_sheet = TIKET` → + **tiket unik** (3 digit terakhir bagian bulat `value`).

**Penyimpanan** — kolom `transactions.admin_fee` (REAL), dihitung **server** saat
`/bulk`, `/bulk-update` (bila jumlah/keterangan/tipe berubah), dan API ingest.
Data lama diisi otomatis saat start (`db.js:migrateAdminFee`).

**Pemakaian klien** — `utils.calculateAdminFee` mengembalikan `row.admin_fee` bila ada;
menghitung sendiri hanya untuk data belum tersimpan (pratinjau staging, kalkulator,
Cek Admin QRIS).

**Keputusan** — mengubah `adminRules` **tidak** mengubah data lama (dibekukan); hanya
upload/edit berikutnya. Tidak ada tombol hitung ulang (keputusan 2026-09-28).

**Paritas** — 0 selisih vs rumus lama pada seluruh data (skrip `scripts/verify-admin-fee-parity.js`).

**Tes** — `tests/adminFee.test.js`, `tests/transactionsFee.test.js`.

**Status** ✅ · Catatan: `adminBankFeePercent` & `adminBankKeywords` tersimpan di
settings tetapi **tidak dipakai** dalam perhitungan mana pun.

---

## F19. Komisi outlet & CS

**Rumus per outlet** (`handlers.js:aggregateData`; `utils/adminCalc2.js:aggregateByOutlet` identik)

```
manualFee   = Σ admin_fee baris MANUAL
tiketUnik   = Σ 3 digit terakhir baris TIKET
tiketFee    = Σ admin_fee baris TIKET − tiketUnik
base        = manualFee + tiketFee (+ tiketUnik bila ticketFeeDestination = 'adminFee')
awal        = base × outlet% (+ tiketUnik utuh bila ticketFeeDestination = 'outletCommission')
komisi CS   = awal × cs%
komisi outlet (net) = awal − komisi CS        → dibulatkan
```

Default: outlet 20 %, CS 10 %, `ticketFeeDestination = adminFee`, target 15.000.000.

**Aturan** — persentase berlaku **seketika** untuk semua data (tidak disimpan per baris).
Rumus frontend adalah sumber kebenaran; versi server (`/summary`, `/dashboard`) disamakan
(paritas 44 outlet, 0 selisih di kedua mode).

**Status** ✅

---

## F20. Cek Admin QRIS

**Tujuan** — kalkulator publik: tempel notifikasi QRIS → hitung biaya admin & tunai
keluar per transaksi, tanpa menyentuh database.

**Alur** (`public/js/qrisCheck.js`)

1. Tempel teks (blok diawali `RRN: …`, baris outlet + NMID, "Menerima pembayaran dari …",
   `+ Rp …`) → `parse` / `_parseBlock`.
2. `computeRow` memanggil `utils.calculateAdminFee` dengan baris sintetis (aturan sama
   dengan transaksi nyata).
3. Centang "Bayar" per transaksi → `buildOperatorText` menyusun teks siap tempel yang
   terbaca Batch Filter (F10); `verifyOperatorText` memastikan kode yang terbaca = RRN
   yang dicentang.
4. Hasil disimpan **hanya** di `localStorage.fkof_qrisCheckData`.

**Keamanan** — semua teks di-escape; teks bebas dinetralkan (`_safeOperatorText`) agar
tidak terbaca sebagai kode RRN.

**Status** ✅

---

## F21. Laporan WhatsApp

**Tujuan** — melaporkan transaksi bermasalah ke CS lewat WhatsApp.

**Alur** (`handleReportAction`) — tombol lapor di Rincian Transaksi → pesan berisi
tanggal, nama, jumlah, keterangan → `https://wa.me/<nomor>?text=…`. Satu kontak →
langsung dibuka; beberapa → modal pilih kontak; tidak ada → info.

**Data** — `settings.whatsappContacts[] { name, number }` (nomor diawali `62`), diatur di
Pengaturan > Bisnis > Kontak Laporan WhatsApp.

**Status** ✅

---

## F22. Ekspor data

| Sumber | Format | Kode |
|---|---|---|
| Tabel Ringkasan | CSV, XLSX, JSON, PDF, Salin (+ baris TOTAL) | `setupSummaryView` |
| Analisis Data | CSV, XLSX, JSON | `setupAnalysisView` |
| Chart Data | PNG, JPEG, PDF | `utils.downloadChartReport` |
| Template input | CSV | `downloadInputTemplate` |

- CSV memakai `dataParsingSettings.csvDelimiter` (default `;`) + BOM UTF-8; sel berisi
  pemisah/kutip/baris baru di-quote.
- XLSX, jsPDF, html2canvas dimuat **lazy** dari CDN saat dipakai.

**Keterkaitan** — ekspor CSV Analisis dapat di-import ulang lewat profil "CSV Template
Aplikasi" (kolom 1–4 = tanggal, nama, jumlah, keterangan).

**Status** ✅

---

## F23. Pengaturan global

**Pengguna** — Master (tombol simpan & endpoint `PUT /api/settings` khusus Master).

**Tab & isi** (`handlers.js:setupSettingsView`, `collectSettingsFromUI`)

| Tab | Accordion |
|---|---|
| Umum | Tampilan & Visual Utama (logo, deskripsi, wallpaper, blur, tema flat, pengumuman + gaya) · Widget Dashboard Publik |
| Data | Parsing Dasar (pemisah paste & CSV) · Struktur Kolom & Format Tanggal (paste) · **Profil Format Import** (F24) · Aturan Kata Kunci (pengecualian, routing) · Aturan Biaya Admin · Penggabungan Nama · Pemetaan NMID · Aturan Audit Otomatis (+ aktifkan panel audit) |
| Bisnis | Bisnis & Komisi (komisi outlet/CS, target, batas chart, periode bulan bisnis, fee bank, tujuan tiket unik) · Kontak Laporan WhatsApp |
| Sistem | **API Ingest Transaksi QR** (F25, Master) · Backup & Restore · Area Berbahaya |

**Simpan** — "Simpan Semua Pengaturan" → validasi profil import → `collectSettingsFromUI`
→ `settings.saveGlobal` → `PUT /api/settings` (menimpa seluruh blob) → log
`SAVE_GLOBAL_SETTINGS`.

**Backup / restore** — unduh JSON pengaturan; restore menerima file yang memiliki
`backgroundUrl` lalu langsung menyimpan.

**Area Berbahaya**

- Hapus data per rentang tanggal (ketik `HAPUS DATA`) → `DELETE /api/transactions/range` (Master).
- Reset pengaturan ke default (ketik `RESET SEMUA`) → `PUT /api/settings` dengan `DefaultConfig`.

**Edge case**

- `PUT /api/settings` tidak memvalidasi isi blob; restore hanya mengecek satu field.
- Menyimpan pengaturan menimpa seluruh blob → dua Master yang menyimpan bersamaan saling menimpa.

**Status** ⚠️

---

## F24. Profil Format Import

**Tujuan** — mengatur struktur kolom tiap format file tanpa mengubah kode.

**Lokasi** — Pengaturan > Data > Profil Format Import (`public/js/importSettings.js`);
disimpan di `settings.importProfiles` (bila kosong, dipakai profil bawaan).

**Isi satu profil**

| Field | Arti |
|---|---|
| `name`, `fileType` (`csv`/`xlsx`), `delimiter` | Identitas & jenis file (`\t` = Tab) |
| `headerKeywords[]`, `headerRequired` | Kata wajib di baris header (juga untuk deteksi); wajib → dicari di 10 baris awal |
| `columns{field: spec}` | 10 field: tanggal*, jam, kodeOutlet, namaOutlet*, jumlah*, keterangan, ref, metode, pembayar, status. Spec = nama header, alternatif dipisah `|`, atau posisi `#3` |
| `template` | Keterangan, placeholder `{keterangan} {ref} {metode} {pembayar} {kodeOutlet} {namaOutlet}`, alternatif `[a|b|c]` |
| `tipe` | `auto` (routing) / `MANUAL` / `TIKET` |
| `dateFormat` | `auto` / `dmy` / `iso` |
| `amountFormat` | `id` (1.234,56) / `en` (1,234.56) |
| `statusValues[]`, `skipPrefixes[]`, `skipIfNoOutlet`, `skipNonPositive` | Filter baris |

**Editor** — pilih profil, duplikat, hapus (minimal 1 tersisa), kembalikan bawaan;
validasi langsung (`AppImport.validateProfile`); simpan ditolak bila ada profil tidak valid.

**Peringatan** — mengubah template keterangan profil yang sudah dipakai membuat
keterangan baru berbeda dari data lama (duplikat baris tanpa RRN tidak terdeteksi).

**Status** ✅

---

## F25. API Ingest transaksi QR

**Tujuan** — sistem lain (payment gateway, skrip, aplikasi) mengirim transaksi QR
langsung ke DB.

**Endpoint** — `POST /api/v1/ingest/qr`, header `X-API-Key: tk_…`, maks 500 item,
120 request/menit per IP. Hanya bisa dijangkau dari jaringan server (LAN/Tailscale).

**Payload**

```json
{ "transactions": [{
  "ref": "1sodncj75027",            // wajib, 6–64 huruf/angka
  "amount": 300000,                 // wajib, > 0 (angka atau string angka)
  "paid_at": "2026-09-27T19:59:00+07:00", // wajib, ISO 8601; tanpa zona = WIB
  "outlet_code": "ID1026575135789", // wajib salah satu dengan outlet_name
  "outlet_name": "BK 6 PANGARITAN CELL",
  "method": "GOPAY", "payer": "**PAY", // opsional, maks 100 karakter
  "status": "success"               // opsional; selain success ditolak
}] }
```

**Pengolahan** (`utils/qrIngest.js:ingestTransactions`)

1. Validasi per item (`validateItem`); item salah → `rejected` + alasan, item lain tetap diproses.
2. `buildTransaction`: nama via NMID + konsolidasi, keterangan
   `TARTUN QR REF:{ref} Menerima pembayaran dari {metode} a.n. {pembayar}`, tipe `MANUAL`,
   `admin_fee`, `ref_code`.
3. Kata pengecualian → `rejected`.
4. Duplikat terhadap DB (dengan info outlet asal), lalu duplikat di dalam request.
5. Insert `OR IGNORE` dalam `db.withTransaction`; bentrok balapan → `duplicate`.
6. Log `API_INGEST` (actor `api:<nama key>`), `batch_id = api-<uuid>`.

**Respons**

```json
{ "success": true, "data": { "batch_id": "api-…", "received": 7, "inserted": 1,
  "duplicates": 5, "rejected": 1,
  "results": [{ "index": 0, "ref": "…", "status": "duplicate",
                "reason": "RRN/REF sudah tersimpan",
                "existing": { "nama": "PARENT PANGARITAN", "tanggal": "…" } }] } }
```

Kode HTTP: 200 (termasuk sebagian ditolak), 400 (body tidak valid / JSON rusak),
401 (key salah/dicabut), 413 (> 500 item), 429 (rate limit), 500 (tidak ada yang
tersimpan; aman dikirim ulang).

**API key** (`routes/apiKeys.js`, `utils/apiKeys.js`, `middleware/apiKey.js`, UI
`public/js/apiKeysSettings.js`)

- Dibuat/dicabut Master di Pengaturan > Sistem > "API Ingest Transaksi QR".
- Format `tk_` + 43 karakter base64url; DB hanya menyimpan **hash SHA-256** + prefix 12
  karakter; key asli tampil sekali. Verifikasi `timingSafeEqual`, catat `last_used_at`.
- Key hanya berlaku untuk endpoint ingest.

**Tes** — `tests/ingest.test.js` (8 kasus: hak akses key, 401, insert, kirim ulang &
lintas outlet, 4 request paralel, validasi, batas batch, pencabutan).

**Belum ada** — reversal/refund, HTTPS & tanda tangan HMAC untuk pengirim dari internet,
template keterangan API yang bisa diatur dari Pengaturan.

**Status** ✅

---

## F26. Userscript KlikBCA Sync

**Tujuan** — menarik mutasi QRIS dari layar `qr.klikbca.com` ke Tartun.

**Lokasi** — `tools/klikbca-sync.user.js` v4.0.1 (tidak disajikan server; pasang manual
di Tampermonkey).

**Alur** — baca teks layar per outlet → susun baris (NMID → nama via settings) →
login `POST /api/auth/login` → `POST /api/transactions/bulk`. Mode real-time (outlet
yang dibuka otomatis dikirim) & crawler.

**Kredensial** — diminta sekali lewat prompt / menu Tampermonkey "Atur akun Tartun",
disimpan `GM_setValue` (tidak lagi ditulis di file).

**Catatan**

- Login dengan akun manusia → memutus sesi akun itu (F1). Disarankan akun khusus atau
  migrasi ke API key (F25).
- `/bulk` kini melewati RRN yang sudah ada, jadi pengiriman ulang tidak menggandakan data.

**Status** ⚠️

---

## F27. Log aktivitas

**Tujuan** — jejak audit aksi penting.

**Tampilan** — panel "Aktivitas Terkini" (3 log, publik, tanpa `LOGIN*`, `GET /api/logs/recent`);
modal semua log (Master/Admin, `GET /api/logs`, 500 terakhir); log per user (F2).

**Penting** — `api.logAction()` di klien **hanya menulis ke `console`**, tidak dikirim ke
server. Yang benar-benar tersimpan hanya log yang ditulis oleh route server (Lampiran B).

**Status** ⚠️

---

## Lampiran A: matriks hak akses

| Fitur | Publik | Auditor | OED | Admin | Master |
|---|:-:|:-:|:-:|:-:|:-:|
| Dashboard, Ringkasan, Chart, Cek Admin QRIS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Preset filter, widget pribadi | | ✅ | ✅ | ✅ | ✅ |
| Analisis Data (lihat, batch filter) | | ✅ | ✅ | ✅ | ✅ |
| Audit Reversal (bila diaktifkan) | | ✅ | | ✅ | ✅ |
| Input Data, cek duplikat, undo import | | | ✅ | ✅ | ✅ |
| Edit, ganti nama massal, hapus terpilih | | | | ✅ | ✅ |
| Manajemen pengguna | | | | ✅ (kecuali Master) | ✅ |
| Log lengkap | | | | ✅ | ✅ |
| Pengaturan, hapus rentang tanggal, API key | | | | | ✅ |
| API ingest | Sistem dengan API key | | | | |

Catatan: `GET /api/transactions`, `/api/summary`, `/api/dashboard/kpi`, `/api/settings`
dapat diakses **tanpa login** (dibutuhkan tampilan publik) — seluruh data transaksi,
termasuk nama pembayar di keterangan, terbaca oleh siapa pun yang menjangkau server.

---

## Lampiran B: katalog log action

**Tersimpan di tabel `logs` (ditulis server)**

| Action | Sumber |
|---|---|
| `LOGIN_SUCCESS`, `LOGOUT` | `routes/auth.js` |
| `SUBMIT_DATA_SUCCESS`, `SUBMIT_DATA_FAIL` | `POST /transactions/bulk` |
| `DELETE_DATA_RANGE`, `UNDO_IMPORT_SUCCESS`, `DELETE_SELECTED`, `BULK_UPDATE` | `routes/transactions.js` |
| `CREATE_USER_SUCCESS`, `ADMIN_CHANGE_USER_PASSWORD`, `DELETE_USER_SUCCESS`, `CHANGE_OWN_PASSWORD_SUCCESS` | `routes/users.js` |
| `SAVE_GLOBAL_SETTINGS` | `PUT /settings` |
| `API_INGEST`, `API_INGEST_FAIL` | `routes/ingest.js` |
| `API_KEY_CREATED`, `API_KEY_REVOKED` | `routes/apiKeys.js` |

**Hanya `console.log` di browser (tidak tersimpan)** — `UPDATE_DATA_MODAL`,
`BULK_ACTION_SUCCESS`, `BULK_ACTION_MODAL_SUCCESS`, `DELETE_DATA_ANALYSIS`,
`UPDATE_USER_ROLE`, `TOGGLE_USER_STATUS`, `SUBMIT_SINGLE_SUCCESS`, `DOWNLOAD_TEMPLATE`,
`BACKUP_SETTINGS`, `RESTORE_SETTINGS`, `RESET_SETTINGS`, `UPDATE_WIDGET_CONFIG`,
`RESET_WIDGET_CONFIG`, dll. Sebagian aksinya tetap tercatat oleh log server yang
sepadan (mis. edit → `BULK_UPDATE`), sebagian tidak tercatat sama sekali (ubah peran,
aktif/nonaktif user, reset pengaturan).

---

## Lampiran C: backlog & utang per fitur

Diurutkan berdasarkan risiko.

| Prioritas | Fitur | Masalah | Usulan |
|---|---|---|---|
| Tinggi | Data | `data/tartun.db` (transaksi asli + nama pembayar) ter-commit di git (termasuk commit `9302098`) | `git rm --cached data/tartun.db`; pertimbangkan membersihkan riwayat bila repo tidak privat |
| Tinggi | F1 | Password Master default ada di seed `db.js` & riwayat git; `JWT_SECRET` punya fallback di kode | Ganti password; seed dari env var; wajibkan `JWT_SECRET` saat start |
| Tinggi | Lampiran A | Endpoint publik membuka seluruh transaksi | Batasi kolom/rentang untuk publik atau wajibkan login untuk data mentah |
| Sedang | F27 | `api.logAction` tidak menyimpan | Tambah `POST /api/logs` (terautentikasi) atau pindahkan log ke route server terkait |
| Sedang | F1 | Sesi tunggal hanya di klien; login tanpa limiter ketat | Cek `session_id` di `authenticateToken`; limiter login mis. 10/15 menit |
| Sedang | F2 | Validasi input user lemah; target tidak dicek; avatar tanpa cek tipe | Validasi email/role/password; 404 bila target tidak ada; whitelist MIME |
| Sedang | F23 | `PUT /settings` tanpa validasi skema; simpan menimpa seluruh blob | Validasi skema; optimistic locking via `updated_at` |
| Sedang | F25 | Reversal/refund belum ditangani | Endpoint/status reversal yang menandai atau menghapus transaksi asli |
| Rendah | F16 | Revalidasi baris error mati; error VirtualScroll di layar sempit | Hapus kode mati atau pasang ulang; inisialisasi VS setelah panel tampil |
| Rendah | F13 | Parser teks KlikBCA (`processAndStageKlikBcaData`, `parseBcaQrisText`) tidak terjangkau UI | Hapus atau jadikan profil import |
| Rendah | F15 | Input tunggal tanpa pengecualian/konsolidasi/cek duplikat | Lewatkan melalui `finalizeItems` + `checkForDuplicates` |
| Rendah | F18 | `adminBankFeePercent`/`adminBankKeywords` tidak dipakai | Implementasikan atau hapus dari Pengaturan |
| Rendah | F3 | `/summary` & `/dashboard` memakai bulan kalender | Samakan dengan bulan bisnis atau hapus bila tidak dipakai |
| Rendah | Arsitektur | Seluruh tabel transaksi dimuat ke browser (±80 ribu baris) | Lihat `PERFORMANCE-BLUEPRINT.md` / paginasi server bila data terus tumbuh |
