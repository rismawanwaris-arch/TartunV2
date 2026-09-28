// Pencarian transaksi yang sudah ada di DB, dipakai /check-duplicates (upload
// dari UI) dan endpoint API ingest.

const amountKey = value => Number(value).toFixed(2);
const REF_QUERY_CHUNK = 500;

// Map `${ref_code}|${jumlah}` -> baris lama dengan kode referensi yang sama, di outlet mana pun.
async function findExistingByReference(db, refs) {
  const found = new Map();
  for (let i = 0; i < refs.length; i += REF_QUERY_CHUNK) {
    const chunk = refs.slice(i, i + REF_QUERY_CHUNK);
    const rows = await db.allAsync(
      `SELECT nama, tanggal, jumlah, ref_code FROM transactions WHERE ref_code IN (${chunk.map(() => '?').join(',')})`,
      chunk
    );
    rows.forEach(r => found.set(`${r.ref_code}|${amountKey(r.jumlah)}`, r));
  }
  return found;
}

// Set kunci tanggal|nama|jumlah|keterangan untuk transaksi tanpa kode referensi.
async function findExistingByExactKey(db, items) {
  const dates = [...new Set(items.map(i => String(i.tanggal || '').split('T')[0]))].filter(Boolean);
  if (dates.length === 0) return new Set();
  const rows = await db.allAsync(
    `SELECT date(tanggal) as d, nama, jumlah, keterangan FROM transactions WHERE date(tanggal) IN (${dates.map(() => '?').join(',')})`,
    dates
  );
  return new Set(rows.map(r => `${r.d}|${r.nama}|${amountKey(r.jumlah)}|${r.keterangan || ''}`));
}

module.exports = { amountKey, findExistingByReference, findExistingByExactKey };
