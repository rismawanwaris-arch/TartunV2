const test = require('node:test');
const assert = require('node:assert/strict');
const { compileAdminRules, computeAdminFee, tiketUnikOf } = require('../utils/adminFee');

const rules = compileAdminRules([
  { keyword: 'QR', amount: 505999, feeType: 'flat', feeValue: 5000 },
  { keyword: 'QR', amount: 203999, feeType: 'flat', feeValue: 3000 },
  { keyword: 'TF, EDC', amount: 203999, feeType: 'flat', feeValue: 3000 },
  { keyword: 'TIKET, Auto Deposit', amount: 203999, feeType: 'flat', feeValue: 3000 },
  { keyword: 'PCT', amount: 1000000, feeType: 'percentage', feeValue: 1.5 }
]);

const fee = (jumlah, keterangan, tipe_sheet = 'MANUAL') => computeAdminFee({ jumlah, keterangan, tipe_sheet }, rules);

test('memilih bracket terkecil yang cukup (aturan tidak berurutan di settings)', () => {
  assert.equal(fee(100000, 'TARTUN QR'), 3000);
  assert.equal(fee(203999, 'TARTUN QR'), 3000);
  assert.equal(fee(204000, 'TARTUN QR'), 5000);
});

test('di atas bracket terbesar memakai aturan terbesar', () => {
  assert.equal(fee(9000000, 'TARTUN QR'), 5000);
});

test('keyword dipisah koma, tidak peka huruf besar/kecil', () => {
  assert.equal(fee(50000, 'tartun edc'), 3000);
  assert.equal(fee(50000, 'Tartun Tf'), 3000);
});

test('tanpa keyword cocok -> 0', () => {
  assert.equal(fee(50000, 'LAINNYA'), 0);
  assert.equal(fee(50000, null), 0);
});

test('jumlah negatif memakai nilai absolut', () => {
  assert.equal(fee(-100000, 'QR'), 3000);
});

test('persentase dibulatkan', () => {
  assert.equal(fee(100001, 'PCT'), 1500);
});

test('TIKET menambahkan 3 digit terakhir bagian bulat', () => {
  assert.equal(tiketUnikOf(150123.75), 123);
  assert.equal(tiketUnikOf(-50007), 7);
  assert.equal(fee(150123, 'TIKET DEPOSIT', 'TIKET'), 3123);
});

test('jumlah tidak valid dan aturan kosong aman', () => {
  assert.equal(fee('abc', 'QR'), 3000);
  assert.equal(computeAdminFee({ jumlah: 1000, keterangan: 'QR' }, compileAdminRules(undefined)), 0);
});
