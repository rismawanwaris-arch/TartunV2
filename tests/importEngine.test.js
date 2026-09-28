const test = require('node:test');
const assert = require('node:assert/strict');
const AppImport = require('../public/js/importEngine');

const settings = {
  nameConsolidation: { 'ID001': 'PARENT SATU', 'ALFA 2 CELL': 'PARENT DUA', 'PLC  X': 'TIDAK TERPAKAI', 'PLC X': 'PARENT X' },
  nmidMapping: { ID003: 'ALFA 2 CELL' },
  routingKeywords: { tiket: ['tiket deposit'], manual: ['tartun', 'qr'] },
  exceptionKeywords: ['BAYAR', 'ADM TARTUN']
};
const helpers = { parseDateAuto: s => { const t = Date.parse(s); return isNaN(t) ? null : new Date(t); } };
const P = Object.fromEntries(AppImport.DEFAULT_PROFILES.map(p => [p.id, p]));
const parse = (profile, rows, name = '') => AppImport.parseTables([{ name, rows }], profile, settings, helpers);

test('kata pengecualian dicocokkan sebagai kata/frasa utuh', () => {
  assert.equal(AppImport.matchesKeyword('Menerima pembayaran dari DANA', ['BAYAR']), false);
  assert.equal(AppImport.matchesKeyword('BAYAR listrik', ['bayar']), true);
  assert.equal(AppImport.matchesKeyword('x adm  tartun y', ['ADM TARTUN']), true);
  assert.equal(AppImport.matchesKeyword('anything', ['', '  ']), false);
});

test('parseDelimited: tanda kutip, BOM, CRLF, pemisah tab', () => {
  assert.deepEqual(AppImport.parseDelimited('﻿a;"b;c";"d ""e"""\r\n1;2;3\r\n', ';'), [['a', 'b;c', 'd "e"'], ['1', '2', '3']]);
  assert.deepEqual(AppImport.parseDelimited('a\tb', '\\t'), [['a', 'b']]);
  assert.deepEqual(AppImport.parseDelimited('a"b;c', ';'), [['a"b', 'c']]);
});

test('template: placeholder dan alternatif', () => {
  const t = 'X:{ref} Bayar [dari {metode} a.n. {pembayar}|dari {metode}|dari {pembayar}|QRIS]';
  assert.equal(AppImport.renderTemplate(t, { ref: '1', metode: 'DANA', pembayar: 'A' }), 'X:1 Bayar dari DANA a.n. A');
  assert.equal(AppImport.renderTemplate(t, { ref: '1', metode: 'DANA' }), 'X:1 Bayar dari DANA');
  assert.equal(AppImport.renderTemplate(t, { ref: '1', pembayar: 'A' }), 'X:1 Bayar dari A');
  assert.equal(AppImport.renderTemplate(t, {}), 'X: Bayar QRIS');
});

test('Excel BCA: header dicari, subtotal & jumlah 0 dilewati, sheet tanpa header dilewati', () => {
  const rows = [
    ['Transaction Report by Merchant BCA'],
    ['Merchant Name', 'National Merchant ID', 'Original Amount', 'Transaction Date', 'Transaction Time', 'Reference Number', 'Payer Name', 'Payment Method', 'Payment Type'],
    ['ALFA 2 CELL', 'ID002', '88,000.00', '09/09/2026', '07:05 WIB', 'R1', 'AL**', 'QR', 'DANA'],
    ['X CELL', 'ID001', '10000.00', '09/09/2026', '08:00', 'R2', '', 'QR', ''],
    ['Subtotal', '', '98000', '', '', '', '', '', ''],
    ['Y CELL', 'ID009', '0.00', '09/09/2026', '08:00', 'R3', '', 'QR', 'DANA'],
    ['', '', '', '', '', '** Subtotal note', '', '', '']
  ];
  const r = AppImport.parseTables([{ name: 's1', rows }, { name: 'kosong', rows: [['abc']] }], P.bca_merchant_xlsx, settings, helpers);
  assert.equal(r.tablesRead, 1);
  assert.equal(r.tablesSkipped, 1);
  assert.equal(r.items.length, 2);
  const [a, b] = r.items.map(i => i.data);
  assert.equal(a.nama, 'PARENT DUA');
  assert.equal(a.jumlah, 88000);
  assert.equal(a.keterangan, 'TARTUN QR RRN:R1 Menerima pembayaran dari DANA a.n. AL**');
  assert.equal(new Date(a.tanggal).getHours(), 7);
  assert.equal(new Date(a.tanggal).getMinutes(), 5);
  assert.equal(b.nama, 'PARENT SATU');
  assert.equal(b.keterangan, 'TARTUN QR RRN:R2 Menerima pembayaran QRIS');
});

test('Settlement QRIS: hanya status success, referensi cadangan, NMID dipetakan', () => {
  const rows = [
    ['Transaction ID', 'Outlet Code', 'Outlet Name', 'Reference', 'Amount (Rp)', 'Status', 'Payment Method', 'Customer', 'Transaction Date'],
    ['T1', 'ID003', 'NAMA LAIN', '', '300000', 'success', 'GOPAY', '**PAY', '2026-09-27T19:59:00'],
    ['T2', 'ID003', 'NAMA LAIN', 'R2', '1000', 'failed', 'GOPAY', '', '2026-09-27T19:59:00'],
    ['T3', 'IDXXX', 'OUTLET BARU', 'R3', 'abc', 'success', '', '', '2026-09-27T19:59:00']
  ];
  const r = parse(P.qris_settlement_csv, rows);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].data.nama, 'PARENT DUA');
  assert.equal(r.items[0].data.keterangan, 'TARTUN QR REF:T1 Menerima pembayaran dari GOPAY a.n. **PAY');
});

test('CSV template: header opsional, routing, error terlihat', () => {
  const rows = [
    ['Tanggal', 'Nama', 'Jumlah', 'Keterangan'],
    ['2026-09-27', 'PLC  X', '1.500.000', 'TARTUN QR Menerima pembayaran'],
    ['2026-09-27', 'B', '50.000', 'TIKET DEPOSIT 1'],
    ['bukan tanggal', 'C', '1', 'QR'],
    ['2026-09-27', 'D', 'x', 'QR'],
    ['2026-09-27', 'E', '1', 'LAINNYA']
  ];
  const r = parse(P.template_csv, rows);
  assert.deepEqual(r.items.map(i => i.status), ['valid', 'valid', 'error', 'error', 'error']);
  assert.deepEqual(r.items.slice(2).map(i => i.errorReason), ['Format tanggal tidak dikenali', 'Format jumlah salah', 'Tidak ada routing cocok']);
  assert.equal(r.items[0].data.jumlah, 1500000);
  assert.equal(r.items[1].data.tipe_sheet, 'TIKET');
  const tanpaHeader = parse(P.template_csv, rows.slice(1));
  assert.equal(tanpaHeader.items.length, 5);
});

test('kolom wajib tidak ditemukan -> satu baris error, bukan hilang diam-diam', () => {
  const r = parse(P.qris_settlement_csv, [['Outlet Code', 'Amount (Rp)', 'Status']], 'f.csv');
  assert.equal(r.items.length, 1);
  assert.match(r.items[0].errorReason, /Tanggal/);
});

test('finalizeItems: pengecualian, konsolidasi nama, duplikat input, tanpa mutasi', () => {
  const items = [
    { status: 'valid', data: { tanggal: '2026-09-27T01:00:00.000Z', nama: 'PLC  X', jumlah: 1, keterangan: 'TARTUN QR Menerima pembayaran', tipe_sheet: 'MANUAL' } },
    { status: 'valid', data: { tanggal: '2026-09-27T05:00:00.000Z', nama: 'PLC X', jumlah: 1, keterangan: 'TARTUN QR Menerima pembayaran', tipe_sheet: 'MANUAL' } },
    { status: 'valid', data: { tanggal: '2026-09-27T05:00:00.000Z', nama: 'A', jumlah: 1, keterangan: 'ADM TARTUN bulan ini', tipe_sheet: 'MANUAL' } },
    { status: 'error', errorReason: 'x', data: {} }
  ];
  const snapshot = JSON.stringify(items);
  const { items: out, skippedByException } = AppImport.finalizeItems(items, settings);
  assert.equal(skippedByException, 1);
  assert.deepEqual(out.map(i => i.status), ['valid', 'duplicate_input', 'error']);
  assert.equal(out[0].data.nama, 'PARENT X');
  assert.equal(out[0].data.hash, '2026-09-27|PARENT X|1|TARTUN QR Menerima pembayaran');
  assert.deepEqual(out.map(i => i.originalIndex), [0, 1, 2]);
  assert.equal(JSON.stringify(items), snapshot);
});

test('deteksi otomatis & validasi profil', () => {
  const settlement = [['Outlet Code', 'Outlet Name', 'Amount (Rp)', 'Status', 'Transaction Date']];
  const template = [['Tanggal', 'Nama', 'Jumlah', 'Keterangan']];
  const detect = rows => AppImport.detectProfile(AppImport.DEFAULT_PROFILES, 'csv', () => [{ rows }])?.id;
  assert.equal(detect(settlement), 'qris_settlement_csv');
  assert.equal(detect(template), 'template_csv');
  assert.equal(detect([['apa', 'ini']]), undefined);
  AppImport.DEFAULT_PROFILES.forEach(p => assert.deepEqual(AppImport.validateProfile(p), []));
  assert.ok(AppImport.validateProfile({ ...P.template_csv, name: '', columns: {} }).length >= 4);
});

test('getProfiles memakai bawaan bila settings kosong', () => {
  assert.equal(AppImport.getProfiles({}).length, 3);
  assert.equal(AppImport.getProfiles({ importProfiles: [P.template_csv] }).length, 1);
});
