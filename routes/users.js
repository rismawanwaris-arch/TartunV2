const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/', authenticateToken, async (req, res) => {
  try {
    let sql = 'SELECT id, email, role, is_active, avatar_url, last_active_at, created_at FROM users';
    if (req.user.role === 'Admin') {
      sql += ' WHERE role != "Master"';
    }
    const users = await db.allAsync(sql);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { email, password, role } = req.body;
  if (req.user.role === 'Admin' && role === 'Master') {
    return res.status(403).json({ error: 'Admin cannot create Master' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.runAsync('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, role]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [req.user.email, req.user.role, 'CREATE_USER_SUCCESS', JSON.stringify({ target: email, role })]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/role', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (req.user.role === 'Admin' && role === 'Master') {
    return res.status(403).json({ error: 'Admin cannot assign Master role' });
  }
  try {
    const target = await db.getAsync('SELECT * FROM users WHERE id = ?', [id]);
    if (req.user.role === 'Admin' && target.role === 'Master') {
      return res.status(403).json({ error: 'Admin cannot edit Master' });
    }
    await db.runAsync('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/password', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const target = await db.getAsync('SELECT * FROM users WHERE id = ?', [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (req.user.role === 'Admin' && target.role === 'Master') {
      return res.status(403).json({ error: 'Admin cannot edit Master' });
    }
    const hash = await bcrypt.hash(password, 10);
    await db.runAsync('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'ADMIN_CHANGE_USER_PASSWORD', JSON.stringify({ target: target.email })
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/status', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    const target = await db.getAsync('SELECT * FROM users WHERE id = ?', [id]);
    if (req.user.role === 'Admin' && target.role === 'Master') {
      return res.status(403).json({ error: 'Admin cannot edit Master' });
    }
    await db.runAsync('UPDATE users SET is_active = ? WHERE id = ?', [is_active, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, requireRole('Master', 'Admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const target = await db.getAsync('SELECT * FROM users WHERE id = ?', [id]);
    if (!target) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'Admin' && target.role === 'Master') {
      return res.status(403).json({ error: 'Admin cannot delete Master' });
    }
    await db.runAsync('DELETE FROM users WHERE id = ?', [id]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [req.user.email, req.user.role, 'DELETE_USER_SUCCESS', JSON.stringify({ target: target.email })]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/me/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = '/uploads/avatars/' + req.file.filename;
  await db.runAsync('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.id]);
  res.json({ url });
});

router.put('/me/dashboard-config', authenticateToken, async (req, res) => {
  const { config } = req.body;
  await db.runAsync('UPDATE users SET dashboard_config = ? WHERE id = ?', [JSON.stringify(config), req.user.id]);
  res.json({ success: true });
});

router.put('/me/password', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.runAsync('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      req.user.email, req.user.role, 'CHANGE_OWN_PASSWORD_SUCCESS', '{}'
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/me/filter-presets', authenticateToken, async (req, res) => {
  const { presets } = req.body;
  try {
    await db.runAsync('UPDATE users SET filter_presets = ? WHERE id = ?', [JSON.stringify(presets), req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
