// Membandingkan rumus server (utils/adminFee.js) dengan rumus frontend asli
// (public/js/utils.js) pada seluruh transaksi di database. Juga memverifikasi
// kolom admin_fee yang tersimpan bila sudah ada. Keluar dengan kode 1 bila ada selisih.
//   node scripts/verify-admin-fee-parity.js [path/ke/tartun.db]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sqlite3 = require('sqlite3');
const { compileAdminRules, computeAdminFee } = require('../utils/adminFee');

const dbPath = path.resolve(process.argv[2] || path.join(__dirname, '../data/tartun.db'));
const src = fs.readFileSync(path.join(__dirname, '../public/js/utils.js'), 'utf8');
const ctx = vm.createContext({ Intl, WeakMap, Map, Math, String, Number, parseFloat, parseInt, console });
vm.runInContext(`${src}\nthis.AppUtils = AppUtils;`, ctx);
const frontendFee = (row, settings) => ctx.AppUtils.calculateAdminFee.call(ctx.AppUtils, { ...row, admin_fee: undefined }, settings);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
db.get('SELECT settings FROM app_settings WHERE id = 1', (err, s) => {
  if (err) throw err;
  const settings = JSON.parse(s.settings);
  const compiled = compileAdminRules(settings.adminRules);
  db.all('PRAGMA table_info(transactions)', (err2, cols) => {
    if (err2) throw err2;
    const hasCol = cols.some(c => c.name === 'admin_fee');
    const sql = `SELECT id, jumlah, keterangan, tipe_sheet${hasCol ? ', admin_fee' : ''} FROM transactions`;
    db.all(sql, (err3, rows) => {
      if (err3) throw err3;
      let formulaDiff = 0, storedDiff = 0, storedNull = 0, total = 0;
      for (const row of rows) {
        total += frontendFee(row, settings);
        const server = computeAdminFee(row, compiled);
        const front = frontendFee(row, settings);
        if (server !== front) { formulaDiff++; if (formulaDiff <= 5) console.log('FORMULA DIFF', row.id, server, front); }
        if (hasCol) {
          if (row.admin_fee === null) storedNull++;
          else if (row.admin_fee !== front) { storedDiff++; if (storedDiff <= 5) console.log('STORED DIFF', row.id, row.admin_fee, front); }
        }
      }
      console.log(JSON.stringify({ rows: rows.length, totalFeeFrontend: total, formulaDiff, hasColumn: hasCol, storedDiff, storedNull }));
      db.close();
      process.exit(formulaDiff || storedDiff || storedNull ? 1 : 0);
    });
  });
});
