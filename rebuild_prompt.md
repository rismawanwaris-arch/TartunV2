# Prompt Rebuild Aplikasi FKOF (Laporan Tarik Tunai Outlet)

> **Cara pakai:** salin seluruh dokumen ini (atau bagian yang kamu mau) sebagai prompt ke AI coding assistant untuk membangun ulang aplikasi dari nol. Bagian "Saran Optimasi Data Besar" bersifat opsional — tandai mana yang mau diimplementasikan.

---

## 1. Ringkasan Aplikasi

Bangun ulang **aplikasi web single-page (SPA)** untuk mencatat, menganalisis, dan melaporkan transaksi **tarik tunai outlet** (agen bank). Aplikasi ini dioperasikan oleh tim kecil dengan peran berbeda: pengunjung publik (tanpa login) bisa melihat dashboard & ringkasan, staf login untuk input/analisis data, admin mengelola pengguna & aturan bisnis.

**Arsitektur target:**
- Frontend: **HTML + CSS vanilla + JavaScript murni** (tanpa framework berat), SPA dengan template `<template>` untuk tiap view.
- Backend: **Supabase** (PostgreSQL + Auth + Realtime + Storage + Edge Functions).
- Pendekatan data: **server-side pagination/agregasi** (JANGAN download seluruh tabel ke browser — lihat bagian Optimasi).
- Bahasa UI: **Bahasa Indonesia**.
- Estimasi volume data saat ini: **±237.000 baris transaksi** (berpotensi tumbuh), target harus tetap responsif.

**Struktur file yang dianjurkan:**
```
index.html        (struktur + template views + inisialisasi supabaseClient)
style.css         (design system: dark/light theme, glassmorphism, warna)
state.js          (DefaultConfig + AppState)
utils.js          (formatting, parsing, kalkulasi fee, ekspor)
api.js            (semua operasi data Supabase)
auth.js           (login/logout/state change/sesi tunggal)
handlers.js       (logika bisnis & event handlers per view)
ui.js             (rendering, modal, chart, widget)
virtualScroll.js  (virtual scrolling untuk tabel besar)
main.js           (inisialisasi aplikasi, binding semua modul)
```

**Library eksternal (via CDN):** Chart.js + chartjs-adapter-date-fns + chartjs-plugin-datalabels, lucide (ikon), SortableJS (drag-drop), SheetJS/xlsx (ekspor), jsPDF + autotable (PDF), html2canvas (export chart), @supabase/supabase-js v2. Font: Inter + Orbitron.

---

## 2. Skema Database Supabase

### Tabel `public.data` (transaksi)
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | bigint identity (PK) | |
| `created_at` | timestamptz (default now()) | |
| `tanggal` | timestamptz (NOT NULL) | waktu transaksi |
| `nama` | text | nama outlet (dikonsolidasi) |
| `jumlah` | numeric | nominal transaksi (bisa negatif utk reversal) |
| `keterangan` | text | deskripsi (sumber routing tipe & fee) |
| `tipe_sheet` | text | `MANUAL` atau `TIKET` |
| `batch_id` | text | UUID batch impor (utk undo) |

**Index wajib:** `idx_data_tanggal ON data(tanggal DESC)`, `idx_data_batch_id ON data(batch_id)`, `idx_data_nama ON data(nama)`, `idx_data_tipe ON data(tipe_sheet)`.

### Tabel `public.profiles`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK (FK auth.users.id) | |
| `email` | text | |
| `role` | text | `Master`, `Admin`, `OED`, `Auditor` (default `Auditor`) |
| `dashboard_config` | jsonb | layout widget pribadi user |
| `is_active` | boolean (default true) | |
| `filter_presets` | jsonb (default `[]`) | preset filter tersimpan |
| `last_active_at` | timestamptz | |
| `created_at` | timestamptz | |
| `avatar_url` | text | |
| `session_id` | text | utk mekanisme sesi tunggal |

### Tabel `public.logs`
| Kolom | Tipe |
|---|---|
| `id` bigint PK, `created_at` timestamptz, `actor` text, `actor_role` text, `action` text, `details` jsonb |

### Tabel `public.app_settings`
| Kolom | Tipe |
|---|---|
| `id` integer (selalu 1), `settings` jsonb, `updated_at` timestamptz |

### Trigger
- `handle_new_user()` (SECURITY DEFINER): saat user baru dibuat di `auth.users` → insert ke `profiles` dengan role default `Auditor`, `is_active=true`.
- `update_last_active()` (SECURITY DEFINER): sinkron `last_sign_in_at` → `profiles.last_active_at`.

### RPC / Fungsi
1. `get_summary_data(start_date date, end_date date)` → agregasi per outlet: `nama_pengguna, jumlah_transaksi, total_nilai, total_biaya_admin`.
2. `bulk_update_data(updates jsonb)` → loop update banyak baris (array `{id, updateObject}`).
3. `get_my_role()` → role user saat ini.
4. `get_user_role(user_id uuid)` → role user tertentu.
5. `get_all_users_with_profiles()` → gabungan `auth.users` + `profiles` utk manajemen pengguna.

### Edge Functions (wajib, karena hapus/buat user butuh service role)
- `create-user` (body: `{email, password, role}`) → buat user di auth + set role di profiles.
- `delete-user` (body: `{user_id}`) → hapus user dari auth.

### RLS (Row Level Security)
- `data`: `SELECT` untuk anon (publik boleh lihat), tulis hanya `authenticated`.
- `profiles`: user hanya bisa baca/update profil sendiri; `Master`/`Admin` bisa kelola semua.
- `logs`: anon boleh SELECT (log publik), insert oleh authenticated.
- `app_settings`: anon boleh SELECT, tulis hanya `Master` (lewat `auth.jwt() ->> 'role'` atau policy role).

---

## 3. Peran & Hak Akses (Role-Based Access)

| Fitur | Publik (anon) | Auditor | OED | Admin | Master |
|---|---|---|---|---|---|
| Dashboard (widget publik/umum) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tabel Ringkasan | ✅ | ✅ | ✅ | ✅ | ✅ |
| Chart Data | ✅ | ✅ | ✅ | ✅ | ✅ |
| Analisis Data (pencarian + audit) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Input Data (paste/CSV/tunggal) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Pengaturan Global | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manajemen Pengguna | ❌ | lihat profil sendiri | lihat profil sendiri | ✅ (tidak bisa kelola Master) | ✅ |
| Hapus data rentang tanggal | ❌ | ❌ | ❌ | ❌ | ✅ |
| Edit/hapus/bulk-ubah data analisis | ❌ | ❌ | ❌ | ✅ | ✅ |

Aturan tambahan:
- `Admin` saat mengambil daftar user TIDAK boleh melihat user ber-role `Master`.
- `Master` boleh assign role apa pun; `Admin` hanya `Admin/OED/Auditor`.
- Menu navigasi disembunyikan/tampil sesuai `data-role` pada tombol.
- View "Analisis" bisa diakses Auditor/OED/Master/Admin; view "Input" hanya OED/Master/Admin.

---

## 4. Autentikasi & Keamanan Sesi

1. Login via `supabase.auth.signInWithPassword(email, password)`; tampilkan error "Email atau password salah." jika gagal.
2. Saat `SIGNED_IN`: buat `sessionId = crypto.randomUUID()` → simpan di `localStorage['fkof_session_id']` → update `profiles.session_id`.
3. **Sesi tunggal (single session):** saat auth state change / interval 30 detik, bandingkan `profiles.session_id` dengan localStorage. Jika berbeda → `signOut()` + modal "Sesi Berakhir — akun ini login di perangkat lain" + reload.
4. Logout: hapus `session_id` di DB, hapus localStorage, `signOut()`.
5. Cek `profiles.is_active === false` saat login → tolak akses + log `LOGIN_FAIL_INACTIVE`.
6. Fitur: reset password via email (`resetPasswordForEmail`), ganti password sendiri (`updateUser({password})`), upload avatar (storage bucket `avatars`, path `${userId}-${Date.now()}`, batas 2MB, JPG/PNG).
7. **PENTING (pelajaran dari bug lama):** jangan pernah gunakan `Math.min.apply(null, arrayBesar)` atau `Math.max(...arrayBesar)` pada array > ~100 ribu elemen — ini menyebabkan `RangeError: Maximum call stack size exceeded`. Gunakan loop iteratif.

---

## 5. Alur Input Data (View "Input Data")

### 5.1 Sumber input
- **Paste teks** dari spreadsheet (delimiter default tab `\t`), urutan kolom: `tanggal, nama, jumlah, keterangan`.
- **Upload file CSV** (delimiter `;` default), format sama dengan template.
- **Form input tunggal** (tanggal, nama, jumlah, keterangan).
- Download template CSV contoh.

### 5.2 Parsing baris (`parseRawDataInput`) — logika kritis
Untuk tiap baris:
1. Buang baris header jika dimulai "tanggal..." dan mengandung "keterangan".
2. Split berdasarkan delimiter; jika jumlah kolom < kolom yang dibutuhkan → status `error` "Jumlah kolom tidak sesuai format".
3. **Filter exception:** jika `keterangan` mengandung salah satu `exceptionKeywords` (default: `ADM TARTUN`, `ADMIN TARTUN`, `BAYAR`, `SETOR`, `Keterangan`) → baris DILEWATKAN (tidak masuk staging).
4. Bersihkan `jumlah`: hapus titik ribuan, ganti koma desimal dengan titik, parse float. Gagal → error "Format jumlah salah".
5. Parse `tanggal` memakai `parseDateWithPriority` — coba format aktif berurutan: `iso_8601` (new Date), `yyyy_mm_dd`, `dd_mm_yyyy`, `mm_dd_yyyy`, `dd_mmm_yyyy`, `dd_mmmm_yyyy`. Gagal semua → error "Format tanggal tidak dikenali".
6. Normalisasi `nama`: `replace(/\s\s+/g, ' ').trim()`, lalu cek `nameConsolidation[nama.toUpperCase()]` → ganti dengan nama kanonik (contoh: `"PLC CK"` → `"PLC120 CK"`, daftar lengkap di DefaultConfig).
7. **Routing tipe:**
   - Jika `keterangan` mengandung keyword `routingKeywords.tiket` (`tiket deposit`, `Auto Deposit`) → `tipe_sheet = 'TIKET'`.
   - Else jika mengandung `routingKeywords.manual` (`tar`, `tartun`, `tf`, `qr`, `EDC`) → `MANUAL`.
   - Tidak cocok → error "Tidak ada routing cocok".
8. **Deteksi duplikat dalam input:** hash `tanggal(Y-M-D)|nama|jumlah|keterangan`; jika sudah ada di batch → status `duplicate_input`.
9. Hash yang valid → status `valid`, siap staging.

### 5.3 Staging & validasi
- Tabel staging ditampilkan dengan **virtual scroll** (rowHeight 60px), filter status: Semua / Valid / Error / Duplikat / Duplikat DB.
- **Cek duplikat DB:** bandingkan hash baris valid dengan hash semua data yang sudah ada di DB → status `duplicate_db`.
- Baris error bisa di-revalidate manual (ulang parsing baris itu) atau dihapus semua (`Hapus Semua Data Error`).
- Statistik staging: jumlah valid/error/duplicate + tombol submit hanya aktif jika ada data valid.

### 5.4 Submit
- Data valid dikirim batch → semua diberi `batch_id = crypto.randomUUID()`, simpan di `localStorage['fkof_lastImportBatchId']`.
- **Undo impor terakhir:** hapus semua baris dengan `batch_id` tersebut (`deleteDataByBatchId`) + konfirmasi ketik frase.
- Entry tunggal: routing sama seperti di atas, `batch_id = "single-${uuid}"`.
- Setiap aksi log via `logAction` (SUBMIT_DATA_SUCCESS/FAIL, SUBMIT_SINGLE_SUCCESS, UNDO_IMPORT_SUCCESS, DOWNLOAD_TEMPLATE).

---

## 6. Kalkulasi Biaya Admin & Komisi (logika bisnis inti)

### 6.1 `calculateAdminFee(row, settings)` — biaya admin per baris
1. `value = parseFloat(row.jumlah)`, `keterangan = row.keterangan.toUpperCase()`.
2. Cari semua `adminRules` yang keyword-nya (split koma, uppercase) muncul di keterangan. Urutkan rule by `amount` ascending.
3. Rule pertama dengan `abs(value) <= rule.amount` dipakai:
   - `feeType === 'percentage'` → `fee = round(abs(value) * feeValue/100)`.
   - flat → `fee = feeValue`.
4. Jika tidak ada yang ≤ amount tapi ada rule cocok → pakai rule terakhir (amount terbesar).
5. **Khusus TIKET:** tambahkan "nominal unik" = 3 digit terakhir dari bagian integer `abs(value)` (`parseInt(String(abs(value)).split('.')[0].slice(-3))`) ke fee.
6. Default rules bawaan (contoh): QR 200.000 → 3.000; QR 500.000 → 5.000; QR 1.000.000 → 10.000; ... QR 10.000.000 → 100.000; TF/EDC 200.000 → 3.000; TF/EDC 500.000 → 5.000; TF/EDC 10.000.000 → 10.000; TIKET/Auto Deposit 203.999 → 3.000; dst. (detail lengkap di DefaultConfig).

### 6.2 `aggregateData(data)` — ringkasan per outlet & tipe
Per outlet (nama):
- `manualFee` = Σ fee baris MANUAL; `tiketFee` = Σ fee dari rule baris TIKET; `tiketUnik` = Σ nominal unik TIKET.
- `totalAdminFee = manualFee + tiketFee + tiketUnik`.
- `commissionBase = manualFee + tiketFee` (+ `tiketUnik` jika `ticketFeeDestination === 'adminFee'`).
- `initialCommissionOutlet = commissionBase * (outletCommissionPercentage/100)` (+ `tiketUnik` jika destination `outletCommission`).
- `commissionCS = initialCommissionOutlet * (csCommissionPercentage/100)`; `netCommissionOutlet = initialCommissionOutlet - commissionCS`.
- Split komisi per tipe secara proporsional: `commissionFromManual = (initialCommManual / total) * net`, `commissionFromTiket` serupa (agar total pas).
- Default: `outletCommissionPercentage = 20`, `csCommissionPercentage = 10`, `ticketFeeDestination = 'adminFee'`.
- Ringkasan global: `byType.MANUAL` & `byType.TIKET` (count, totalAdminFee, totalCommissionOutlet).

### 6.3 Tabel Ringkasan (view publik)
- Kolom (dapat diatur via `publicSummaryColumns`): Nama Pengguna, Admin, Nom. Tiket, Total Biaya Admin, Komisi Outlet, Komisi CS, Transaksi.
- Sortable per kolom (default: `commissionOutlet desc`), virtual scroll.
- Klik baris → modal detail transaksi outlet tsb (dengan checklist, hapus terpilih, ubah massal — khusus user login).
- Export dropdown: CSV / XLSX / JSON / PDF / Copy.

---

## 7. Dashboard (widget dinamis)

- Layout widget = grid 6 kolom; ukuran: `small` = col-span-2, `half` = col-span-3, `full` = col-span-6.
- Konfigurasi publik disimpan di `app_settings.publicDashboardLayout`; konfigurasi per-user di `profiles.dashboard_config` (override saat login).
- **Modal "Atur Widget"** (SortableJS drag-drop): toggle visible + pilih ukuran + urutan; simpan per-user; reset ke default.
- Widget yang tersedia:
  1. `announcement` — teks pengumuman + style (warna/font-size/font-weight/animation: bounce, dsb).
  2. `globalCommissionSummary` — total biaya admin / komisi outlet / komisi CS bulan ini.
  3. `kpiMonthCommission` — total komisi outlet bulan ini.
  4. `kpiYesterdayTotal` / `kpiTodayTotal` — total admin kemarin / hari ini.
  5. `kpiYesterdayCount` / `kpiTodayCount` — jumlah transaksi.
  6. `activeOutletsCount` — outlet aktif bulan ini.
  7. `progressCommission` — progress bar target komisi bulanan (`targetCommission`, default 15.000.000).
  8. `trendChart` — line chart biaya admin 7 hari terakhir.
  9. `tableTopOutlets` — top 5 outlet by komisi bulan ini.
  10. `chartTxType` — pie chart komposisi MANUAL vs TIKET.
  11. `tableRecentTx` — 5 transaksi terbaru.
  12. `utilAdminCalculator` — kalkulator: input nominal + pilih keyword rule → tampil fee perkiraan.
  13. `kpiMonthTopUser` — outlet teraktif bulan ini.
- **Periode "bulan ini" kustom:** `monthStartDay` (default 29) & `monthEndDay` (default 28): jika tanggal hari ini ≥ 29 → periode = bulan ini tgl 29 s/d bulan depan tgl 28; else periode = bulan lalu tgl 29 s/d bulan ini tgl 28.
- Semua perhitungan dashboard memakai `aggregateData` pada subset tanggal (hari ini/kemarin/bulan ini).

---

## 8. Analisis Data (view terproteksi)

### 8.1 Mode normal
- **Filter global** (sidebar kiri): search teks (nama+keterangan+jumlah, AND antar kata), rentang tanggal, tipe (all/MANUAL/TIKET). Cache hasil filter (`Map` keyed by kombinasi filter).
- **Filter per kolom** (baris input di header): tanggal, nama, jumlah, keterangan, tipe (debounce 300ms).
- Sort per kolom (klik header, toggle asc/desc, default tanggal desc).
- Virtual scroll tabel (rowHeight 40px), checkbox multi-select, "select all".
- Stats panel: jumlah tampil/total, total nilai, rata-rata, komposisi manual/tiket.
- **Aksi (Admin/Master):** Hapus terpilih (konfirmasi ketik frase), **Ubah massal** (bulk edit: ubah field yang sama utk banyak baris sekaligus via RPC `bulk_update_data`).
- **Detail baris:** modal lihat/edit field `nama`, `jumlah`, `keterangan`, `tipe_sheet` (Master/Admin bisa edit; simpan via `updateData` + log).
- Export: CSV/XLSX/JSON/PDF/Copy.

### 8.2 Mode Audit (Audit Reversal Otomatis)
- Toggle "Audit Reversal" (hanya jika `auditPanelEnabled`).
- Aturan `auditRules` (default): pasangan `keyword1` (reversal) vs `keyword2` (original), contoh: `REV TARTUN QR` ↔ `TARTUN QR`, `REVISI TARTUN TF` ↔ `TARTUN TF`, dst.
- Algoritma: ambil data terfilter (rentang tanggal). Untuk tiap rule, cari baris yang `keterangan` **dimulai dengan** `keyword1` (reversal) dan pasangannya dimulai `keyword2` (original). Pasangan valid jika: `nama` sama, `abs(jumlah)` sama, dan **suffix** (sisa keterangan setelah keyword) saling prefix-match (satu dimulai dgn yg lain).
- Tampilkan pasangan: baris merah = reversal, baris hijau = original, diurutkan tanggal reversal desc.
- Checkbox per pasangan (select-all audit), tombol Hapus Pasangan (hapus kedua baris, Master/Admin), log aksi.

---

## 9. Manajemen Pengguna (view terproteksi)

- **Role chart** (pie: jumlah per role) + stats total/aktif/non-aktif.
- Tabel virtual scroll: avatar, email, role, bergabung, terakhir aktif, status badge, aksi (edit role, toggle aktif/nonaktif, lihat log, hapus).
- Search email/role.
- **Buat pengguna** (Master/Admin): email + password sementara + role → edge function `create-user`. Validasi format email, password ≥ 6.
- **Edit role** (Master/Admin; Master bisa assign Master juga, Admin tidak).
- **Toggle status** → `profiles.is_active`.
- **Hapus pengguna** (konfirmasi ketik email target) → edge function `delete-user`.
- **Lihat log user** → query `logs` by actor, limit 500, virtual scroll modal.
- **Profil saya**: ganti password (min 6, harus cocok konfirmasi), upload avatar.

---

## 10. Pengaturan Global (khusus Master)

Tab: **Umum, Data, Bisnis, Sistem** (accordion + tabs).

### Umum
- Logo text & deskripsi, background URL, panel blur, tema flat toggle.
- Pengumuman: teks + style (ukuran font, bold, warna, animasi).
- Persentase komisi outlet & CS, target komisi, `ticketFeeDestination` (adminFee / outletCommission).
- Widget publik: daftar + urutan + visible + ukuran (SortableJS) → `publicDashboardLayout`.
- WhatsApp contacts (nama + nomor 62...) utk laporan share.

### Data
- Delimiter paste (default `\t`) & CSV (default `;`).
- Urutan kolom parsing (tanggal, nama, jumlah, keterangan) + toggle format tanggal aktif.
- `exceptionKeywords` (koma-separated), `routingKeywords` (tag list manual & tiket).

### Bisnis
- `adminRules`: keyword, amount, feeType (flat/percentage), feeValue; list edit inline.
- `nameConsolidation`: peta nama lama → nama kanonik (edit inline).
- `auditRules`: pasangan keyword1/keyword2 (edit inline).
- `adminBankFeePercent`, `adminBankKeywords` (utk fee bank).

### Sistem
- Backup settings → download JSON; restore via upload (validasi ada field `backgroundUrl`).
- **Area Berbahaya:** Hapus data transaksi per rentang tanggal (konfirmasi ketik `HAPUS DATA`, hanya Master); Reset settings ke default.
- Tombol "Simpan Semua Pengaturan" → collect dari UI → `upsert app_settings` + log.

---

## 11. Logging Aktivitas

- `logAction(action, details)` insert ke `logs` (actor = email user atau `system`), dengan try/catch agar tidak menggagalkan operasi utama.
- Panel "Aktivitas Terkini" di sidebar (3 log teratas, Realtime), log login disembunyikan dari publik (`LOGIN_SUCCESS`, `LOGIN_FAIL`, `LOGIN_FAIL_INACTIVE`, `LOGOUT`).
- Modal "Semua Log" (Master/Admin): 500 log terakhir, virtual scroll.
- Aksi yang dicatat: LOGIN_SUCCESS/FAIL/FAIL_INACTIVE, LOGOUT, SUBMIT_DATA_SUCCESS/FAIL, SUBMIT_SINGLE_SUCCESS, UNDO_IMPORT_SUCCESS, UPDATE_DATA_MODAL, DELETE_DATA_RANGE, DELETE_SELECTED, BULK_UPDATE, CREATE_USER_SUCCESS/FAIL, UPDATE_USER_ROLE, TOGGLE_USER_STATUS, DELETE_USER_SUCCESS, SEND_PASSWORD_RESET, CHANGE_OWN_PASSWORD_SUCCESS/FAIL, SAVE_GLOBAL_SETTINGS, UPDATE_WIDGET_CONFIG, RESET_WIDGET_CONFIG, BACKUP_SETTINGS, RESTORE_SETTINGS, DOWNLOAD_TEMPLATE, dll.

---

## 12. Realtime

- Channel `public:data` → postgres_changes event `*` → update `state.allData` (insert unshift, update replace by id, delete filter) → rebuild index + re-render.
- Channel `public:logs` → INSERT → update 3 log teratas.
- Catatan: dengan strategi data besar (section 13), realtime cukup untuk baris yang baru berubah; pastikan sinkronisasi inkremental.

---

## 13. Saran Optimasi Data Besar (WAJIB untuk 237k+ baris)

> Masalah utama versi lama: seluruh 237k baris (≈40–60 MB JSON) di-download tiap page load → boros egress Supabase (pernah kena limit), loading lambat, dan crash stack. Terapkan minimal **#1, #2, #3**.

### 13.1 Server-side pagination & agregasi (PALING PENTING)
- **JANGAN** `select('*')` seluruh tabel. 
- Dashboard/summary: gunakan RPC `get_summary_data(start, end)` (agregasi di PostgreSQL, kirim hanya ringkasan ~jumlah outlet, bukan ribuan baris).
- Tabel analisis: query per halaman (`range(offset, offset+999)` atau `limit/offset` + `order tanggal desc`) + `count: 'exact'` untuk total.
- Filter/search terapkan di query SQL (`ilike`, `gte/lte` pada tanggal), bukan di browser.

### 13.2 Filter tanggal wajib di awal
- Tampilkan data berdasarkan rentang tanggal yang dipilih (default: kemarin–hari ini). Data lama hanya dimuat bila user meminta (paginasi mundur/date picker).

### 13.3 Incremental sync + cache lokal
- Simpan snapshot ringan di `IndexedDB` (bukan localStorage — batas 5MB): meta data (hash/checksum + max tanggal) dan subset terakhir.
- Saat load: muat delta sejak `maxTanggal` terakhir via `select(...).gt('tanggal', lastSync)` + batch delete range. Realtime channel hanya untuk penambahan setelah sync.
- Ini memangkas egress berkali-kali lipat.

### 13.4 Virtual scrolling (sudah dipakai versi lama — pertahankan)
- Hanya render baris yang terlihat + buffer 5. RowHeight fixed: analysis 40px, summary 44px, staging 60px, user mgmt 57px, log 48px.

### 13.5 Web Worker untuk parsing & agregasi berat
- Pindahkan `parseRawDataInput` (parsing ribuan baris), `aggregateData`, dan rebuild search index ke **Web Worker** agar UI tidak freeze.
- Transfer data via structured clone / Transferable ArrayBuffer.

### 13.6 Search index efisien
- Ganti Map teks per baris (boros memori 237k × string) dengan pencarian di server (`ilike`) atau index trigram PostgreSQL (`pg_trgm` extension, sudah tersedia) untuk field `nama`/`keterangan`.

### 13.7 Materialized view / tabel ringkasan harian
- Buat table `daily_outlet_summary` (tanggal, nama, jumlah, fee, komisi) yang di-update via trigger/`pg_cron` setiap malam → dashboard & summary tinggal baca agregat, tanpa hitung ulang 237k baris di browser.

### 13.8 Debounce & throttle
- Search input debounce 300ms; scroll handler throttle 16ms; hindari render ulang seluruh tabel saat typing.

### 13.9 Hindari pola crash (bug nyata)
- Dilarang `Math.min/max.apply(null, arrBesar)` / spread pada array > ~100k. Pakai loop.
- Batasi ukuran payload RPC `bulk_update_data` (chunk 500–1000 baris per call).

### 13.10 Monitoring egress
- Supabase dashboard → Usage → Egress. Pertahankan < 2 GB/bulan (Free 5 GB) dengan strategi di atas. Jika tetap besar, upgrade Pro ($25/bulan).

### 13.11 Proses data lama di server (opsional lanjutan)
- Gunakan Edge Function / `pg_cron` untuk backfill/agregasi batch di malam hari, bukan di client.

---

## 14. Desain UI/UX

- **Tema:** dark default (`class="dark"` di `<html>`), toggle light/dark disimpan di `localStorage['fkof_theme']`. Palet: slate/cyan/indigo, glassmorphism (`backdrop-blur`, panel transparan), warna aksen konsisten via CSS variables.
- **Typography:** Inter untuk teks, Orbitron untuk logo/angka display.
- **Layout:** sidebar kiri (navigasi + status + log panel + tombol theme/login), konten utama swap antar template.
- **Komponen:** modal generik (title, message, contentHTML, footerHTML, size), loader overlay, status bar, konfirmasi dengan ketik frase (delete sensitif), toast/save confirmation.
- **Responsif:** grid widget dashboard adaptif, sidebar collapse di layar kecil.
- Ikon lucide via `data-lucide` + `lucide.createIcons()` setelah render.
- **SEO:** title `FKOF By -F-`, meta description, favicon set, manifest.

---

## 15. Detail Alur Inisialisasi (main.js)

1. `DOMContentLoaded` → muat html2canvas (untuk export chart) → register Chart.js + datalabels + plugin background canvas.
2. Bind semua method modul ke objek `App` (utk `this` konsisten).
3. Kumpulkan DOM refs (nav, filter, login modal, status, theme toggle, dsb).
4. Setup event listeners global: nav switch view, theme toggle, login, filter (debounce), reset filter, Escape tutup modal, klik luar tutup filter panel.
5. `onAuthStateChange` → `handleAuthStateChange`:
   - user ada → load profile → validasi sesi tunggal & is_active → set `state.currentUser` → load settings → `fetchInitialData` (pakai strategi server-side) → setup realtime → update menu visibility.
   - user null → reset state → load settings publik → fetch data publik.
6. `startSessionChecker` interval 30s utk sesi tunggal.
7. Selesai → `revealApp` (hilangkan loader).

---

## 16. Checklist Persyaratan Non-Fungsional

- [ ] Tabel 237k+ baris tetap lancar (tidak freeze, tidak crash) — wajib virtual scroll + server-side.
- [ ] Egress Supabase hemat (target < 2 GB/bln) — wajib incremental + agregasi server.
- [ ] Semua aksi destruktif (hapus, reset) wajib konfirmasi ketik frase.
- [ ] Sesi tunggal berfungsi (login di perangkat B mengeluarkan perangkat A ≤ 30 detik).
- [ ] Error handling: modal error + log; operasi DB gagal tidak membekukan UI.
- [ ] Bahasa Indonesia konsisten; format Rupiah (`Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'})`).
- [ ] Akses role diverifikasi di sisi UI (menu) DAN di sisi DB (RLS).
