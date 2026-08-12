const express = require('express');
const router = express.Router();
const db = require('../db');
const { aggregateByOutlet, calculateAdminFee } = require('../utils/adminCalc2');

router.get('/', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    let whereClause = '';
    let params = [];
    if (start && end) {
      whereClause = 'WHERE tanggal >= ? AND tanggal <= ?';
      params = [start, end];
    } else {
      whereClause = 'WHERE tanggal >= date("now", "start of month")';
    }

    const data = await db.allAsync(`SELECT nama, jumlah, keterangan, tipe_sheet FROM transactions ${whereClause}`, params);
    
    const settingsRow = await db.getAsync('SELECT settings FROM app_settings WHERE id = 1');
    const settings = JSON.parse(settingsRow.settings);

    const aggregated = aggregateByOutlet(data, settings);
    
    let manualFee = 0, manualTx = 0;
    let tiketFee = 0, tiketTx = 0;
    
    data.forEach(row => {
      const { fee, tiketUnik } = calculateAdminFee(row, settings.adminRules);
      if (row.tipe_sheet === 'TIKET') {
        tiketFee += fee; // fee already includes tiketUnik
        tiketTx++;
      } else {
        manualFee += fee;
        manualTx++;
      }
    });

    const totalDbRes = await db.getAsync('SELECT COUNT(*) as c FROM transactions');

    res.json({
      summary: aggregated,
      stats: {
        manualFee, manualTx,
        tiketFee, tiketTx,
        totalTx: data.length,
        totalDb: totalDbRes.c
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
