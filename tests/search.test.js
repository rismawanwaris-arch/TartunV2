// Menguji buildSearchMatchers (public/js/handlers.js) di sandbox vm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ Intl, WeakMap, Map, Set, Math, String, Number, Object, Array, Date, RegExp, parseFloat, parseInt, isNaN, console, document: {}, window: {} });
vm.runInContext(`${fs.readFileSync(path.join(__dirname, '../public/js/handlers.js'), 'utf8')}\nthis.AppHandlers = AppHandlers;`, ctx);

const matches = (term, text) => {
  const matchers = ctx.AppHandlers.buildSearchMatchers(term.toLowerCase());
  return matchers.every(p => p.test(text.toLowerCase().replace(/\s+/g, ' ')));
};

const QR = 'PARENT JH2 TARTUN QR RRN:1sogncz96643 Menerima pembayaran dari DANA 150000';
const TF_FIQRI = 'PARENT CJM PC3 TARTUN TF BRI Transfer dari Muhammad Fiqri via BRImo2 500000';
const TF_GQR = 'PARENT CIKADUT 2 TARTUN TF BRI GoPay Bank Transfer ID2622935095854GQR 100000';
const TF_OUTLET_QR = 'BANDAR KUOTA QR TARTUN TF BRI Transfer 200000';

test('tanpa kutip: kata harus di awal kata, bukan di tengah', () => {
  assert.equal(matches('tartun qr', QR), true);
  assert.equal(matches('tartun qr', TF_FIQRI), false);
  assert.equal(matches('tartun qr', TF_GQR), false);
  assert.equal(matches('tartun qr', TF_OUTLET_QR), true); // qr ada di nama outlet
});

test('frasa dalam kutip harus berurutan', () => {
  assert.equal(matches('"tartun qr"', QR), true);
  assert.equal(matches('"tartun qr"', TF_OUTLET_QR), false);
  assert.equal(matches('"tartun  qr"', 'x TARTUN   QR y'), true);
});

test('gabungan kata dan frasa', () => {
  assert.equal(matches('jh2 "tartun qr"', QR), true);
  assert.equal(matches('cjm "tartun qr"', QR), false);
});

test('awalan kata tetap cocok (nama bernomor, nominal, qris)', () => {
  assert.equal(matches('sinjay', 'PARENT SINJAY2 ALFA 2'), true);
  assert.equal(matches('1605', 'x 1605000'), true);
  assert.equal(matches('qr', 'BAYAR QRIS'), true);
});

test('karakter khusus aman dan kutip tidak tertutup', () => {
  assert.equal(matches('#trfla', 'EDC#TRFLA'), true);
  assert.equal(matches('rrn:1sog', QR), true);
  assert.equal(matches('(', 'a ( b'), true);
  assert.equal(matches('"tartun qr', QR), true);
  assert.equal(ctx.AppHandlers.buildSearchMatchers('  ""  ').length, 0);
});
