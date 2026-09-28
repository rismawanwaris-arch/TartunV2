// Pengolahan transaksi QR yang dikirim lewat API ingest.
// Memakai aturan yang sama dengan upload file (public/js/importEngine.js):
// pemetaan NMID, konsolidasi nama, template keterangan, kata pengecualian,
// biaya admin, dan deteksi duplikat berbasis RRN/REF.
const AppImport = require('../public/js/importEngine');
const { compileAdminRules, computeAdminFee } = require('./adminFee');
const { amountKey, findExistingByReference } = require('./duplicateLookup');

const MAX_BATCH_SIZE = 500;
const MAX_TEXT_LENGTH = 100;
const REF_FORMAT = /^[A-Za-z0-9]{6,64}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/;
const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/;
const WIB_OFFSET = '+07:00';

// Format keterangan sama dengan profil "Settlement QRIS (CSV)" agar transaksi
// dari API & dari file settlement terlihat seragam.
const KETERANGAN_TEMPLATE = 'TARTUN QR REF:{ref} [Menerima pembayaran dari {metode} a.n. {pembayar}|Menerima pembayaran dari {metode}|Menerima pembayaran QRIS]';

const cleanText = value => String(value === undefined || value === null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Validasi satu item payload. Mengembalikan { error } atau { value }.
function validateItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Item harus berupa objek' };

  const ref = cleanText(item.ref);
  if (!REF_FORMAT.test(ref)) return { error: 'ref wajib diisi: 6-64 karakter huruf/angka' };

  const amount = typeof item.amount === 'string' ? Number(item.amount.trim()) : item.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
    return { error: 'amount wajib berupa angka lebih dari 0' };
  }

  const paidAtRaw = cleanText(item.paid_at);
  if (!ISO_DATETIME.test(paidAtRaw)) return { error: 'paid_at wajib format ISO 8601, mis. 2026-09-27T19:59:00+07:00' };
  const paidAt = new Date(HAS_TIMEZONE.test(paidAtRaw) ? paidAtRaw : paidAtRaw + WIB_OFFSET);
  if (isNaN(paidAt.getTime())) return { error: 'paid_at tidak valid' };

  const outletCode = cleanText(item.outlet_code);
  const outletName = cleanText(item.outlet_name);
  if (!outletCode && !outletName) return { error: 'outlet_code atau outlet_name wajib diisi' };

  const fields = { outletCode, outletName, method: cleanText(item.method), payer: cleanText(item.payer) };
  const tooLong = Object.entries(fields).find(([, v]) => v.length > MAX_TEXT_LENGTH);
  if (tooLong) return { error: `Teks terlalu panjang (maks ${MAX_TEXT_LENGTH} karakter)` };

  const status = cleanText(item.status || 'success').toLowerCase();
  if (status !== 'success') return { error: `Status "${status}" tidak diproses; hanya success` };

  return { value: { ref, amount, paidAt, ...fields } };
}

// Bentuk baris transaksi final dari item yang sudah valid.
function buildTransaction(value, settings, compiledRules) {
  const keterangan = AppImport.renderTemplate(KETERANGAN_TEMPLATE, {
    ref: value.ref, metode: value.method, pembayar: value.payer,
    kodeOutlet: value.outletCode, namaOutlet: value.outletName
  });
  const resolved = AppImport.resolveOutletName(value.outletCode, value.outletName, settings);
  const normalized = cleanText(resolved);
  const nama = (settings.nameConsolidation || {})[normalized.toUpperCase()] || normalized;
  const row = { tanggal: value.paidAt.toISOString(), nama, jumlah: value.amount, keterangan, tipe_sheet: 'MANUAL' };
  return { ...row, admin_fee: computeAdminFee(row, compiledRules), ref_code: value.ref.toUpperCase() };
}

// Memproses satu batch. Mengembalikan ringkasan & hasil per item (urutan sama dengan input).
async function ingestTransactions(db, items, { batchId }) {
  const settingsRow = await db.getAsync('SELECT settings FROM app_settings WHERE id = 1');
  const settings = settingsRow ? JSON.parse(settingsRow.settings) : {};
  const compiledRules = compileAdminRules(settings.adminRules);

  const results = items.map((item, index) => {
    const { error, value } = validateItem(item);
    const ref = item && item.ref !== undefined ? cleanText(item.ref) : null;
    if (error) return { index, ref, status: 'rejected', reason: error };
    const trx = buildTransaction(value, settings, compiledRules);
    if (AppImport.matchesKeyword(trx.keterangan, settings.exceptionKeywords || [])) {
      return { index, ref, status: 'rejected', reason: 'Keterangan mengandung kata kunci pengecualian' };
    }
    return { index, ref, status: 'pending', trx };
  });

  // Duplikat terhadap database (lintas outlet).
  // Dicek lebih dulu agar setiap item yang sudah ada di DB mendapat info asalnya.
  const pending = results.filter(r => r.status === 'pending');
  const existing = await findExistingByReference(db, [...new Set(pending.map(r => r.trx.ref_code))]);
  pending.forEach(r => {
    const match = existing.get(`${r.trx.ref_code}|${amountKey(r.trx.jumlah)}`);
    if (match) {
      Object.assign(r, { status: 'duplicate', reason: 'RRN/REF sudah tersimpan', existing: { nama: match.nama, tanggal: match.tanggal } });
    }
  });

  // Duplikat di dalam request yang sama.
  const firstIndex = new Map();
  results.filter(r => r.status === 'pending').forEach(r => {
    const key = `${r.trx.ref_code}|${amountKey(r.trx.jumlah)}`;
    if (firstIndex.has(key)) {
      Object.assign(r, { status: 'duplicate', reason: `Sama dengan item index ${firstIndex.get(key)} di request ini` });
    } else {
      firstIndex.set(key, r.index);
    }
  });

  // Simpan. OR IGNORE + indeks unik menangani request paralel dengan RRN sama.
  const toInsert = results.filter(r => r.status === 'pending');
  await db.withTransaction(async () => {
    for (const r of toInsert) {
      const t = r.trx;
      const res = await db.runAsync(
        `INSERT OR IGNORE INTO transactions (tanggal, nama, jumlah, keterangan, tipe_sheet, batch_id, admin_fee, ref_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.tanggal, t.nama, t.jumlah, t.keterangan, t.tipe_sheet, batchId, t.admin_fee, t.ref_code]
      );
      Object.assign(r, res.changes > 0
        ? { status: 'inserted', id: res.lastID }
        : { status: 'duplicate', reason: 'RRN/REF sudah tersimpan' });
    }
  });

  const output = results.map(({ trx, ...r }) => (r.status === 'inserted'
    ? { ...r, nama: trx.nama, admin_fee: trx.admin_fee }
    : r));
  const count = status => output.filter(r => r.status === status).length;
  return {
    batch_id: batchId,
    received: items.length,
    inserted: count('inserted'),
    duplicates: count('duplicate'),
    rejected: count('rejected'),
    results: output
  };
}

module.exports = { MAX_BATCH_SIZE, KETERANGAN_TEMPLATE, validateItem, buildTransaction, ingestTransactions };
