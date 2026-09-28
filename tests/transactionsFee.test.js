// Integration test endpoint transaksi terhadap database sementara.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tartun-test-'));
process.env.TARTUN_DB_PATH = path.join(tmpDir, 'test.db');

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const transactionsRoutes = require('../routes/transactions');

let server, baseUrl, token;

test.before(async () => {
  await db.ready;
  const master = await db.getAsync(`SELECT id FROM users WHERE role = 'Master'`);
  token = jwt.sign({ id: master.id }, JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use('/api/transactions', transactionsRoutes);
  await new Promise(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/transactions`;
});

test.after(async () => {
  server.close();
  await new Promise(resolve => db.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const call = async (method, url, body) => {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
};
const feeOf = async id => (await db.getAsync('SELECT admin_fee FROM transactions WHERE id = ?', [id])).admin_fee;

test('POST /bulk menghitung admin_fee di server dan mengabaikan nilai dari klien', async () => {
  const res = await call('POST', '/bulk', { rows: [
    { tanggal: '2026-09-01T10:00:00.000Z', nama: 'OUTLET A', jumlah: 100000, keterangan: 'TARTUN QR', tipe_sheet: 'MANUAL', admin_fee: 999999 },
    { tanggal: '2026-09-01T11:00:00.000Z', nama: 'OUTLET A', jumlah: 150123, keterangan: 'TIKET DEPOSIT', tipe_sheet: 'TIKET' },
    { tanggal: '2026-09-01T12:00:00.000Z', nama: 'OUTLET B', jumlah: 50000, keterangan: 'LAINNYA', tipe_sheet: 'MANUAL' }
  ] });
  assert.equal(res.status, 200);

  const list = await call('GET', '/?limit=all');
  const byKet = Object.fromEntries(list.body.data.map(r => [r.keterangan, r.admin_fee]));
  assert.equal(byKet['TARTUN QR'], 3000);
  assert.equal(byKet['TIKET DEPOSIT'], 3000 + 123);
  assert.equal(byKet['LAINNYA'], 0);
});

test('PUT /bulk-update menghitung ulang admin_fee saat jumlah/keterangan berubah', async () => {
  const row = await db.getAsync(`SELECT id FROM transactions WHERE keterangan = 'TARTUN QR'`);
  const res = await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { jumlah: 600000 } }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 1);
  assert.equal(await feeOf(row.id), 10000);

  await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { keterangan: 'LAINNYA' } }] });
  assert.equal(await feeOf(row.id), 0);
});

test('PUT /bulk-update ganti nama tidak mengubah admin_fee', async () => {
  const row = await db.getAsync(`SELECT id, admin_fee FROM transactions WHERE keterangan = 'TIKET DEPOSIT'`);
  const res = await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { nama: 'OUTLET BARU' } }] });
  assert.equal(res.status, 200);
  assert.equal(await feeOf(row.id), row.admin_fee);
});

test('PUT /bulk-update menolak kolom di luar whitelist (SQL injection)', async () => {
  const row = await db.getAsync('SELECT id FROM transactions LIMIT 1');
  const bad = await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { 'admin_fee = 0, nama': 'x' } }] });
  assert.equal(bad.status, 400);
  const fee = await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { admin_fee: 1 } }] });
  assert.equal(fee.status, 400);
  const nan = await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { jumlah: 'abc' } }] });
  assert.equal(nan.status, 400);
  const oldShape = await call('PUT', '/bulk-update', { updates: [{ id: row.id, updateObject: { nama: 'x' } }] });
  assert.equal(oldShape.status, 400);
});

test('migrasi mengisi admin_fee baris lama yang masih NULL', async () => {
  await db.runAsync(`INSERT INTO transactions (tanggal, nama, jumlah, keterangan, tipe_sheet) VALUES ('2026-09-02', 'LAMA', 100000, 'TF', 'MANUAL')`);
  await db.migrateAdminFee();
  const row = await db.getAsync(`SELECT admin_fee FROM transactions WHERE nama = 'LAMA'`);
  assert.equal(row.admin_fee, 3000);
});

test('POST /check-duplicates: RRN sama di outlet lain terdeteksi, tanpa RRN tetap per outlet', async () => {
  await call('POST', '/bulk', { rows: [
    { tanggal: '2026-09-05T10:00:00.000Z', nama: 'PARENT JH2', jumlah: 150000, keterangan: 'TARTUN QR RRN:1sogncz96643 Menerima pembayaran dari DANA', tipe_sheet: 'MANUAL' },
    { tanggal: '2026-09-05T10:00:00.000Z', nama: 'PARENT JH2', jumlah: 80000, keterangan: 'TARTUN TF BRI 123', tipe_sheet: 'MANUAL' }
  ] });
  const stored = await db.getAsync(`SELECT ref_code FROM transactions WHERE jumlah = 150000 AND nama = 'PARENT JH2'`);
  assert.equal(stored.ref_code, '1SOGNCZ96643');

  const res = await call('POST', '/check-duplicates', { items: [
    { hash: 'a', tanggal: '2026-09-06T01:00:00.000Z', nama: 'PARENT LAIN', jumlah: 150000, keterangan: 'TARTUN QR RRN: 1sogncz96643 | 08.00 WIB' },
    { hash: 'b', tanggal: '2026-09-05T10:00:00.000Z', nama: 'PARENT LAIN', jumlah: 999, keterangan: 'TARTUN QR RRN:1sogncz96643 x' },
    { hash: 'c', tanggal: '2026-09-05T11:00:00.000Z', nama: 'PARENT JH2', jumlah: 80000, keterangan: 'TARTUN TF BRI 123' },
    { hash: 'd', tanggal: '2026-09-05T11:00:00.000Z', nama: 'PARENT LAIN', jumlah: 80000, keterangan: 'TARTUN TF BRI 123' }
  ] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.duplicates.sort(), ['a', 'c']);
  assert.equal(res.body.details.a.nama, 'PARENT JH2');
  assert.equal(res.body.details.a.ref, '1SOGNCZ96643');
});

test('PUT /bulk-update memperbarui ref_code saat keterangan berubah; migrasi mengisi ref_code', async () => {
  const row = await db.getAsync(`SELECT id FROM transactions WHERE jumlah = 80000 AND nama = 'PARENT JH2'`);
  await call('PUT', '/bulk-update', { updates: [{ id: row.id, data: { keterangan: 'TARTUN QR REF:NEWREF999 x' } }] });
  assert.equal((await db.getAsync('SELECT ref_code FROM transactions WHERE id = ?', [row.id])).ref_code, 'NEWREF999');

  await db.runAsync(`INSERT INTO transactions (tanggal, nama, jumlah, keterangan, tipe_sheet) VALUES ('2026-09-02', 'LAMA2', 1, 'TARTUN QR RRN:OLDREF123', 'MANUAL')`);
  await db.migrateRefCode();
  assert.equal((await db.getAsync(`SELECT ref_code FROM transactions WHERE nama = 'LAMA2'`)).ref_code, 'OLDREF123');
});
