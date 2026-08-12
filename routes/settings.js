const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Publik read-only settings (untuk widget & layout)
router.get('/', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT settings FROM app_settings WHERE id = 1');
    res.json(JSON.parse(row.settings));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/', authenticateToken, requireRole('Master'), async (req, res) => {
  const { settings } = req.body;
  try {
    await db.runAsync('UPDATE app_settings SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [JSON.stringify(settings)]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'SAVE_GLOBAL_SETTINGS', '{}'
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
