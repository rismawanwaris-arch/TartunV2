const db = require('../db');
const { findActiveKey } = require('../utils/apiKeys');

// Autentikasi mesin-ke-mesin lewat header `X-API-Key`. Key hanya berlaku untuk
// route yang memakai middleware ini (ingest), tidak untuk API lain.
async function authenticateApiKey(req, res, next) {
  try {
    const apiKey = await findActiveKey(db, req.get('X-API-Key'));
    if (!apiKey) {
      return res.status(401).json({ success: false, error: 'API key tidak valid atau sudah dicabut' });
    }
    req.apiKey = apiKey;
    db.runAsync('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [apiKey.id])
      .catch(err => console.error('Gagal memperbarui last_used_at API key:', err.message));
    next();
  } catch (err) {
    console.error('Autentikasi API key gagal:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

module.exports = { authenticateApiKey };
