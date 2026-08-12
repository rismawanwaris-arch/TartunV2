const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  const actor = req.query.actor;
  try {
    let logs;
    if (actor) {
      logs = await db.allAsync('SELECT * FROM logs WHERE actor = ? ORDER BY created_at DESC LIMIT ?', [actor, limit]);
    } else {
      logs = await db.allAsync('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?', [limit]);
    }
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 3;
  try {
    // Publik logs (exclude login)
    const logs = await db.allAsync('SELECT * FROM logs WHERE action NOT LIKE "LOGIN%" ORDER BY created_at DESC LIMIT ?', [limit]);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
