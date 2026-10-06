// API ingest untuk sistem lain (payment gateway, skrip, aplikasi) yang
// mengirim transaksi QR. Autentikasi dengan header X-API-Key.
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authenticateApiKey } = require('../middleware/apiKey');
const { MAX_BATCH_SIZE, ingestTransactions } = require('../utils/qrIngest');
const { broadcastDataChange } = require('../utils/reactor');

const router = express.Router();

const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Terlalu banyak request, coba lagi sebentar' }
});

router.post('/qr', ingestLimiter, authenticateApiKey, async (req, res) => {
  const items = req.body && req.body.transactions;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Body wajib berisi "transactions": [ ... ] minimal 1 item' });
  }
  if (items.length > MAX_BATCH_SIZE) {
    return res.status(413).json({ success: false, error: `Maksimal ${MAX_BATCH_SIZE} transaksi per request` });
  }

  const batchId = `api-${crypto.randomUUID()}`;
  try {
    const data = await ingestTransactions(db, items, { batchId });
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      `api:${req.apiKey.name}`, 'API', 'API_INGEST',
      JSON.stringify({ batch_id: batchId, received: data.received, inserted: data.inserted, duplicates: data.duplicates, rejected: data.rejected })
    ]);
    if (data.inserted > 0) {
      broadcastDataChange({ eventType: 'INSERT', count: data.inserted, batch_id: batchId, source: 'API' });
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('API ingest gagal:', error);
    await db.runAsync('INSERT INTO logs (actor, actor_role, action, details) VALUES (?, ?, ?, ?)', [
      `api:${req.apiKey.name}`, 'API', 'API_INGEST_FAIL', JSON.stringify({ batch_id: batchId, error: error.message })
    ]).catch(() => {});
    res.status(500).json({ success: false, error: 'Gagal menyimpan transaksi. Tidak ada data yang tersimpan; aman untuk dikirim ulang.' });
  }
});

module.exports = router;
