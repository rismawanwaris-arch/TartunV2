const express = require('express');
const router = express.Router();
const db = require('../db');
const { aggregateByOutlet, calculateAdminFee } = require('../utils/adminCalc2');

router.get('/kpi', async (req, res) => {
  try {
    const settingsRow = await db.getAsync('SELECT settings FROM app_settings WHERE id = 1');
    const settings = JSON.parse(settingsRow.settings);

    // Gunakan transaksi bulan ini (dari awal bulan)
    const monthData = await db.allAsync(`SELECT * FROM transactions WHERE tanggal >= date('now', 'start of month', 'localtime')`);
    
    // Transaksi kemarin
    const yesterdayData = await db.allAsync(`SELECT * FROM transactions WHERE date(tanggal) = date('now', '-1 day', 'localtime')`);
    
    // Transaksi hari ini
    const todayData = await db.allAsync(`SELECT * FROM transactions WHERE date(tanggal) = date('now', 'localtime')`);

    const monthAgg = aggregateByOutlet(monthData, settings);
    const totalKomisiOutlet = monthAgg.reduce((sum, o) => sum + o.komisi_outlet, 0);
    const outletAktif = monthAgg.length;
    
    const countManual = monthData.filter(x => x.tipe_sheet === 'MANUAL').length;
    const countTiket = monthData.filter(x => x.tipe_sheet === 'TIKET').length;
    
    // Total admin kemarin & hari ini
    let yesterdayAdmin = 0;
    yesterdayData.forEach(row => { yesterdayAdmin += calculateAdminFee(row, settings.adminRules).fee; });
    
    let todayAdmin = 0;
    todayData.forEach(row => { todayAdmin += calculateAdminFee(row, settings.adminRules).fee; });

    // Trend Biaya Admin 7 hari terakhir (1 single fast query)
    const sevenDaysData = await db.allAsync(`SELECT * FROM transactions WHERE tanggal >= date('now', '-7 day', 'localtime')`);
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = sevenDaysData.filter(r => (r.tanggal || '').startsWith(dateStr));
      let feeSum = 0;
      dayData.forEach(r => { feeSum += calculateAdminFee(r, settings.adminRules).fee; });
      
      const label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      trendData.push({ label, value: feeSum });
    }

    res.json({
      komisiBulanIni: totalKomisiOutlet,
      adminKemarin: yesterdayAdmin,
      adminHariIni: todayAdmin,
      outletAktif: outletAktif,
      txKemarin: yesterdayData.length,
      txHariIni: todayData.length,
      targetKomisi: parseFloat(settings.targetCommission) || 25000000,
      trend: trendData,
      komposisi: { manual: countManual, tiket: countTiket },
      topOutlets: monthAgg.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
