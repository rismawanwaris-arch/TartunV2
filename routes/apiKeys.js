// Pengelolaan API key ingest (khusus Master).
const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateApiKey } = require('../utils/apiKeys');

const router = express.Router();
router.use(authenticateToken, requireRole('Master'));

const log = (req, action, details) => db.runAsync(
  'INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)',
  [req.user.email, req.user.role, action, JSON.stringify(details)]
);

router.get('/', async (req, res) => {
  try {
    const keys = await db.allAsync(
      'SELECT id, name, key_prefix, created_by, created_at, last_used_at, revoked_at FROM api_keys ORDER BY revoked_at IS NOT NULL, created_at DESC'
    );
    res.json({ success: true, data: keys });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (name.length < 3 || name.length > 60) {
    return res.status(400).json({ success: false, error: 'Nama key wajib 3-60 karakter' });
  }
  try {
    const { key, prefix, hash } = generateApiKey();
    const result = await db.runAsync(
      'INSERT INTO api_keys (name, key_prefix, key_hash, created_by) VALUES (?, ?, ?, ?)',
      [name, prefix, hash, req.user.email]
    );
    await log(req, 'API_KEY_CREATED', { id: result.lastID, name, prefix });
    // Key asli hanya dikirim sekali di sini; server tidak menyimpannya.
    res.status(201).json({ success: true, data: { id: result.lastID, name, key_prefix: prefix, key } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'ID tidak valid' });
  try {
    const result = await db.runAsync(
      'UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL', [id]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Key tidak ditemukan atau sudah dicabut' });
    await log(req, 'API_KEY_REVOKED', { id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
