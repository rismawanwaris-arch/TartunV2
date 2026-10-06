const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');
const { compileAdminRules, computeAdminFee } = require('../utils/adminFee');
const { extractReference } = require('../utils/transactionRef');
const { amountKey, findExistingByReference, findExistingByExactKey } = require('../utils/duplicateLookup');
const { broadcastDataChange } = require('../utils/reactor');

// Kolom yang benar-benar dipakai frontend. Sengaja tidak SELECT * agar
// batch_id (UUID 36 char) & row_hash tidak ikut terkirim -> payload jauh lebih kecil.
const LIST_COLUMNS = 'id, tanggal, nama, jumlah, keterangan, tipe_sheet, admin_fee, created_at';

// Kolom yang boleh diubah lewat /bulk-update (nama kolom masuk ke SQL, wajib whitelist).
const EDITABLE_COLUMNS = ['tanggal', 'nama', 'jumlah', 'keterangan', 'tipe_sheet'];
// Perubahan pada kolom ini mengubah biaya admin, jadi admin_fee dihitung ulang.
const FEE_INPUT_COLUMNS = ['jumlah', 'keterangan', 'tipe_sheet'];

async function loadCompiledAdminRules() {
  const row = await db.getAsync('SELECT settings FROM app_settings WHERE id = 1');
  return compileAdminRules(row ? JSON.parse(row.settings).adminRules : []);
}

router.get('/', async (req, res) => {
  try {
    const { page = 1, search = '', filterType = '', startDate = '', endDate = '' } = req.query;
    // limit=0 / limit=all -> ambil seluruh data dalam satu response (dipakai saat load awal)
    const rawLimit = req.query.limit;
    const fetchAll = rawLimit === '0' || rawLimit === 'all' || rawLimit === undefined;
    const limit = fetchAll ? null : parseInt(rawLimit, 10) || 50;
    const offset = limit ? (page - 1) * limit : 0;

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(nama LIKE ? OR keterangan LIKE ? OR jumlah LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (filterType) {
      whereClauses.push('tipe_sheet = ?');
      params.push(filterType);
    }
    if (startDate && endDate) {
      whereClauses.push('tanggal >= ? AND tanggal <= ?');
      params.push(startDate, endDate);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRow = await db.getAsync(`SELECT COUNT(*) as total FROM transactions ${whereStr}`, params);
    const total = countRow.total;

    const rows = limit
      ? await db.allAsync(
          `SELECT ${LIST_COLUMNS} FROM transactions ${whereStr} ORDER BY tanggal DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        )
      : await db.allAsync(
          `SELECT ${LIST_COLUMNS} FROM transactions ${whereStr} ORDER BY tanggal DESC`,
          params
        );

    res.json({
      data: rows,
      total,
      page: parseInt(page),
      limit: limit || total,
      totalPages: limit ? Math.ceil(total / limit) : 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bulk', authenticateToken, requireRole('Master', 'Admin', 'OED'), async (req, res) => {
  const { rows, batch_id } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No data provided' });
  }

  const trxBatchId = batch_id || crypto.randomUUID();

  try {
    // Biaya admin dihitung di server dari aturan di settings saat ini;
    // nilai admin_fee dari klien (bila ada) diabaikan.
    const compiledRules = await loadCompiledAdminRules();
    const inserted = await db.withTransaction(async () => {
      let insertedCount = 0;
      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const params = [];
        for (const r of chunk) {
          params.push(r.tanggal, r.nama, r.jumlah, r.keterangan, r.tipe_sheet, trxBatchId,
            computeAdminFee(r, compiledRules), extractReference(r.keterangan));
        }
        // OR IGNORE: transaksi ber-RRN yang sudah tersimpan (indeks unik ref_code+jumlah)
        // dilewati tanpa menggagalkan seluruh batch.
        const result = await db.runAsync(`INSERT OR IGNORE INTO transactions (tanggal, nama, jumlah, keterangan, tipe_sheet, batch_id, admin_fee, ref_code) VALUES ${valuePlaceholders}`, params);
        insertedCount += result.changes;
      }
      return insertedCount;
    });

    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'SUBMIT_DATA_SUCCESS', JSON.stringify({ batch_id: trxBatchId, count: inserted, skipped_duplicates: rows.length - inserted })
    ]);

    if (inserted > 0) {
      broadcastDataChange({ eventType: 'INSERT', count: inserted, batch_id: trxBatchId });
    }

    res.json({ success: true, batch_id: trxBatchId, inserted, skipped_duplicates: rows.length - inserted });
  } catch (error) {
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'SUBMIT_DATA_FAIL', JSON.stringify({ error: error.message })
    ]);
    res.status(500).json({ error: error.message });
  }
});

// Respon: duplicates = daftar hash yang sudah ada di DB; details[hash] menjelaskan
// baris lama yang cocok (dipakai frontend untuk alasan duplikat).
router.post('/check-duplicates', authenticateToken, requireRole('Master', 'Admin', 'OED'), async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.json({ duplicates: [], details: {} });
  }
  try {
    const withRef = [];
    const withoutRef = [];
    items.forEach(item => {
      const ref = extractReference(item.keterangan);
      (ref ? withRef : withoutRef).push({ ...item, ref });
    });

    const byReference = await findExistingByReference(db, [...new Set(withRef.map(i => i.ref))]);
    const byExactKey = await findExistingByExactKey(db, withoutRef);

    const duplicates = [];
    const details = {};
    withRef.forEach(item => {
      const existing = byReference.get(`${item.ref}|${amountKey(item.jumlah)}`);
      if (existing) {
        duplicates.push(item.hash);
        details[item.hash] = { ref: item.ref, nama: existing.nama, tanggal: existing.tanggal };
      }
    });
    withoutRef.forEach(item => {
      const datePart = String(item.tanggal || '').split('T')[0];
      if (byExactKey.has(`${datePart}|${item.nama}|${amountKey(item.jumlah)}|${item.keterangan || ''}`)) {
        duplicates.push(item.hash);
      }
    });
    res.json({ duplicates, details });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/range', authenticateToken, requireRole('Master'), async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'Start and end dates are required' });
  }
  try {
    const result = await db.runAsync('DELETE FROM transactions WHERE tanggal >= ? AND tanggal <= ?', [start, end]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'DELETE_DATA_RANGE', JSON.stringify({ start, end, deleted: result.changes })
    ]);
    if (result.changes > 0) {
      broadcastDataChange({ eventType: 'DELETE', count: result.changes, range: { start, end } });
    }
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/batch/:batch_id', authenticateToken, requireRole('Master', 'Admin', 'OED'), async (req, res) => {
  const { batch_id } = req.params;
  try {
    const result = await db.runAsync('DELETE FROM transactions WHERE batch_id = ?', [batch_id]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'UNDO_IMPORT_SUCCESS', JSON.stringify({ batch_id, deleted: result.changes })
    ]);
    if (result.changes > 0) {
      broadcastDataChange({ eventType: 'DELETE', count: result.changes, batch_id });
    }
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/delete-bulk', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid ids array' });
  }
  try {
    const placeholders = ids.map(() => '?').join(',');
    const result = await db.runAsync(`DELETE FROM transactions WHERE id IN (${placeholders})`, ids);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'DELETE_SELECTED', JSON.stringify({ count: result.changes })
    ]);
    if (result.changes > 0) {
      broadcastDataChange({ eventType: 'DELETE', count: result.changes, ids });
    }
    res.json({ success: true, count: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function validateUpdates(updates) {
  for (const item of updates) {
    if (!item || !Number.isInteger(Number(item.id)) || !item.data || typeof item.data !== 'object') {
      return 'Format update tidak valid';
    }
    const keys = Object.keys(item.data);
    if (keys.length === 0 || keys.some(k => !EDITABLE_COLUMNS.includes(k))) {
      return 'Kolom yang diubah tidak diizinkan';
    }
    if ('jumlah' in item.data && !Number.isFinite(Number(item.data.jumlah))) {
      return 'Jumlah harus berupa angka';
    }
  }
  return null;
}

router.put('/bulk-update', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { updates } = req.body;
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.json({ success: true, count: 0 });
  }
  const validationError = validateUpdates(updates);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const compiledRules = await loadCompiledAdminRules();
    const count = await db.withTransaction(async () => {
      let changed = 0;
      for (const item of updates) {
        const keys = Object.keys(item.data);
        const setStr = keys.map(k => `${k} = ?`).join(', ');
        const result = await db.runAsync(`UPDATE transactions SET ${setStr} WHERE id = ?`, [...Object.values(item.data), item.id]);
        changed += result.changes;

        if (result.changes > 0 && keys.some(k => FEE_INPUT_COLUMNS.includes(k))) {
          const row = await db.getAsync('SELECT jumlah, keterangan, tipe_sheet FROM transactions WHERE id = ?', [item.id]);
          await db.runAsync('UPDATE transactions SET admin_fee = ?, ref_code = ? WHERE id = ?',
            [computeAdminFee(row, compiledRules), extractReference(row.keterangan), item.id]);
        }
      }
      return changed;
    });

    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'BULK_UPDATE', JSON.stringify({ count })
    ]);
    if (count > 0) {
      broadcastDataChange({ eventType: 'UPDATE', count });
    }
    res.json({ success: true, count });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT' && /ref_code/.test(error.message)) {
      return res.status(409).json({ error: 'RRN/REF dengan jumlah yang sama sudah dipakai transaksi lain.' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
