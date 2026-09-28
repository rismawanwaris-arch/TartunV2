const test = require('node:test');
const assert = require('node:assert/strict');
const AppImport = require('../public/js/importEngine');
const { extractReference } = require('../utils/transactionRef');

const samples = [
  ['TARTUN QR RRN:1s3rzha43173 Menerima pembayaran dari DANA a.n. AL**', '1S3RZHA43173'],
  ['TARTUN QR RRN: 1r2kknb64895 | 19.20 WIB', '1R2KKNB64895'],
  ['TARTUN QR REF:1sodncj75027 Menerima pembayaran dari GOPAY', '1SODNCJ75027'],
  ['TARTUN QR rrn : 380634341', '380634341'],
  ['TARTUN QR RRN:TNGD03167481', 'TNGD03167481'],
  ['TARTUN QR RRN:12345 terlalu pendek', ''],
  ['TARTUN TF BRI BFST215401000596563FAHMI', ''],
  ['', ''],
  [null, '']
];

test('ekstraksi RRN/REF: server dan frontend identik', () => {
  for (const [ket, expected] of samples) {
    assert.equal(extractReference(ket), expected, `server: ${ket}`);
    assert.equal(AppImport.extractReference(ket), expected, `frontend: ${ket}`);
  }
});

test('kunci duplikat: RRN mengabaikan outlet, format keterangan & tanggal', () => {
  const a = { tanggal: '2026-09-27T12:00:00.000Z', nama: 'PARENT A', jumlah: 100000, keterangan: 'TARTUN QR RRN:1s3rzha43173 Menerima pembayaran' };
  const b = { tanggal: '2026-09-28T01:00:00.000Z', nama: 'PARENT B', jumlah: 100000.0, keterangan: 'TARTUN QR RRN: 1s3rzha43173 | 19.00 WIB' };
  assert.equal(AppImport.duplicateKey(a), AppImport.duplicateKey(b));
  assert.notEqual(AppImport.duplicateKey(a), AppImport.duplicateKey({ ...b, jumlah: 99000 }));
  const tf = { tanggal: '2026-09-27T12:00:00.000Z', nama: 'PARENT A', jumlah: 1, keterangan: 'TARTUN TF BRI' };
  assert.notEqual(AppImport.duplicateKey(tf), AppImport.duplicateKey({ ...tf, nama: 'PARENT B' }));
});

test('finalizeItems menandai RRN sama lintas outlet sebagai duplikat input', () => {
  const v = (nama, ket) => ({ status: 'valid', data: { tanggal: '2026-09-27T01:00:00.000Z', nama, jumlah: 5000, keterangan: ket, tipe_sheet: 'MANUAL' } });
  const { items } = AppImport.finalizeItems([
    v('PARENT A', 'TARTUN QR RRN:ABC123456 x'),
    v('PARENT B', 'TARTUN QR RRN: abc123456 | 08.00 WIB'),
    v('PARENT A', 'TARTUN QR RRN:ABC123456 x'),
    v('PARENT B', 'TARTUN TF 1'),
    v('PARENT C', 'TARTUN TF 1')
  ], {});
  assert.deepEqual(items.map(i => i.status), ['valid', 'duplicate_input', 'duplicate_input', 'valid', 'valid']);
  assert.equal(items[1].errorReason, 'Duplikat di input: RRN ABC123456 juga ada untuk PARENT A');
  assert.equal(items[2].errorReason, 'Duplikat di input: RRN ABC123456');
});
