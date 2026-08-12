const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Email atau password salah' });
    if (!user.is_active) return res.status(403).json({ error: 'Akun nonaktif' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Email atau password salah' });

    const sessionId = uuidv4();
    await db.runAsync('UPDATE users SET session_id = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [sessionId, user.id]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [user.email, user.role, 'LOGIN_SUCCESS', JSON.stringify({ ip: req.ip })]);

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      session_id: sessionId,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        dashboard_config: user.dashboard_config ? JSON.parse(user.dashboard_config) : null,
        filter_presets: user.filter_presets ? JSON.parse(user.filter_presets) : []
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    avatar_url: req.user.avatar_url,
    session_id: req.user.session_id,
    dashboard_config: req.user.dashboard_config ? JSON.parse(req.user.dashboard_config) : null,
    filter_presets: req.user.filter_presets ? JSON.parse(req.user.filter_presets) : []
  });
});

router.post('/check-session', authenticateToken, (req, res) => {
  const { session_id } = req.body;
  if (req.user.session_id !== session_id) {
    return res.status(401).json({ session_invalid: true });
  }
  db.run('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id]);
  res.json({ session_invalid: false });
});

router.post('/logout', authenticateToken, async (req, res) => {
  await db.runAsync('UPDATE users SET session_id = NULL WHERE id = ?', [req.user.id]);
  await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [req.user.email, req.user.role, 'LOGOUT', '{}']);
  res.json({ success: true });
});

module.exports = router;
