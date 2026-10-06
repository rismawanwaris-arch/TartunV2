const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  const actor = req.query.actor;
  const type = req.query.type; // 'user', 'api', or 'all'
  try {
    let query = 'SELECT * FROM logs';
    const params = [];
    const where = [];

    if (actor) {
      where.push('actor = ?');
      params.push(actor);
    }

    if (type === 'api') {
      where.push("(actor_role = 'API' OR action LIKE 'API_%' OR actor LIKE 'api:%')");
    } else if (type === 'user') {
      where.push("(actor_role != 'API' AND action NOT LIKE 'API_%' AND actor NOT LIKE 'api:%')");
    }

    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const logs = await db.allAsync(query, params);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const type = req.query.type; // 'user', 'api', or 'all'
  try {
    let query = 'SELECT * FROM logs WHERE action NOT LIKE "LOGIN%"';
    const params = [];

    if (type === 'api') {
      query += " AND (actor_role = 'API' OR action LIKE 'API_%' OR actor LIKE 'api:%')";
    } else if (type === 'user') {
      query += " AND (actor_role != 'API' AND action NOT LIKE 'API_%' AND actor NOT LIKE 'api:%')";
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const logs = await db.allAsync(query, params);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
