const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', filterType = '', startDate = '', endDate = '' } = req.query;
    const offset = (page - 1) * limit;

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

    const rows = await db.allAsync(
      `SELECT * FROM transactions ${whereStr} ORDER BY tanggal DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bulk', authenticateToken, requireRole('Master', 'Admin', 'OED'), (req, res) => {
  const { rows, batch_id } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No data provided' });
  }

  const trxBatchId = batch_id || crypto.randomUUID();

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare('INSERT INTO transactions (tanggal, nama, jumlah, keterangan, tipe_sheet, batch_id) VALUES (?, ?, ?, ?, ?, ?)');
    for (const row of rows) {
      stmt.run(row.tanggal, row.nama, row.jumlah, row.keterangan, row.tipe_sheet, trxBatchId);
    }
    stmt.finalize();

    db.run('COMMIT', (err) => {
      if (err) {
        db.run('ROLLBACK');
        db.run('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
          req.user.email, req.user.role, 'SUBMIT_DATA_FAIL', JSON.stringify({ error: err.message })
        ]);
        return res.status(500).json({ error: err.message });
      }

      db.run('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
        req.user.email, req.user.role, 'SUBMIT_DATA_SUCCESS', JSON.stringify({ batch_id: trxBatchId, count: rows.length })
      ]);

      res.json({ success: true, batch_id: trxBatchId, inserted: rows.length });
    });
  });
});

router.post('/check-duplicates', authenticateToken, requireRole('Master', 'Admin', 'OED'), async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.json({ duplicates: [] });
  }
  try {
    const dates = [...new Set(items.map(i => i.tanggal ? i.tanggal.split('T')[0] : ''))].filter(Boolean);
    if (dates.length === 0) {
      return res.json({ duplicates: [] });
    }

    const placeholders = dates.map(() => '?').join(',');
    const existing = await db.allAsync(
      `SELECT date(tanggal) as d, nama, jumlah, keterangan FROM transactions WHERE date(tanggal) IN (${placeholders})`,
      dates
    );

    const existingSet = new Set(
      existing.map(r => `${r.d}|${r.nama}|${Number(r.jumlah).toFixed(2)}|${r.keterangan || ''}`)
    );

    const duplicates = [];
    for (const item of items) {
      const datePart = item.tanggal ? item.tanggal.split('T')[0] : '';
      const key = `${datePart}|${item.nama}|${Number(item.jumlah).toFixed(2)}|${item.keterangan || ''}`;
      if (existingSet.has(key)) {
        duplicates.push(item.hash);
      }
    }
    res.json({ duplicates });
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
    res.json({ success: true, count: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/bulk-update', authenticateToken, requireRole('Master', 'Admin'), (req, res) => {
  const { updates } = req.body;
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.json({ success: true });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    for (const item of updates) {
      const keys = Object.keys(item.data);
      const values = Object.values(item.data);
      const setStr = keys.map(k => `${k} = ?`).join(', ');
      db.run(`UPDATE transactions SET ${setStr} WHERE id = ?`, [...values, item.id]);
    }
    db.run('COMMIT', (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: err.message });
      }
      db.run('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
        req.user.email, req.user.role, 'BULK_UPDATE', JSON.stringify({ count: updates.length })
      ]);
      res.json({ success: true });
    });
  });
});

module.exports = router;
