const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'data/tartun.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run('PRAGMA journal_mode = MEMORY;');
    db.run('PRAGMA synchronous = NORMAL;');
    db.run('PRAGMA cache_size = 10000;');
    db.run('PRAGMA temp_store = MEMORY;');
    db.run('PRAGMA busy_timeout = 5000;');

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'Auditor' CHECK(role IN ('Master','Admin','OED','Auditor')),
        is_active INTEGER DEFAULT 1,
        session_id TEXT,
        avatar_url TEXT,
        dashboard_config TEXT,
        filter_presets TEXT DEFAULT '[]',
        last_active_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tanggal DATETIME NOT NULL,
        nama TEXT NOT NULL,
        jumlah REAL NOT NULL,
        keterangan TEXT,
        tipe_sheet TEXT CHECK(tipe_sheet IN ('MANUAL','TIKET')),
        batch_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_tanggal ON transactions(tanggal DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_batch_id ON transactions(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_nama ON transactions(nama)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_tipe ON transactions(tipe_sheet)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_dup_lookup ON transactions(nama, jumlah, keterangan)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        actor TEXT,
        actor_role TEXT,
        action TEXT,
        details TEXT
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_actor ON logs(actor)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        settings TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.get(`SELECT count(*) as count FROM app_settings`, (err, row) => {
      if (!err && row.count === 0) {
        const defaultSettings = {
          backgroundUrl: "",
          nmidMapping: {
            "ID1026574479725": "ALFA 1 CELL",
            "ID1026574479691": "ALFA 2 CELL",
            "ID1026574479766": "ALFA 3 CELL",
            "ID1026574479709": "ALFA 4 CELL",
            "ID1026574479741": "ALFA 5 CELL",
            "ID1026574478578": "ALFA 6 CELL",
            "ID1026574478586": "ALFA 7 CELL",
            "ID1026574478594": "ASBER 1 CELL",
            "ID1026574478560": "ASBER 2 CELL",
            "ID1026575135805": "BAKSAR 1 CELL",
            "ID1026574492439": "BAKSAR 2 CELL",
            "ID1022223873046": "BANDAR KUOTA QR",
            "ID1026574478552": "BK 5 CIGER CELL",
            "ID1026575135789": "BK 6 PANGARITAN CELL",
            "ID1026575135821": "BK 7 NAGROG CELL",
            "ID1026574492447": "BK CIJAMBE CELL",
            "ID1026575060516": "BK CIPADUNG CELL",
            "ID1026574492462": "BK JH 2 CELL",
            "ID1026574492470": "BK SINOM CELL",
            "ID1026570614358": "BUNISARI CELL",
            "ID1026574492454": "CICUKANG CELL",
            "ID1026574480152": "CIHAURKUKU CELL",
            "ID1026575042621": "CIKADUT 2 CELL",
            "ID1026575042639": "CIKADUT CELL",
            "ID1026575042647": "CILENGKRANG 1 CELL",
            "ID1026575042654": "CILENGKRANG 2 CELL",
            "ID1026575042613": "CILENGKRANG 3 CELL",
            "ID1026575060524": "CILENGKRANG 4 CELL",
            "ID1026575060557": "CIPADUNG 2 CELL",
            "ID1026574487421": "CIPAGALO CELL",
            "ID1026575060532": "CIPOREAT CELL",
            "ID1026575060540": "CISARANTEN CELL",
            "ID1026574486258": "DM CELL",
            "ID1026574486274": "PADASUKA 1 CELL",
            "ID1026574486225": "PADASUKA 2 CELL",
            "ID1026574486241": "PADASUKA 3 CELL",
            "ID1026574486233": "PC 3 CELL",
            "ID1026574487462": "PC 4 CELL",
            "ID1026574487439": "PC 5 CELL",
            "ID1026574480095": "PERMATA CELL",
            "ID1022225940488": "POLICE CELL I QR",
            "ID1026574480137": "RAWA CELL",
            "ID1026574480145": "RK CELL",
            "ID1026574487454": "SA CELL",
            "ID1026574487447": "SS CELL"
          },
          publicDashboardLayout: [
            { id: "announcement", size: "full", label: "Pengumuman", visible: true },
            { id: "kpiMonthCommission", size: "small", label: "Total Komisi (Bulan Ini)", visible: true },
            { id: "kpiYesterdayTotal", size: "small", label: "Total Transaksi (Kemarin)", visible: true },
            { id: "kpiTodayTotal", size: "small", label: "Total Transaksi (Hari Ini)", visible: true },
            { id: "activeOutletsCount", size: "small", label: "Outlet Aktif (Bulan Ini)", visible: true },
            { id: "kpiYesterdayCount", size: "small", label: "Jumlah Transaksi (Kemarin)", visible: true },
            { id: "kpiTodayCount", size: "small", label: "Jumlah Transaksi (Hari Ini)", visible: true },
            { id: "progressCommission", size: "full", label: "Progress Target Komisi", visible: true },
            { id: "trendChart", size: "full", label: "Trend Biaya Admin (7 Hari)", visible: true },
            { id: "tableTopOutlets", size: "small", label: "Top 5 Outlet (Komisi Bulan Ini)", visible: true },
            { id: "chartTxType", size: "small", label: "Komposisi Tipe Transaksi (Bulan Ini)", visible: true },
            { id: "utilAdminCalculator", size: "small", label: "Kalkulator Biaya Admin", visible: true },
            { id: "globalCommissionSummary", size: "small", label: "Ringkasan Global (Bulan Ini)", visible: false },
            { id: "kpiMonthTopUser", size: "half", label: "Outlet Teraktif (Bulan Ini)", visible: false },
            { id: "tableRecentTx", size: "half", label: "5 Transaksi Terkini", visible: false }
          ],
          monthStartDay: 29,
          monthEndDay: 28,
          outletCommissionPercentage: 20,
          csCommissionPercentage: 10,
          targetCommission: 15000000,
          ticketFeeDestination: "adminFee",
          adminRules: [
            { keyword: "QR", amount: 203999, feeType: "flat", feeValue: 3000 },
            { keyword: "TF, EDC", amount: 203999, feeType: "flat", feeValue: 3000 },
            { keyword: "TIKET, Auto Deposit", amount: 203999, feeType: "flat", feeValue: 3000 },
            { keyword: "QR", amount: 505999, feeType: "flat", feeValue: 5000 },
            { keyword: "QR", amount: 1010999, feeType: "flat", feeValue: 10000 },
            { keyword: "QR", amount: 1515999, feeType: "flat", feeValue: 15000 },
            { keyword: "QR", amount: 2020999, feeType: "flat", feeValue: 20000 },
            { keyword: "QR", amount: 2525999, feeType: "flat", feeValue: 25000 },
            { keyword: "QR", amount: 3030999, feeType: "flat", feeValue: 30000 },
            { keyword: "QR", amount: 3535999, feeType: "flat", feeValue: 35000 },
            { keyword: "QR", amount: 4040999, feeType: "flat", feeValue: 40000 },
            { keyword: "QR", amount: 4545999, feeType: "flat", feeValue: 45000 },
            { keyword: "TF, EDC", amount: 5005999, feeType: "flat", feeValue: 5000 },
            { keyword: "TIKET, Auto Deposit", amount: 5005999, feeType: "flat", feeValue: 5000 },
            { keyword: "QR", amount: 5050999, feeType: "flat", feeValue: 50000 },
            { keyword: "QR", amount: 5555999, feeType: "flat", feeValue: 55000 },
            { keyword: "QR", amount: 6060999, feeType: "flat", feeValue: 60000 },
            { keyword: "QR", amount: 6565999, feeType: "flat", feeValue: 65000 },
            { keyword: "QR", amount: 7070999, feeType: "flat", feeValue: 70000 },
            { keyword: "QR", amount: 7575999, feeType: "flat", feeValue: 75000 },
            { keyword: "QR", amount: 8080999, feeType: "flat", feeValue: 80000 },
            { keyword: "QR", amount: 8585999, feeType: "flat", feeValue: 85000 },
            { keyword: "QR", amount: 9090999, feeType: "flat", feeValue: 90000 },
            { keyword: "QR", amount: 9595999, feeType: "flat", feeValue: 95000 },
            { keyword: "TF, EDC", amount: 10010999, feeType: "flat", feeValue: 10000 },
            { keyword: "TIKET, Auto Deposit", amount: 10010999, feeType: "flat", feeValue: 10000 },
            { keyword: "QR", amount: 10100999, feeType: "flat", feeValue: 100000 },
            { keyword: "TF, EDC", amount: 20020999, feeType: "flat", feeValue: 20000 },
            { keyword: "TIKET, Auto Deposit", amount: 20020999, feeType: "flat", feeValue: 20000 },
            { keyword: "TF, EDC", amount: 50025999, feeType: "flat", feeValue: 25000 },
            { keyword: "TIKET, Auto Deposit", amount: 50025999, feeType: "flat", feeValue: 25000 }
          ],
          nameConsolidation: {
  "PLC CK": "PARENT CIKADUT",
  "PLC DM": "PARENT DM",
  "PLC RK": "PARENT RK",
  "PLC SA": "PARENT SUKAASIH",
  "PLC SS": "PARENT SS",
  "PLC JH2": "PARENT JH2",
  "PLC PD1": "PARENT PD1",
  "PLC PD2": "PARENT PADASUKA 2",
  "PLC PD3": "PARENT PD3",
  "PLC CISA": "PARENT CISAR",
  "PLC CPD1": "PARENT CIPADUNG",
  "PLC CPD2": "PARENT CIPADUNG2",
  "PLC CIGER": "PARENT CIGER",
  "PLC SINOM": "PARENT BK SINOM",
  "PLC ASBER1": "PARENT ASBER 1",
  "PLC ASBER2": "PARENT ASBER 2",
  "PLC CUKANG": "PARENT CICUKANG",
  "PLC PC3 CJM": "PARENT CJM PC3",
  "PLC BUNISARI": "PARENT BUNISARI",
  "PLC PC4 OJEG": "PARENT OJEG PC4",
  "PLC BK PORTAL": "PARENT PORTAL CJM",
  "PLC CIKADUT 2": "PARENT CIKADUT 2",
  "PLC BK8 BAKSAR": "PARENT BK8 BAKSAR",
  "PLC BK9 BAKSAR": "PARENT BK9 BAKSAR",
  "PLC PANGARITAN": "PARENT PANGARITAN",
  "PLC BK7 NAGROG2": "PARENT NAGROG2 BK7",
  "PLC ALFA2 SINJAY2": "PARENT SINJAY2 ALFA 2",
  "PLC ALFA3 SINJAY1": "PARENT SINJAY1 ALFA 3",
  "PLC ALFA4 PARAKAN": "PARENT PARAKANSAAT ALFA4",
  "PLC ALFA5 NAGROG1": "PARENT NAGROG1 ALFA 5",
  "PLC CILENGKRANG 1": "PARENT CILENGKRANG 1",
  "PLC CIPAGALO CELL": "PARENT CIPAGALO",
  "PLC PC5 CIGENDING": "PARENT CIGENDING PC5",
  "PLC ALFA6 CINANGKA": "PARENT CINANGKA ALFA 6",
  "PLC ALFA7 CINGISED": "PARENT ALFA7 CINGISED",
  "PLC ALFA1 PASIR IMPUN": "PARENT PASIRIMPUN ALFA1"
},
          routingKeywords: {
            tiket: ["tiket deposit", "Auto Deposit"],
            manual: ["tar", "tartun", "tf", "qr", "EDC"]
          },
          exceptionKeywords: ["ADM TARTUN", "ADMIN TARTUN", "BAYAR", "SETOR", "Keterangan"],
          auditRules: [
            { keyword1: "REV TARTUN QR", keyword2: "TARTUN QR" },
            { keyword1: "REVISI TARTUN TF", keyword2: "TARTUN TF" }
          ]
        };
        db.run(`INSERT INTO app_settings (id, settings) VALUES (1, ?)`, [JSON.stringify(defaultSettings)]);
      }
    });

    const masterEmail = 'firz411@gmail.com';
    db.get(`SELECT id FROM users WHERE email = ?`, [masterEmail], (err, row) => {
      if (!err && !row) {
        const hash = bcrypt.hashSync('FkOf2025', 10);
        db.run(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Master')`, [masterEmail, hash]);
      }
    });
  });
}

db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

module.exports = db;
