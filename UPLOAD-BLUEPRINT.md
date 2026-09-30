# Blueprint Sistem Upload & Anti Double-Upload — Playbook Portabel

> Cara Tartun V2 menerima file transaksi (CSV/Excel), menganalisisnya, menampilkan
> pratinjau, lalu menyimpannya **tanpa pernah menggandakan data**. Ditulis ulang agar
> bisa diadaptasi ke sistem lain (stack apa pun). Setiap pola: **masalah → solusi →
> contoh → cara adaptasi → jebakan**.
>
> Konteks asal: laporan transaksi dari beberapa sumber (Excel merchant bank multi-sheet,
> CSV settlement payment gateway, CSV ekspor aplikasi sendiri, API) yang sering
> **tumpang tindih**: file yang sama di-upload ulang, periode yang sama diekspor dari dua
> sumber, atau transaksi yang sama tercatat dengan nama outlet berbeda.
>
> Semua pola di dokumen ini sudah berjalan & teruji di Tartun V2; lokasi kodenya di §17.
> Spesifikasi fitur Tartun sendiri ada di `FEATURE-BLUEPRINT.md` (F13–F17, F24, F25).

---

## 0. Lima prinsip inti

| Prinsip | Artinya | Konsekuensi desain |
|---|---|---|
| **LIHAT DULU, SIMPAN KEMUDIAN** | Tidak ada baris yang masuk DB sebelum operator melihat pratinjau | Pipeline dua fase: *analisis → staging* lalu *submit* |
| **SERVER HAKIM TERAKHIR** | Nilai turunan (biaya, kunci duplikat) dihitung ulang di server; nilai dari klien hanya pratinjau | Klien boleh salah/usang/dimanipulasi tanpa merusak data |
| **IDEMPOTEN DI SETIAP LAPIS** | Mengirim data yang sama berkali-kali hasilnya sama dengan sekali | Kunci alami + constraint unik di DB, bukan hanya cek di aplikasi |
| **ATURAN SEBAGAI DATA** | Struktur kolom tiap format disimpan sebagai *profil*, bukan `if` di kode | Format baru = tambah profil, bukan deploy ulang |
| **TIDAK ADA YANG HILANG DIAM-DIAM** | Setiap baris berakhir sebagai *valid*, *duplikat*, *error*, atau *dilewati karena aturan* — dengan alasan | Operator selalu tahu kenapa angka yang masuk berbeda dari isi file |

Kalau ragu menambah logika baru, tanyakan: *"di fase mana ini berjalan, dan apa yang
terjadi kalau dijalankan dua kali?"*

---

## 1. Peta pipeline

```
 FILE ──► [T1] Terima ──► [T2] Baca jadi tabel
                                                        │
          ┌─────────────────────────────────────────────┘
          ▼
 [T3] Pilih profil format ──► [T4] Parse per baris ──► [T5] Finalisasi
      (deteksi otomatis /          (kolom, jumlah,         (pengecualian, nama,
       pilihan manual)              tanggal, template)      [L1] duplikat di file)
                                                        │
          ┌─────────────────────────────────────────────┘
          ▼
 [L2] Cek ke DB ──► [T6] STAGING (pratinjau) ──► operator klik Kirim
                                                        │
          ┌─────────────────────────────────────────────┘
          ▼
 [T7] Submit: server hitung ulang ──► [L3] Constraint unik + INSERT OR IGNORE
      ──► batch_id (untuk undo) ──► balas {inserted, skipped}
```

Tiga **lapis anti double-upload** (L1–L3) sengaja berlapis: masing-masing menangkap
skenario yang lolos dari lapis lain (lihat §9.4).

| Fase | Jalan di | Boleh gagal tanpa merusak data? |
|---|---|---|
| T1–T6, L1–L2 | Klien (+ 1 request baca ke server) | Ya — belum ada yang ditulis |
| T7, L3 | Server, dalam 1 transaksi DB | Ya — rollback penuh, aman diulang |

---

## 2. Model data minimum

```sql
-- Tabel tujuan. Kolom turunan (fee, ref) diisi SERVER, bukan klien.
CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY,
  tanggal     TEXT NOT NULL,          -- ISO 8601 UTC
  nama        TEXT NOT NULL,          -- entitas (outlet) SETELAH normalisasi
  jumlah      REAL NOT NULL,
  keterangan  TEXT,
  tipe        TEXT NOT NULL,
  batch_id    TEXT,                   -- 1 upload = 1 batch → bisa di-undo
  ref_code    TEXT NOT NULL DEFAULT '', -- kunci alami dari sumber ('' bila tidak ada)
  admin_fee   REAL,                   -- contoh nilai turunan yang dihitung server
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trx_batch   ON transactions(batch_id);
CREATE INDEX idx_trx_ref     ON transactions(ref_code);
-- [L3] Satu transaksi ber-referensi hanya boleh ada sekali (per nominal).
CREATE UNIQUE INDEX uniq_trx_ref_amount ON transactions(ref_code, jumlah) WHERE ref_code <> '';
```

**Adaptasi:** ganti `nama/jumlah/tipe` dengan domain Anda (SKU/qty, akun/debit-kredit,
dsb). Yang wajib dipertahankan: `batch_id`, `ref_code` (atau kunci alami lain), dan
constraint unik parsial.

---

## 3. [T1] Menerima file

**Masalah:** sumber berbeda datang sebagai teks (CSV, kadang dengan BOM) atau biner (Excel).

**Solusi:** baca di browser dengan `FileReader` — teks untuk CSV,
`ArrayBuffer` untuk Excel. Satu input menerima semua format.

```js
const isExcel = /\.(xlsx|xls)$/i.test(file.name);
const reader = new FileReader();
reader.onload = e => process(e.target.result, isExcel);
isExcel ? reader.readAsArrayBuffer(file) : reader.readAsText(file); // UTF-8
```

**Adaptasi**

- Batas ukuran body di server: `express.json({ limit: '50mb' })`.
- Library Excel berat (SheetJS ±900 KB) → muat **lazy** saat file Excel pertama dipilih.
- Reset `input.value = ''` saat staging dibatalkan (`resetInputView`) agar memilih file
  yang sama lagi tetap memicu event `change`.

---

## 4. [T2] Membaca file menjadi tabel

Semua format dinormalkan ke bentuk yang sama: **daftar tabel, tiap tabel = array baris,
tiap baris = array sel string**. Sisa pipeline tidak peduli asal file.

```ts
type Table = { name: string; rows: string[][] };   // Excel: 1 tabel per sheet
```

**CSV — parser dengan tanda kutip** (`importEngine.js:parseDelimited`).
Jangan pakai `line.split(';')`: sel `"Jl. A; No 5"` akan pecah.

```js
function parseDelimited(text, sep) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);          // buang BOM
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"' && field === '') q = true;                     // kutip hanya di awal sel
    else if (text.startsWith(sep, i)) { row.push(field); field = ''; i += sep.length - 1; }
    else if (c === '\r') {}
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));      // buang baris kosong
}
```

**Excel:** semua sheet dibaca (`sheet_to_json(ws, { header: 1, defval: '' })`);
sheet tanpa header yang cocok dilewati, bukan dianggap error (sheet ringkasan, sheet kosong).

---

## 5. [T3] Profil format & deteksi otomatis

**Masalah:** setiap sumber punya nama kolom, pemisah, format angka/tanggal, dan baris
sampah (judul, subtotal) sendiri. Menulis parser per sumber = kode bercabang yang rapuh.

**Solusi:** satu mesin generik + **profil** (data) per format.

```js
const profile = {
  id: 'bank_merchant_xlsx', name: 'Excel Merchant BCA', fileType: 'xlsx', delimiter: ',',
  headerKeywords: ['merchant name', 'original amount'], // wajib ada di baris header
  headerRequired: true,                                  // cari di 10 baris awal; tidak ada → lewati tabel
  columns: {                                             // field → nama header | alternatif | #posisi
    tanggal: 'Transaction Date', jam: 'Transaction Time',
    kodeOutlet: 'National Merchant ID', namaOutlet: 'Merchant Name',
    jumlah: 'Original Amount', ref: 'Reference Number',
    metode: 'Payment Type', pembayar: 'Payer Name'
  },
  template: 'TARTUN QR RRN:{ref} Menerima pembayaran [dari {metode} a.n. {pembayar}|dari {metode}|dari {pembayar}|QRIS]',
  tipe: 'MANUAL',            // atau 'auto' = tentukan dari kata kunci
  dateFormat: 'dmy',         // 'auto' | 'dmy' | 'iso'
  amountFormat: 'en',        // 'id' = 1.234,56 · 'en' = 1,234.56
  statusValues: [],          // mis. ['success'] → hanya baris berstatus ini
  skipPrefixes: ['subtotal', 'total', 'note:'],
  skipIfNoOutlet: true, skipNonPositive: true
};
```

**Pemetaan kolom:** `'Reference | Transaction ID'` = pakai sel pertama yang **tidak kosong**
di antara kolom-kolom itu; `'#3'` = kolom ke-3 (untuk file tanpa header).

**Deteksi otomatis** (`importEngine.js:detectProfile`):

```
untuk setiap profil dengan fileType yang sama:
    cari baris header (semua headerKeywords ada)
    bila field wajib (tanggal, nama, jumlah) tidak lengkap → skor 0
    skor = jumlah headerKeywords + jumlah kolom bernama yang ditemukan
pilih skor tertinggi; semua 0 → "Format tidak dikenali" (JANGAN menebak)
```

Operator tetap bisa memaksa profil tertentu lewat dropdown. Profil disimpan di
pengaturan dan bisa diedit dari UI dengan validasi (field wajib, template tidak kosong).

**Adaptasi:** mulai dengan satu profil per sumber yang Anda punya file aslinya. Tambah
field ke `columns` sesuai domain; mesin tidak perlu tahu arti field selain yang dipakai
di langkah parse.

**Jebakan**

- Deteksi berdasarkan **nama file** rapuh (nama berubah); gunakan isi header.
- Dua profil dengan header mirip → beri `headerKeywords` yang membedakan.
- Mengubah `template` profil yang sudah dipakai mengubah teks keterangan → kunci
  duplikat berbasis teks (§9.2) tidak lagi mengenali data lama. Peringatkan di UI.

---

## 6. [T4] Parse per baris

Urutan di Tartun (`importEngine.js:parseRow`) — urutan ini penting karena menentukan
alasan yang dilihat operator:

| # | Langkah | Hasil bila gagal |
|---|---|---|
| 1 | Baris kosong | dilewati |
| 2 | Ambil nilai tiap field dari kolom terpetakan, `trim()` | — |
| 3 | `skipIfNoOutlet` / `skipPrefixes` (subtotal, total) | dilewati (baris sampah laporan) |
| 4 | `statusValues` (hanya `success`) | dilewati (bukan transaksi final) |
| 5 | Jumlah sesuai `amountFormat`; `skipNonPositive` | dilewati bila ≤ 0, **error** bila tidak terbaca & tidak di-skip |
| 6 | Tanggal (+ jam) sesuai `dateFormat` | **error** "Format tanggal tidak dikenali" |
| 7 | Render template keterangan | — |
| 8 | Tentukan tipe (tetap / dari kata kunci) | **error** "Tidak ada routing cocok" |
| 9 | Resolusi nama entitas (kode → nama → alias) | **error** bila kosong |

**Aturan "dilewati" vs "error"** — *dilewati* hanya untuk baris yang memang bukan
transaksi menurut profil (subtotal, status gagal, nominal 0 di laporan bank). Semua
ketidakteraturan lain → *error* yang terlihat di staging. Bila kolom wajib tidak ada di
sebuah tabel → **satu** baris error "Kolom tidak ditemukan (sheet X): Tanggal", bukan
tabel hilang tanpa kabar.

**Jumlah**

```js
const parseAmount = (s, fmt) => parseFloat(fmt === 'en'
  ? s.replace(/,/g, '')                               // 1,234.56
  : s.replace(/\./g, '').replace(',', '.'));           // 1.234,56
```

**Tanggal & zona waktu** — simpan **UTC ISO**. Tanggal tanpa zona diparse sebagai waktu
lokal operator (browser) atau, di server, dengan offset eksplisit (`+07:00`). **Jangan**
biarkan server Docker (UTC) mem-parse `2026-09-27T19:59:00` apa adanya → bergeser 7 jam.

**Template dengan alternatif** — `[a|b|c]` memilih alternatif pertama yang semua
placeholder-nya terisi; menghindari keterangan seperti `"dari  a.n. "` saat kolom kosong.

```js
function renderTemplate(t, v) {
  const filled = s => (s.match(/\{(\w+)\}/g) || []).every(p => v[p.slice(1, -1)]);
  return t.replace(/\[([^\]]*)\]/g, (_, g) => g.split('|').find(filled) ?? '')
          .replace(/\{(\w+)\}/g, (_, k) => v[k] || '').trim();
}
```

**Resolusi nama entitas** — `alias[kode] || alias[petaKode[kode]] || alias[nama] ||
petaKode[kode] || nama || kode`. Semua nama melewati **satu** fungsi normalisasi (rapikan
spasi, uppercase untuk lookup) sebelum dipakai di kunci duplikat.

---

## 7. [T5] Finalisasi (tahap yang sama untuk semua sumber)

Fungsi tunggal `finalizeItems(items, settings)` — dipakai upload file; logika yang sama
dipakai paste & API. Mengembalikan **objek baru** (input tidak dimutasi).

1. **Kata pengecualian** (baris yang bukan transaksi, mis. `ADM TARTUN`, `SETOR`):
   cocokkan sebagai **kata/frasa utuh**, tidak peka huruf besar/kecil, spasi fleksibel.

   ```js
   const kw = k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
   new RegExp(`(?:^|[^\\p{L}\\p{N}])${kw}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text);
   ```

   Hitung jumlah yang dibuang (`skippedByException`) dan tampilkan.
2. **Normalisasi & konsolidasi nama** (alias → nama kanonik).
3. **[L1] Duplikat di dalam file** (§9.1).
4. **Hash baris** (identitas untuk mencocokkan jawaban server di L2).

---

## 8. [T6] Staging — pratinjau sebelum simpan

| Status | Arti | Bisa dikirim? |
|---|---|---|
| `valid` | Baru, lolos semua cek | ✅ |
| `duplicate_input` | Kembar dengan baris lain di file yang sama | ❌ |
| `duplicate_db` | Sudah ada di database | ❌ |
| `error` | Tidak bisa dibaca | ❌ (hapus / perbaiki sumber) |

Wajib ditampilkan per baris: **alasan** yang spesifik, mis.
`Duplikat: RRN 1SODNCJ75027 sudah ada di PARENT PANGARITAN (27/09/2026)` atau
`Duplikat di input: RRN X juga ada untuk OUTLET A`. Statistik atas: total / valid /
duplikat / error / total nominal valid. Tampilkan juga **nilai turunan pratinjau**
(di Tartun: kolom Biaya Admin) agar operator bisa menangkap aturan yang salah sebelum
data masuk.

**Nama format** yang dipakai ditulis di bawah tombol upload (`file.csv — format: Settlement QRIS`)
supaya salah deteksi langsung terlihat.

**Jebakan:** tabel staging virtual-scroll yang diinisialisasi saat kontainer masih
tersembunyi → tinggi 0 → tidak merender. Inisialisasi setelah panel tampil.

---

## 9. Pencegahan double upload — tiga lapis

### 9.1 [L1] Duplikat di dalam file

Satu file bisa berisi baris kembar (sheet cabang yang dobel, ekspor yang menggabungkan
dua periode tumpang tindih). Kunci yang dipakai **sama persis** dengan L2 (§9.2).

```js
const seen = new Map();                   // kunci → nama entitas pertama
for (const item of validItems) {
  const key = duplicateKey(item.data);
  if (seen.has(key)) markDuplicateInput(item, seen.get(key)); // alasan menyebut entitas pertama
  else seen.set(key, item.data.nama);
}
```

### 9.2 [L2] Cek terhadap database

**Pilih kunci alami yang tepat — keputusan terpenting di seluruh blueprint.**

| Jenis baris | Kunci | Alasan |
|---|---|---|
| Punya **kode referensi unik dari sumber** (RRN, REF, Transaction ID, nomor invoice) | `ref_code + jumlah` | Satu transaksi = satu kode, **tidak peduli** entitas, format keterangan, zona waktu, atau sumber file |
| Tidak punya referensi (transfer manual, EDC, tiket) | `tanggal(UTC) \| nama \| jumlah \| keterangan` | Tidak ada yang lebih baik; wajib sama persis |

```js
const REF = /(?:RRN|REF)\s*:\s*([A-Za-z0-9]{6,})/i;     // server & klien WAJIB sama (uji!)
const refOf = ket => (String(ket || '').match(REF) || [])[1]?.toUpperCase() || '';
function duplicateKey(d) {
  const ref = refOf(d.keterangan);
  return ref ? `REF|${ref}|${Number(d.jumlah).toFixed(2)}`
             : `${d.tanggal.split('T')[0]}|${d.nama}|${d.jumlah}|${d.keterangan}`;
}
```

Kenapa `+ jumlah` pada kunci referensi: data nyata berisi kode yang dipakai ulang secara
manual untuk nominal berbeda (salah ketik operator). Menyertakan nominal mencegah
transaksi sah ikut terblokir.

**Endpoint** `POST /check-duplicates` menerima `[{hash, tanggal, nama, jumlah, keterangan}]`:

```
pisahkan item: ber-referensi vs tanpa referensi
ref   → SELECT nama, tanggal, jumlah, ref_code FROM t WHERE ref_code IN (?, …)   -- per 500
tanpa → SELECT date(tanggal), nama, jumlah, keterangan FROM t WHERE date(tanggal) IN (tanggal unik)
balas { duplicates: [hash…], details: { hash: { ref, nama, tanggal } } }
```

- Simpan `ref_code` sebagai **kolom terindeks** (diisi saat insert/edit, di-backfill
  sekali untuk data lama) — jangan `LIKE '%kode%'` pada keterangan; itu full scan.
- Bandingkan nominal dengan `toFixed(2)` di kedua sisi (REAL vs string).
- **Bila request cek gagal → hentikan validasi dengan pesan error.** Jangan `catch` lalu
  menganggap semua baris baru (bug nyata yang pernah ada di Tartun).

### 9.3 [L3] Constraint unik di database

Cek aplikasi (L1/L2) punya celah waktu: dua operator (atau operator + integrasi API)
mengirim transaksi yang sama bersamaan; keduanya lolos L2. Hanya DB yang bisa menjamin.

```sql
CREATE UNIQUE INDEX uniq_trx_ref_amount ON transactions(ref_code, jumlah) WHERE ref_code <> '';
INSERT OR IGNORE INTO transactions (...) VALUES (...);   -- Postgres: ON CONFLICT DO NOTHING
```

- `OR IGNORE` → baris kembar dilewati **tanpa menggagalkan batch**; hitung
  `inserted = Σ changes`, `skipped = dikirim − inserted`, kembalikan keduanya.
- **Migrasi aman:** sebelum membuat indeks, cek apakah data lama sudah berisi kembar.
  Bila ya, lewati pembuatan indeks + tulis peringatan di log (jangan buat startup gagal),
  bersihkan data, lalu jalankan lagi.
- Indeks parsial (`WHERE ref_code <> ''`) membuat baris tanpa referensi tidak terkena.

### 9.4 Siapa menangkap apa

| Skenario | L1 | L2 | L3 |
|---|:-:|:-:|:-:|
| File yang sama di-upload dua kali | | ✅ semua baris `duplicate_db` | ✅ |
| Laporan diunduh ulang (isi sama) | | ✅ | ✅ |
| Dua file periode tumpang tindih | | ✅ | ✅ |
| Baris kembar dalam satu file | ✅ | | ✅ |
| Transaksi sama, nama outlet beda (peta kode diubah) | ✅ ref | ✅ ref | ✅ ref |
| Transaksi sama dari dua sumber (Excel bank vs settlement vs API) | ✅ ref | ✅ ref | ✅ ref |
| Dua upload / request API bersamaan | | ❌ celah | ✅ |
| Klik "Kirim" dua kali / retry jaringan | | | ✅ |
| Baris tanpa referensi, keterangan beda satu karakter | ❌ | ❌ | ❌ → perlu review manusia |

Pengecekan terjadi **per baris**, bukan per file: tidak ada catatan riwayat file, jadi
file yang sudah pernah di-upload dikenali dari semua barisnya berstatus `duplicate_db`
di staging.

Baris terakhir adalah batas yang jujur: tanpa kunci alami, sistem hanya bisa mencocokkan
teks persis. Mitigasinya bukan kode, melainkan **menjaga template keterangan tetap stabil**.

---

## 10. [T7] Submit — server sebagai hakim

```
POST /transactions/bulk  { rows: [{tanggal, nama, jumlah, keterangan, tipe}], batch_id }
  1. autentikasi + peran (mis. hanya Admin/OED)
  2. baca aturan (settings) SEKALI di awal → hitung ulang nilai turunan per baris
     (admin_fee, ref_code). Nilai sejenis dari klien DIABAIKAN.
  3. dalam 1 transaksi DB: INSERT OR IGNORE per chunk 50 baris
  4. log { batch_id, inserted, skipped }
  5. balas { inserted, skipped_duplicates, batch_id }
```

- **Batch ID** dibuat klien (`crypto.randomUUID()`) atau server; disimpan klien untuk
  tombol *Undo import terakhir*.
- **SQLite + satu koneksi bersama:** `BEGIN` kedua saat transaksi lain terbuka akan gagal.
  Bungkus semua tulis-berganda dalam antrian:

  ```js
  let queue = Promise.resolve();
  db.withTransaction = fn => {
    const run = queue.then(async () => {
      await db.run('BEGIN');
      try { const r = await fn(db); await db.run('COMMIT'); return r; }
      catch (e) { await db.run('ROLLBACK').catch(() => {}); throw e; }
    });
    queue = run.catch(() => {});
    return run;
  };
  ```

  (Postgres/MySQL dengan pool koneksi tidak butuh ini — pakai transaksi per koneksi.)
- Pesan sukses menyebut angka nyata: *"883 baris ditambahkan. 2 dilewati karena
  RRN/REF-nya sudah tersimpan."*

### Undo batch

`DELETE /transactions/batch/:batch_id` (konfirmasi ketik frasa `BATALKAN`). Karena L3
melewati baris yang sudah ada, **batch hanya berisi baris yang benar-benar dimasukkan
batch itu** — undo tidak pernah menghapus data milik upload lain.

### Edit setelah masuk

Edit kolom yang memengaruhi nilai turunan/kunci (`jumlah`, `keterangan`, `tipe`) wajib
menghitung ulang `admin_fee` & `ref_code` di server. Bentrok dengan constraint unik →
409 dengan pesan jelas, bukan 500.

---

## 11. Jalur tanpa UI: API ingest

Sistem lain (payment gateway, skrip) memakai pipeline yang sama tanpa staging:

| Aspek | Keputusan |
|---|---|
| Autentikasi | Header `X-API-Key`; simpan **hash SHA-256** + prefix; key asli tampil sekali; bisa dicabut; tidak berlaku untuk endpoint lain |
| Payload | Data **mentah** (`ref, amount, paid_at, outlet_code/name, method, payer, status`), bukan baris jadi — server yang merender keterangan dengan aturan sama |
| Batas | ≤ 500 item/request, rate limit per IP |
| Validasi | Per item; item salah → `rejected` + alasan, item lain tetap diproses |
| Idempoten | L2 + L3 sama dengan upload; urutan cek: DB dulu (agar alasan menyebut entitas asal), lalu kembar dalam request |
| Respons | HTTP 200 + `results[i] = { status: inserted \| duplicate \| rejected, reason, existing? }` |
| Gagal total | 500 + "tidak ada yang tersimpan, aman dikirim ulang" (berkat L3) |

---

## 12. Kebijakan error

| Situasi | Perlakuan | Jangan |
|---|---|---|
| Format file tidak dikenali | Modal "Format tidak dikenali, pilih manual / tambah profil" | Menebak profil dengan skor 0 |
| Profil CSV untuk file Excel | Modal "Format tidak sesuai" | Mencoba parse biner sebagai teks |
| Kolom wajib hilang di satu sheet | 1 baris error menyebut sheet & kolom; sheet lain tetap diproses | Diam-diam melewati sheet |
| Baris tak terbaca | Status `error` + alasan, bisa dihapus massal | Membuang baris tanpa jejak |
| Cek duplikat ke server gagal | Hentikan, minta coba lagi | Menganggap semua baru |
| Kembar saat insert | Dilewati & dihitung (`skipped`) | Menggagalkan seluruh batch |
| Gagal di tengah submit | Rollback penuh, aman diulang | Commit sebagian |

---

## 13. Keamanan

- Query **selalu ter-parameterisasi**; nama kolom untuk UPDATE dinamis wajib **whitelist**
  (bug nyata: `SET ${key} = ?` dari body = SQL injection).
- Escape semua teks dari file sebelum dirender (`&<>"'`); nama profil dari pengguna juga.
- Nilai turunan dari klien **diabaikan** di server (lihat §10).
- Batas ukuran body, jumlah baris per request, dan panjang teks per field.
- Endpoint tulis dilindungi peran; API key terpisah dari sesi manusia (login otomatis
  dengan akun manusia memutus sesi tunggal pemiliknya).

---

## 14. Pengujian & paritas

**Saat mengganti parser lama dengan mesin profil, buktikan hasilnya identik.**

1. Kumpulkan **file asli** per sumber (golden files, jangan di-commit bila berisi data pribadi).
2. Jalankan parser **lama** (versi git sebelumnya) → simpan output sebagai baseline JSON.
3. Jalankan mesin **baru** → bandingkan sebagai multiset `[tanggal, nama, jumlah,
   keterangan, tipe]` → target **0 hilang, 0 tambahan**.
4. Ulangi untuk nilai turunan (mis. biaya admin) pada seluruh isi DB.

Hasil di Tartun V2: Excel bank 1.141 baris, settlement 885, CSV 41.677 — 0 selisih;
biaya admin 38.677 → 80.354 baris — 0 selisih.

**Tes otomatis minimum** (Tartun: `node:test`, DB sementara lewat env path):

| Area | Kasus |
|---|---|
| CSV | kutip berisi pemisah, kutip ganda, BOM, CRLF, pemisah Tab |
| Profil | header dicari, sheet tanpa header dilewati, subtotal dilewati, status difilter, kolom wajib hilang → 1 error |
| Template | semua kombinasi placeholder kosong |
| Pengecualian | kata utuh (`BAYAR` ≠ `pembayaran`), frasa dengan spasi ganda |
| Kunci duplikat | regex referensi server == klien (tabel contoh yang sama) |
| L1 | kembar lintas entitas dalam satu file |
| L2 | ref lintas entitas terdeteksi; tanpa ref tetap per entitas |
| L3 | 4 request paralel dengan ref sama → tepat 1 tersimpan |
| Submit | nilai turunan dari klien diabaikan; `inserted/skipped` benar |
| Edit | ubah jumlah/keterangan → nilai turunan & ref dihitung ulang; bentrok → 409 |

---

## 15. Langkah adaptasi ke sistem lain

1. **Tentukan kunci alami per sumber.** Cari kolom yang unik per transaksi di sisi sumber
   (RRN, Transaction ID, nomor invoice, nomor mutasi). Tidak ada → kunci komposit persis
   dan terima keterbatasannya (§9.4 baris terakhir).
2. **Tambah kolom `ref_code` + indeks + constraint unik parsial**; backfill data lama;
   bersihkan kembar lama sebelum membuat constraint.
3. **Normalisasikan pembacaan file** ke `Table[]` (§4).
4. **Tulis profil** untuk tiap sumber yang ada file aslinya; implementasi `parseRow` dengan
   urutan §6.
5. **Satu `finalizeItems`** untuk semua jalur (upload, paste, API).
6. **Endpoint cek duplikat** (L2) + **staging** dengan alasan per baris.
7. **Submit** dengan hitung ulang server + `INSERT … ON CONFLICT DO NOTHING` + `batch_id`.
8. **Undo per batch.**
9. **Uji paritas** dengan file asli sebelum mematikan parser lama.

Keputusan yang diambil Tartun V2:

| Keputusan | Pilihan Tartun |
|---|---|
| Ref sama, entitas beda | Diblokir sebagai duplikat |
| Aturan nilai turunan diubah | Data lama dibekukan; hanya upload/edit berikutnya memakai aturan baru |
| Status transaksi non-final | Dilewati (profil import) / ditolak (API) |

---

## 16. Anti-pola (semuanya pernah terjadi di Tartun V2)

| Anti-pola | Akibat nyata | Perbaikan |
|---|---|---|
| Kata pengecualian dicocokkan **substring** | `BAYAR` membuang 30.132 baris QRIS karena "pem**bayar**an" | Kata/frasa utuh |
| Kunci duplikat memuat **nama entitas** | Transaksi sama masuk dua kali bila peta outlet berubah | Kunci referensi tanpa entitas |
| Kunci duplikat memuat **teks keterangan bebas** untuk data ber-referensi | Excel bank vs teks mutasi → format beda → lolos | Kunci referensi |
| `catch` pada cek duplikat lalu lanjut | Server mati sesaat → semua baris dianggap baru | Hentikan validasi |
| Percaya nilai turunan dari klien | Tab dengan aturan lama menyimpan biaya salah | Hitung ulang di server |
| Constraint unik tanpa `OR IGNORE` | Satu baris kembar menggagalkan batch 500 baris | `OR IGNORE` + laporkan `skipped` |
| Parser berbeda per sumber, tiap parser punya jalur staging sendiri | Satu jalur lupa menerapkan konsolidasi nama & pengecualian | Satu `finalizeItems` |
| Opsi konfigurasi dibaca dari **lokasi yang salah** di objek settings | Aturan diam-diam tidak pernah berlaku di dua format | Tes yang memastikan aturan berlaku di tiap jalur |
| `line.split(';')` untuk CSV | Sel berisi pemisah pecah | Parser dengan tanda kutip |
| Timestamp tanpa zona diparse di server UTC | Transaksi bergeser 7 jam, pindah hari | Offset eksplisit |

---

## 17. Peta ke kode Tartun V2

| Bagian | Lokasi |
|---|---|
| T1 terima file, T2 baca tabel | `public/js/handlers.js:handleImportFileUpload`, `readImportTables` |
| CSV parser, profil, deteksi, parse baris, template, nama | `public/js/importEngine.js`: `parseDelimited`, `DEFAULT_IMPORT_PROFILES`, `detectProfile`, `parseTables`, `parseRow`, `renderTemplate`, `resolveOutletName` |
| T5 finalisasi, L1, pengecualian | `importEngine.js`: `finalizeItems`, `duplicateKey`, `extractReference`, `matchesKeyword` |
| Editor profil | `public/js/importSettings.js` |
| L2 klien | `handlers.js:checkForDuplicates` |
| L2 server | `routes/transactions.js` `POST /check-duplicates`, `utils/duplicateLookup.js` |
| Referensi server | `utils/transactionRef.js` |
| L3 + migrasi | `db.js`: `migrateRefCode`, `ensureUniqueRefIndex`, `withTransaction` |
| T6 staging | `public/js/ui.js`: `createStagingTableRow`, `updateStagingStatsAndSubmitBtn` |
| T7 submit, undo, edit | `routes/transactions.js`: `/bulk`, `/batch/:batch_id`, `/bulk-update` |
| API ingest | `routes/ingest.js`, `utils/qrIngest.js`, `utils/apiKeys.js`, `middleware/apiKey.js` |
| Tes | `tests/importEngine.test.js`, `tests/duplicateRef.test.js`, `tests/transactionsFee.test.js`, `tests/ingest.test.js` |

---

## 18. Ringkasan satu layar

```
ANALISIS (klien, belum menulis)            SIMPAN (server, 1 transaksi)
────────────────────────────────           ─────────────────────────────
file → Table[] (CSV berkutip, semua sheet)  hitung ulang nilai turunan
profil (data) + deteksi dari header        INSERT OR IGNORE / ON CONFLICT
parse: skip sampah, error terlihat         batch_id → undo aman
finalisasi tunggal: kecuali (kata utuh),   balas {inserted, skipped}
  nama kanonik, kunci duplikat
staging dengan alasan per baris

ANTI DOUBLE-UPLOAD
L1 kembar di dalam file                → duplicate_input
L2 cek DB: ref+jumlah | kunci persis   → duplicate_db (+ asal)
L3 UNIQUE(ref_code, jumlah)            → satu-satunya jaminan saat paralel
```

Kunci alami yang tepat lebih penting daripada semua lapis lain: tanpa itu, L1–L3 hanya
mencocokkan teks.
