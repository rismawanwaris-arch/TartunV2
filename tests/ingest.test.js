// Integration test API ingest (POST /api/v1/ingest/qr) & pengelolaan API key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tartun-ingest-'));
process.env.TARTUN_DB_PATH = path.join(tmpDir, 'test.db');

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

let server, base, masterToken, adminToken, apiKey;

test.before(async () => {
  await db.ready;
  const master = await db.getAsync(`SELECT id FROM users WHERE role = 'Master'`);
  masterToken = jwt.sign({ id: master.id }, JWT_SECRET);
  const admin = await db.runAsync(`INSERT INTO users (email, password_hash, role) VALUES ('admin@test', 'x', 'Admin')`);
  adminToken = jwt.sign({ id: admin.lastID }, JWT_SECRET);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/ingest', require('../routes/ingest'));
  app.use('/api/api-keys', require('../routes/apiKeys'));
  app.use('/api/logs', require('../routes/logs'));
  app.use('/api/reactor', require('../routes/reactor'));
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  server.close();
  await new Promise(resolve => db.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const req = async (method, url, { body, token, key } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['X-API-Key'] = key;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const ingest = (transactions, key = apiKey) => req('POST', '/v1/ingest/qr', { key, body: { transactions } });
const trx = over => ({
  ref: '1sodncj75027', outlet_code: 'ID1026575135789', outlet_name: 'BK 6 PANGARITAN CELL',
  amount: 300000, paid_at: '2026-09-27T19:59:00+07:00', method: 'GOPAY', payer: '**PAY', status: 'success', ...over
});

test('pengelolaan key: hanya Master, key ditampilkan sekali, tidak bisa dibaca ulang', async () => {
  assert.equal((await req('POST', '/api-keys', { token: adminToken, body: { name: 'Gateway' } })).status, 403);
  assert.equal((await req('POST', '/api-keys', { token: masterToken, body: { name: 'x' } })).status, 400);

  const created = await req('POST', '/api-keys', { token: masterToken, body: { name: 'Gateway Uji' } });
  assert.equal(created.status, 201);
  apiKey = created.body.data.key;
  assert.match(apiKey, /^tk_[A-Za-z0-9_-]{43}$/);

  const list = await req('GET', '/api-keys', { token: masterToken });
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].name, 'Gateway Uji');
  assert.ok(!JSON.stringify(list.body).includes(apiKey));
  const stored = await db.getAsync('SELECT key_hash FROM api_keys');
  assert.notEqual(stored.key_hash, apiKey);
});

test('tanpa key / key salah ditolak 401', async () => {
  assert.equal((await ingest([trx()], null)).status, 401);
  assert.equal((await ingest([trx()], apiKey.slice(0, -1) + (apiKey.endsWith('A') ? 'B' : 'A'))).status, 401);
  assert.equal((await req('POST', '/v1/ingest/qr', { token: masterToken, body: { transactions: [trx()] } })).status, 401);
});

test('transaksi valid tersimpan dengan nama, keterangan, biaya admin & ref_code', async () => {
  const res = await ingest([trx()]);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.inserted, 1);
  const row = await db.getAsync(`SELECT * FROM transactions WHERE ref_code = '1SODNCJ75027'`);
  assert.equal(row.nama, 'PARENT PANGARITAN');
  assert.equal(row.keterangan, 'TARTUN QR REF:1sodncj75027 Menerima pembayaran dari GOPAY a.n. **PAY');
  assert.equal(row.tanggal, '2026-09-27T12:59:00.000Z');
  assert.equal(row.admin_fee, 5000);
  assert.equal(row.tipe_sheet, 'MANUAL');
  assert.match(row.batch_id, /^api-/);
  const log = await db.getAsync(`SELECT actor, action FROM logs WHERE action = 'API_INGEST'`);
  assert.equal(log.actor, 'api:Gateway Uji');
});

test('kirim ulang aman: duplikat terdeteksi, termasuk lintas outlet & di dalam request', async () => {
  const res = await ingest([
    trx(),
    trx({ outlet_code: 'ID1026574479709', outlet_name: 'ALFA 4 CELL' }),
    trx({ ref: 'BARU000001', amount: 50000 }),
    trx({ ref: 'baru000001', amount: 50000 })
  ]);
  const statuses = res.body.data.results.map(r => r.status);
  assert.deepEqual(statuses, ['duplicate', 'duplicate', 'inserted', 'duplicate']);
  assert.equal(res.body.data.results[1].existing.nama, 'PARENT PANGARITAN');
  assert.match(res.body.data.results[3].reason, /index 2/);
  const count = await db.getAsync(`SELECT COUNT(*) c FROM transactions WHERE ref_code IN ('1SODNCJ75027', 'BARU000001')`);
  assert.equal(count.c, 2);
});

test('request paralel dengan RRN sama hanya menyimpan satu', async () => {
  const results = await Promise.all([1, 2, 3, 4].map(() => ingest([trx({ ref: 'PARALEL0001', amount: 12000 })])));
  assert.equal(results.reduce((s, r) => s + r.body.data.inserted, 0), 1);
  const count = await db.getAsync(`SELECT COUNT(*) c FROM transactions WHERE ref_code = 'PARALEL0001'`);
  assert.equal(count.c, 1);
});

test('validasi per item: item salah ditolak, item benar tetap masuk', async () => {
  const res = await ingest([
    trx({ ref: '12' }),
    trx({ ref: 'VALID00001', amount: -5 }),
    trx({ ref: 'VALID00002', paid_at: '27/09/2026' }),
    trx({ ref: 'VALID00003', outlet_code: '', outlet_name: '' }),
    trx({ ref: 'VALID00004', status: 'failed' }),
    'bukan objek',
    trx({ ref: 'VALID00005', paid_at: '2026-09-27T08:00:00', amount: '25000' })
  ]);
  const r = res.body.data.results;
  assert.deepEqual(r.map(x => x.status), ['rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'inserted']);
  assert.match(r[0].reason, /ref/);
  assert.match(r[4].reason, /success/);
  const row = await db.getAsync(`SELECT tanggal, jumlah FROM transactions WHERE ref_code = 'VALID00005'`);
  assert.equal(row.tanggal, '2026-09-27T01:00:00.000Z');
  assert.equal(row.jumlah, 25000);
});

test('body tidak valid & batas batch', async () => {
  assert.equal((await ingest([])).status, 400);
  assert.equal((await req('POST', '/v1/ingest/qr', { key: apiKey, body: { data: [] } })).status, 400);
  const many = Array.from({ length: 501 }, (_, i) => trx({ ref: `BANYAK${String(i).padStart(5, '0')}` }));
  assert.equal((await ingest(many)).status, 413);
});

test('key yang dicabut tidak bisa dipakai lagi', async () => {
  const list = await req('GET', '/api-keys', { token: masterToken });
  const revoke = await req('DELETE', `/api-keys/${list.body.data[0].id}`, { token: masterToken });
  assert.equal(revoke.status, 200);
  assert.equal((await ingest([trx({ ref: 'SETELAHCABUT1' })])).status, 401);
  assert.equal((await req('DELETE', `/api-keys/${list.body.data[0].id}`, { token: masterToken })).status, 404);
});

test('filter log API vs User pada endpoint /logs dan /logs/recent', async () => {
  // Tambahkan log user sintetis
  await db.runAsync(`INSERT INTO logs (actor, actor_role, action, details) VALUES ('operator@test', 'OED', 'UPDATE_ROW', '{}')`);

  const allLogs = await req('GET', '/logs', { token: masterToken });
  assert.equal(allLogs.status, 200);
  assert.ok(allLogs.body.length > 0);

  const apiLogs = await req('GET', '/logs?type=api', { token: masterToken });
  assert.equal(apiLogs.status, 200);
  assert.ok(apiLogs.body.every(l => l.actor_role === 'API' || (l.action && l.action.startsWith('API_')) || (l.actor && l.actor.startsWith('api:'))));

  const userLogs = await req('GET', '/logs?type=user', { token: masterToken });
  assert.equal(userLogs.status, 200);
  assert.ok(userLogs.body.every(l => l.actor_role !== 'API' && (!l.action || !l.action.startsWith('API_')) && (!l.actor || !l.actor.startsWith('api:'))));

  const recentApi = await req('GET', '/logs/recent?type=api');
  assert.equal(recentApi.status, 200);
  assert.ok(recentApi.body.every(l => l.actor_role === 'API' || (l.action && l.action.startsWith('API_')) || (l.actor && l.actor.startsWith('api:'))));

  const recentUser = await req('GET', '/logs/recent?type=user');
  assert.equal(recentUser.status, 200);
  assert.ok(recentUser.body.every(l => l.actor_role !== 'API' && (!l.action || !l.action.startsWith('API_')) && (!l.actor || !l.actor.startsWith('api:'))));
});

test('reactor: status version dan deteksi perubahan data', async () => {
  // Buat API key baru karena key sebelumnya sudah dicabut di test sebelumnya
  const newKeyRes = await req('POST', '/api-keys', {
    token: masterToken,
    body: { name: 'Reactor Ingest Key' }
  });
  assert.equal(newKeyRes.status, 201);
  const reactorKey = newKeyRes.body.data.key;

  const v1 = await req('GET', '/reactor/version');
  assert.equal(v1.status, 200);
  assert.ok(typeof v1.body.version === 'number');

  // Lakukan insert transaksi via ingest dengan key baru
  const ingestRes = await ingest([trx({ ref: 'REACTORTEST01', amount: 50000 })], reactorKey);
  assert.equal(ingestRes.status, 200);

  const v2 = await req('GET', '/reactor/version');
  assert.equal(v2.status, 200);
  assert.ok(v2.body.version > v1.body.version);
  assert.ok(v2.body.count > v1.body.count);
});

