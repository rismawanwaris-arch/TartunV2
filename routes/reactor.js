const express = require('express');
const router = express.Router();
const { dataReactor, getReactorVersion } = require('../utils/reactor');
const db = require('../db');

// SSE stream: koneksi persistent untuk live update ke browser tanpa refresh
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Kirim event koneksi awal
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', version: getReactorVersion() })}\n\n`);

  const onChange = (data) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'DATA_CHANGE', ...data })}\n\n`);
    } catch (err) {
      // Koneksi mungkin ditutup oleh klien
    }
  };

  dataReactor.on('change', onChange);

  // Heartbeat ping setiap 25 detik agar koneksi tetap hidup melalui NAT/proxy
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(pingInterval);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    dataReactor.removeListener('change', onChange);
  });
});

// Endpoint status/version ringan untuk fallback polling
router.get('/version', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT COUNT(*) as count FROM transactions');
    res.json({
      version: getReactorVersion(),
      count: row ? row.count : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
