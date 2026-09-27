# Blueprint Optimasi Load — Playbook Portabel

> Kumpulan pola "fast first load" yang dipakai di Tartun V2, ditulis ulang agar
> bisa diterapkan di web app lain (stack apa pun). Setiap pola: **masalah →
> solusi → contoh → cara adaptasi → jebakan**.
>
> Konteks asal: SPA yang harus memuat **seluruh tabel (~ratusan ribu baris,
> ~10 MB JSON)** ke browser saat start, lalu difilter/dirender sepenuhnya di klien.

---

## 0. Tiga prinsip inti

Semua pola di bawah adalah turunan dari tiga gerakan ini:

| Prinsip | Artinya | Contoh konkret |
|---|---|---|
| **KECILKAN** | Kurangi byte yang menyeberang jaringan | `SELECT` kolom seperlunya, gzip, jangan kirim field yang tak dipakai |
| **PARALELKAN** | Jalankan hal yang tidak saling bergantung secara bersamaan | prefetch data + config sekaligus, `Promise.all`, `<script defer>` |
| **TUNDA** | Jangan bayar biaya sesuatu sampai benar-benar dibutuhkan | lazy-load library export, index pencarian dibuat saat search pertama, virtual scroll |

Kalau ragu menerapkan pola tertentu, tanyakan: *"ini KECILKAN, PARALELKAN, atau TUNDA?"* Kalau bukan ketiganya, kemungkinan bukan optimasi load.

---

## 1. Lapisan Database / Query

### 1.1 Pilih engine yang menghapus latency jaringan

**Masalah:** DB terpisah (Postgres/MySQL di host lain) menambah round-trip TCP +
handshake + connection pool untuk tiap query.

**Solusi:** Untuk beban baca-berat, single-node, data < beberapa GB — DB *embedded*
(SQLite, DuckDB, LMDB) jalan di proses yang sama = 0 latency jaringan.

**Adaptasi:**
- Tetap di Postgres? Dekatkan: pooler (PgBouncer) di host yang sama, `keep-alive`
  connection, hindari `connect per request`.
- Serverless? Pakai driver HTTP/edge (mis. Neon serverless, PlanetScale) supaya
  tidak bayar cold TCP tiap invoke.

**Jebakan:** SQLite tidak cocok untuk banyak penulis konkuren / multi-node.

### 1.2 Setel PRAGMA / parameter engine untuk baca cepat

**Contoh (SQLite, dari `db.js`):**
```js
db.run('PRAGMA journal_mode = MEMORY');   // atau WAL untuk keseimbangan aman/cepat
db.run('PRAGMA synchronous = NORMAL');    // kurangi fsync
db.run('PRAGMA cache_size = 10000');      // ~40 MB page cache di RAM
db.run('PRAGMA temp_store = MEMORY');
db.run('PRAGMA busy_timeout = 5000');
```

**Adaptasi:**
- **Rekomendasi umum: `WAL`**, bukan `MEMORY`. `MEMORY` menukar durabilitas —
  kalau proses crash saat menulis, transaksi terakhir bisa hilang. Pakai `MEMORY`
  hanya kalau data bisa dibangun ulang dari sumber lain.
- Postgres: naikkan `shared_buffers`, `effective_cache_size`, `work_mem`; pastikan
  dataset panas muat di RAM.

**Jebakan:** `synchronous=OFF` / `journal_mode=MEMORY` = risiko korupsi pada
kegagalan daya. Ukur dulu apakah `WAL` sudah cukup cepat.

### 1.3 Bikin index yang menghapus langkah SORT

**Masalah:** Query load awal biasanya `ORDER BY <waktu> DESC LIMIT ...`. Tanpa index
yang cocok, engine memindai lalu menyortir seluruh hasil.

**Solusi:** Index dengan arah yang sama dengan `ORDER BY`.
```sql
CREATE INDEX idx_tx_tanggal ON transactions(tanggal DESC);
-- query "SELECT ... ORDER BY tanggal DESC" kini baca berurutan dari index, tanpa sort
```

**Adaptasi:** Untuk query berfilter, buat index komposit sesuai pola `WHERE` +
`ORDER BY` (kolom equality dulu, lalu kolom range/sort). Verifikasi dengan
`EXPLAIN QUERY PLAN` (SQLite) / `EXPLAIN ANALYZE` (Postgres) — pastikan tidak ada
`SCAN` + `USE TEMP B-TREE FOR ORDER BY`.

### 1.4 Jangan `SELECT *` — kirim kolom yang dipakai UI saja

**Contoh (dari `routes/transactions.js`):**
```js
// batch_id (UUID 36 char) & row_hash tak dipakai frontend → jangan diambil
const LIST_COLUMNS = 'id, tanggal, nama, jumlah, keterangan, tipe_sheet, created_at';
const rows = await db.allAsync(`SELECT ${LIST_COLUMNS} FROM transactions ORDER BY tanggal DESC`);
```

**Dampak:** Membuang 1 kolom UUID 36-char dari 200.000 baris = ~7 MB mentah hilang
sebelum kompresi.

**Adaptasi:** GraphQL/ORM — matikan over-fetching default; definisikan "list
projection" vs "detail projection" terpisah.

### 1.5 Satu request untuk "muat semua", bukan paginasi berantai

**Masalah:** Loop `while` ambil page demi page = N round-trip sekuensial, tiap page
bayar latency penuh.

**Solusi:** Endpoint yang boleh mengembalikan seluruh dataset dalam satu response
saat memang itu yang dibutuhkan (klien melakukan semua filter/paginasi lokal).
```js
// routes/transactions.js
const fetchAll = rawLimit === '0' || rawLimit === 'all' || rawLimit === undefined;
const rows = fetchAll
  ? await db.allAsync(`SELECT ${COLS} FROM transactions ORDER BY tanggal DESC`)
  : await db.allAsync(`SELECT ${COLS} FROM transactions ORDER BY tanggal DESC LIMIT ? OFFSET ?`, [limit, offset]);
```

**Adaptasi / batas aman:**
- Hanya untuk dataset yang *bounded* (maks puluhan MB, ratusan ribu baris).
- Selalu sediakan **fallback paginasi paralel** (lihat 3.4) untuk dataset besar.
- Streaming JSON (`JSONStream`, `res.write` per chunk) kalau ingin TTFB lebih cepat.

---

## 2. Lapisan Transport (HTTP)

### 2.1 Kompresi response — kemenangan terbesar per baris kode

**Contoh (`server.js`):**
```js
const compression = require('compression');
app.use(compression());   // 1 baris
```
**Dampak nyata di Tartun V2:** JSON transaksi **~10 MB → ~0.9 MB** (±11×). Data
tabular berulang (nama outlet, keterangan, tipe yang sama berkali-kali) punya rasio
kompresi sangat tinggi.

**Adaptasi:**
- Di belakang Nginx/Cloudflare? Aktifkan gzip/brotli di sana dan matikan di app
  (jangan dobel-kompres).
- Aset statis: pre-compress (`.br`, `.gz`) saat build.
- **brotli** > gzip untuk teks; aktifkan kalau tersedia.

**Jebakan:** Jangan kompres response yang sudah terkompresi (gambar, video, zip).

### 2.2 Cache aset statis agresif + cache-busting via URL

**Contoh (`server.js`):**
```js
app.use(express.static('public', {
  maxAge: '30d',
  setHeaders: (res, p) => {
    if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); // selalu revalidasi
  }
}));
```
```html
<!-- index.html: ganti query saat file berubah -->
<script defer src="js/main.js?v=1.6.0"></script>
<link rel="stylesheet" href="style.css?v=1.2.0">
```

**Prinsip:** `index.html` = `no-cache` (selalu cek versi terbaru). Semua aset
lain = cache 30 hari, dan URL berubah (`?v=`) begitu isinya berubah → kunjungan
ulang memuat JS/CSS dari disk, nol request jaringan.

**Adaptasi:** Bundler modern (Vite/webpack) menaruh hash di nama file
(`main.a1b2c3.js`) — efek sama, otomatis. Kalau tanpa build step, `?v=` manual
sudah cukup.

**Jebakan:** Lupa menaikkan `?v=` → user dapat kode lama sampai 30 hari.

### 2.3 `preconnect` ke origin pihak ketiga yang pasti dipakai

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```
DNS + TLS handshake ke CDN font/aset dimulai lebih awal, paralel dengan parsing.

### 2.4 Hentikan request latar belakang yang rebutan bandwidth saat load

**Contoh (`main.js`):** session-checker diubah `30s → 90s` dan dilewati saat tab
tidak terlihat:
```js
setInterval(async () => {
  if (document.hidden) return;              // jangan polling tab background
  // ... cek sesi
}, 90000);
```

**Adaptasi:** Audit semua `setInterval`/polling/heartbeat. Saat first load, mereka
tidak boleh bersaing dengan unduhan data utama. Pertimbangkan menunda pemasangan
interval sampai `load` event.

---

## 3. Lapisan Pemuatan Aset (HTML / JS / CSS)

### 3.1 `<script defer>` untuk semua — unduh paralel, eksekusi terurut

**Sebelum (`index.html` lama):**
```html
<script src=".../chart.js"></script>          <!-- blok parser -->
<script src=".../xlsx.full.min.js"></script>  <!-- blok parser, ~900 KB -->
```
**Sesudah:**
```html
<script defer src=".../chart.js"></script>
<script defer src="js/state.js?v=1.6.0"></script>
<script defer src="js/main.js?v=1.6.0"></script>
```

`defer`: file diunduh paralel selagi HTML diparse, dieksekusi **berurutan** tepat
sebelum `DOMContentLoaded`. Untuk arsitektur "banyak file global berurutan" (tanpa
bundler), ini mempertahankan urutan `state → utils → api → ... → main`.

**Jebakan:** `async` TIDAK menjamin urutan — jangan pakai `async` untuk skrip yang
saling bergantung. Inline script yang memakai global dari file `defer` juga harus
`defer` (atau taruh di `DOMContentLoaded`).

### 3.2 Lazy-load library berat — bayar hanya saat fiturnya dipakai

**Pola (`utils.js`):**
```js
const _scriptPromises = {};
function _loadScriptOnce(url) {
  if (!_scriptPromises[url]) {
    _scriptPromises[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete _scriptPromises[url]; reject(new Error('gagal: ' + url)); };
      document.head.appendChild(s);
    });
  }
  return _scriptPromises[url];
}

async function ensureXLSX() {
  if (typeof XLSX === 'undefined') await _loadScriptOnce(CDN.xlsx);
}

// dipakai:
async exportToXLSX(...) {
  try { await ensureXLSX(); }
  catch { this.ui.showModal('Error', 'Gagal memuat library Excel. Cek koneksi.'); return; }
  // ... XLSX.utils...
}
```

**Dampak:** `xlsx` (~900 KB) + `jspdf` (~350 KB) + `html2canvas` (~200 KB) = **~1.5 MB
keluar dari initial load**. Mayoritas user yang cuma melihat dashboard tak pernah
mengunduhnya.

**Adaptasi:**
- Bundler: `const XLSX = await import('xlsx')` (dynamic import) — code-splitting otomatis.
- Terapkan ke: editor rich-text, chart lib, PDF, peta, QR, crypto — apa pun yang
  berat & tidak dipakai di jalur utama.

**Jebakan:** Tangani kegagalan unduh (offline) dengan pesan jelas; jangan
biarkan `undefined is not a function`.

### 3.3 Prefetch data besar PARALEL dengan config, bukan setelahnya

**Sebelum (`auth.js` lama):** sekuensial
```js
await this.settings.load();          // request 1 selesai...
await this.handlers.fetchInitialData(); // ...baru request 2 (yang besar) mulai
```
**Sesudah:**
```js
const dataPrefetch = this.api.fetchAllData();  // MULAI sekarang, jangan di-await
await this.settings.load();                    // jalan berbarengan
this.handlers.setDefaultDateFilters();
await this.handlers.fetchInitialData(dataPrefetch); // await promise yang sudah jalan
```

Unduhan 0.9 MB kini overlap dengan request settings + parsing, bukan antre.

**Prinsip umum:** Identifikasi request yang **tidak saling bergantung** di jalur
boot dan tembakkan semuanya sedini mungkin. `await` hasilnya belakangan.

### 3.4 Dedupe request in-flight + fallback paginasi paralel

```js
// api.js
fetchAllData() {
  if (AppState._fetchAllInFlight) return AppState._fetchAllInFlight;   // dedupe
  const p = this._fetchAllDataImpl();
  AppState._fetchAllInFlight = p;
  p.finally(() => { AppState._fetchAllInFlight = null; });
  return p;
}

async _fetchAllDataImpl() {
  try {
    const res = await this.api.req('/transactions?limit=all');   // 1 request
    if (Array.isArray(res.data)) return res.data;
  } catch (e) { /* fallback ↓ */ }

  const first = await this.api.req('/transactions?page=1&limit=2000');
  let all = first.data || [];
  const reqs = [];
  for (let page = 2; page <= (first.totalPages || 1); page++)
    reqs.push(this.api.req(`/transactions?page=${page}&limit=2000`));
  for (const p of await Promise.all(reqs))          // paralel, bukan while sekuensial
    all = all.concat(p.data || []);
  return all;
}
```

Dua ide: (a) beberapa pemanggil di fase init berbagi **satu** HTTP request;
(b) kalau "ambil semua" gagal, halaman 2..N diambil **serentak** (`Promise.all`),
bukan satu per satu.

---

## 4. Lapisan Pemrosesan Data di Klien

Setelah data sampai, "cepat" ditentukan oleh seberapa hemat kamu menyentuhnya.

### 4.1 Satu kali pass praproses saat data masuk

**Contoh (`handlers.js` `fetchInitialData`):**
```js
const nameCache = new Map();
this.state.allData = initialData.map(row => {
  // normalisasi nama SEKALI (dengan cache), bukan tiap render
  let name = nameCache.get(row.nama);
  if (name === undefined) {
    name = nameConsolidation[normalize(row.nama).toUpperCase()] || normalize(row.nama);
    nameCache.set(row.nama, name);
  }
  row.nama = name;
  row._ts = row.tanggal ? Date.parse(row.tanggal) : 0;   // pra-parse tanggal → number
  return row;
});
```

**Prinsip:** Apa pun yang akan dibaca berulang kali saat filter/sort/render —
parsing tanggal, normalisasi string, konversi tipe — **hitung sekali** di titik
masuk data. `Date.parse()` sekali per baris jauh lebih murah daripada
`new Date(str)` ribuan kali per interaksi.

### 4.2 Reuse objek mahal (formatter, regex, collator)

```js
// utils.js — SATU formatter, dipakai ribuan sel
const _IDR_FORMATTER = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 });
formatCurrency(v) { return _IDR_FORMATTER.format(v || 0); }
```
`new Intl.NumberFormat()` / `new RegExp()` / `new Intl.Collator()` per pemanggilan
sangat mahal. Buat sekali di scope modul.

### 4.3 Memoisasi komputasi berulang, invalidasi via identitas objek

```js
// utils.js — cache aturan ter-kompilasi + hasil, di-key per objek `settings`
const _feeBundleCache = new WeakMap();
function _getFeeBundle(settings) {
  let b = _feeBundleCache.get(settings);
  if (b) return b;
  const compiled = settings.adminRules
    .map(r => ({ keywords: r.keyword.split(',').map(k=>k.trim().toUpperCase()), amount:+r.amount, /*...*/ }))
    .sort((a,b) => a.amount - b.amount);         // sort SEKALI, bukan tiap panggilan
  b = { compiled, memo: new Map() };
  _feeBundleCache.set(settings, b);
  return b;
}

function calculateAdminFee(row, settings) {
  const bundle = _getFeeBundle(settings);
  const key = `${row.tipe_sheet}|${row.jumlah}|${row.keterangan}`;  // banyak baris identik
  const hit = bundle.memo.get(key);
  if (hit !== undefined) return hit;
  // ... hitung ...
  bundle.memo.set(key, result);
  return result;
}
```

**Trik invalidasi:** pakai `WeakMap` di-key objek `settings`. Saat config di-reload,
`settings.load()` membuat **objek baru** → cache lama otomatis tak terjangkau &
di-GC. Tanpa logika "clear cache" manual.

### 4.4 Bangun index turunan secara lazy

```js
// handlers.js
ensureSearchIndex() {
  if (this.state.dataIndexes?.searchableText) return this.state.dataIndexes.searchableText;
  const idx = new Map();
  for (const row of this.state.allData)
    idx.set(row.id, `${row.nama} ${row.keterangan} ${row.jumlah}`.toLowerCase());
  this.state.dataIndexes = { searchableText: idx };
  return idx;
}
```
Index pencarian dibangun **saat pencarian pertama**, bukan saat load. User yang tak
pernah mencari tak pernah bayar biayanya. Reset index saat data berubah.

### 4.5 Cache hasil filter + invalidasi saat data berubah

`AppState.filterCache = new Map()` menyimpan hasil query filter yang sudah dihitung;
`buildIndexes()` memanggil `filterCache.clear()` setiap kali `allData` berubah
(insert/update/delete). Key cache = kombinasi kriteria filter yang diserialisasi.

---

## 5. Lapisan Rendering

### 5.1 Virtual scroll — render hanya yang terlihat

**Pola (`virtualScroll.js`):**
```js
updateAndRender() {
  const startIndex = Math.floor(this.scrollTop / this.rowHeight);
  const buffer = 5;
  this.renderedStart = Math.max(0, startIndex - buffer);
  const visibleCount = Math.ceil(this.containerEl.clientHeight / this.rowHeight);
  this.renderedEnd = Math.min(total, startIndex + visibleCount + buffer);
  this._render(total * this.rowHeight);
}
_render(totalHeight) {
  this.scrollerEl.style.height = `${totalHeight}px`;                 // spacer: scrollbar benar
  this.contentEl.innerHTML = this.fullData
    .slice(this.renderedStart, this.renderedEnd)
    .map(this.renderRowFunction).join('');
  this.contentEl.style.transform = `translateY(${this.renderedStart * this.rowHeight}px)`;
}
```
Poin penting:
- **Tinggi baris tetap** → posisi = `index * rowHeight` (matematika, bukan mengukur DOM).
- Spacer div setinggi total → scrollbar native tetau akurat.
- `translateY` menggeser blok baris yang dirender ke viewport.
- Handler scroll di-**throttle ~16ms** (1 frame).
- `ResizeObserver` re-render saat container berubah ukuran.

**Dampak:** 200.000 baris → hanya ~30–50 node `<tr>` di DOM kapan pun.

**Adaptasi:** Framework punya versi jadi — TanStack Virtual, `react-window`,
`react-virtualized`, `vue-virtual-scroller`. Jangan tulis sendiri kecuali memang
tanpa framework.

**Jebakan:** Tinggi baris variabel butuh pengukuran/estimasi (lebih rumit).
`innerHTML = ...` menghancurkan state DOM (input focus, dsb) — untuk sel interaktif
pakai reconciliation framework atau keyed updates.

### 5.2 Ikon/aset inline untuk baris yang sering dirender

`handlers.js` menyimpan SVG ikon sebagai string konstan dan menyisipkannya di HTML
baris, alih-alih memanggil `lucide.createIcons()` (yang men-scan DOM) tiap frame scroll.

---

## 6. Checklist adopsi (urut prioritas)

Kerjakan dari atas — ROI per jam kerja menurun ke bawah.

- [ ] **gzip/brotli** aktif di seluruh response teks (1 baris, ±10× lebih kecil)
- [ ] Query load awal pakai **index searah `ORDER BY`** (cek `EXPLAIN`)
- [ ] **Buang `SELECT *`** → proyeksi kolom eksplisit untuk endpoint list
- [ ] Semua `<script>` jadi **`defer`** (atau bundler dengan hashing)
- [ ] Aset statis **cache 30d + hash/`?v=`**; `index.html` `no-cache`
- [ ] **Lazy-load** tiap library berat yang tak dipakai di jalur utama
- [ ] Request boot yang independen ditembakkan **paralel** (prefetch, tidak di-`await` dini)
- [ ] Loop paginasi sekuensial → **1 request** atau **`Promise.all`**
- [ ] **Dedupe** request in-flight yang identik
- [ ] Praproses data **1 pass** saat masuk (tanggal→number, normalisasi string)
- [ ] **Reuse** `Intl.*` / `RegExp` di scope modul
- [ ] **Memoisasi** komputasi per-baris yang berulang (WeakMap per objek config)
- [ ] Index turunan (search, dsb) dibangun **lazy**
- [ ] Tabel besar pakai **virtual scroll**
- [ ] Polling/`setInterval` **tidak bersaing** dengan first load (skip saat `document.hidden`)
- [ ] PRAGMA/param DB disetel (`WAL`, cache_size) — **`WAL`, bukan `MEMORY`, kecuali data disposable**

---

## 7. Cara mengukur (jangan menebak)

| Metrik | Alat | Target kasar |
|---|---|---|
| Ukuran transfer response API | DevTools → Network → kolom "Size" (transfer vs resources) | rasio gzip ≥ 5× untuk JSON |
| Waktu query DB | `EXPLAIN ANALYZE` / log durasi query | tak ada full scan + temp b-tree untuk sort |
| JS yang diunduh di initial load | DevTools → Coverage / Network filter JS | turun signifikan setelah lazy-load |
| Waktu sampai tabel interaktif | `performance.mark()` di awal boot & setelah render pertama | — |
| Node DOM saat scroll tabel | DevTools → Elements, atau `document.querySelectorAll('tr').length` | konstan, tidak naik dengan jumlah data |
| Long tasks saat filter | DevTools → Performance → Main thread | tak ada task > 50 ms |

Ambil **baseline sebelum**, ubah **satu hal**, ukur lagi. Commit terpisah per pola
(seperti commit `optimasi load` di repo ini) supaya bisa di-bisect kalau ada regresi.

---

## 8. Kapan blueprint ini TIDAK cocok

- **Dataset tak terbatas / tumbuh terus** (log, event, multi-tenant besar) → jangan
  "muat semua ke browser". Pakai server-side pagination + filter + virtualization
  yang fetch on-demand.
- **Butuh data real-time multi-user** → model "unduh semua sekali" jadi basi;
  butuh WebSocket/SSE + patch incremental. (Tartun V2 punya sisa kode realtime
  Supabase yang kini non-aktif — konsekuensinya user tidak melihat perubahan user
  lain sampai reload.)
- **SEO / konten publik** → butuh SSR/SSG; blueprint ini murni untuk app
  ter-autentikasi berbasis data.
- **Data sensitif per-baris** → proyeksi kolom & "ambil semua" harus lewat
  otorisasi per-row; jangan kirim kolom yang user tak berhak lihat.
- **`journal_mode = MEMORY`** → jangan dipakai kalau kehilangan transaksi terakhir
  tidak dapat ditoleransi.

---

## 9. Ringkasan satu layar

```
KECILKAN                    PARALELKAN                  TUNDA
─────────                   ──────────                  ─────
gzip/brotli                 <script defer>              lazy-load lib berat
proyeksi kolom (no *)       prefetch data ‖ config      index search on-first-use
index utk sort              Promise.all paginasi        virtual scroll
cache-bust hash             preconnect CDN              interval setelah load
                            dedupe in-flight            memoisasi per-baris
```
Terapkan berlapis: DB → HTTP → aset → data klien → render. Ukur tiap langkah.
