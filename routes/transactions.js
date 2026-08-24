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

router.post('/bulk', authenticateToken, requireRole('Master', 'Admin', 'OED'), async (req, res) => {
  const { rows, batch_id } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No data provided' });
  }

  const trxBatchId = batch_id || crypto.randomUUID();

  try {
    const stmt = await db.runAsync('BEGIN TRANSACTION');
    for (const row of rows) {
      await db.runAsync(
        'INSERT INTO transactions (tanggal, nama, jumlah, keterangan, tipe_sheet, batch_id) VALUES (?, ?, ?, ?, ?, ?)',
        [row.tanggal, row.nama, row.jumlah, row.keterangan, row.tipe_sheet, trxBatchId]
      );
    }
    await db.runAsync('COMMIT');

    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'SUBMIT_DATA_SUCCESS', JSON.stringify({ batch_id: trxBatchId, count: rows.length })
    ]);

    res.json({ success: true, batch_id: trxBatchId, inserted: rows.length });
  } catch (error) {
    await db.runAsync('ROLLBACK');
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'SUBMIT_DATA_FAIL', JSON.stringify({ error: error.message })
    ]);
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-duplicates', authenticateToken, requireRole('Master', 'Admin', 'OED'), async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid items array' });
  }
  try {
    const duplicates = [];
    for (const item of items) {
      const datePart = item.tanggal.split('T')[0];
      const match = await db.getAsync(
        'SELECT id FROM transactions WHERE date(tanggal) = ? AND nama = ? AND jumlah = ? AND keterangan = ? LIMIT 1',
        [datePart, item.nama, item.jumlah, item.keterangan]
      );
      if (match) {
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
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Invalid ids array' });
  }
  try {
    await db.runAsync('BEGIN TRANSACTION');
    for (const id of ids) {
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    }
    await db.runAsync('COMMIT');
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'DELETE_SELECTED', JSON.stringify({ count: ids.length })
    ]);
    res.json({ success: true, count: ids.length });
  } catch (error) {
    await db.runAsync('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

router.put('/bulk-update', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { updates } = req.body; // [{id, data: {nama, jumlah...}}]
  try {
    await db.runAsync('BEGIN TRANSACTION');
    for (const item of updates) {
      const keys = Object.keys(item.data);
      const values = Object.values(item.data);
      const setStr = keys.map(k => `${k} = ?`).join(', ');
      await db.runAsync(`UPDATE transactions SET ${setStr} WHERE id = ?`, [...values, item.id]);
    }
    await db.runAsync('COMMIT');
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'BULK_UPDATE', JSON.stringify({ count: updates.length })
    ]);
    res.json({ success: true });
  } catch (error) {
    await db.runAsync('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
