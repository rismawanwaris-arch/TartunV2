// Sumber tunggal perhitungan biaya admin per transaksi.
// Logika identik dengan `calculateAdminFee` di public/js/utils.js — frontend
// memakai versinya sendiri hanya untuk pratinjau (staging, kalkulator, Cek QRIS);
// nilai final dihitung di sini saat data masuk ke database.

function makeKeywordRegex(keyword) {
  const trimmed = String(keyword || '').trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, 'i');
}

function compileAdminRules(adminRules) {
  const rules = Array.isArray(adminRules) ? adminRules : [];
  return rules
    .map(rule => {
      const keywords = String(rule.keyword || '').split(',').map(k => k.trim()).filter(Boolean);
      const regexes = keywords.map(makeKeywordRegex).filter(Boolean);
      return {
        keywords: keywords.map(k => k.toUpperCase()),
        regexes,
        amount: Number(rule.amount) || 0,
        feeType: rule.feeType,
        feeValue: Number(rule.feeValue) || 0,
        flatFee: rule.feeValue !== undefined ? Number(rule.feeValue) || 0 : (Number(rule.fee) || 0)
      };
    })
    .sort((a, b) => a.amount - b.amount);
}

function feeForRule(rule, absValue) {
  return rule.feeType === 'percentage'
    ? Math.round(absValue * (rule.feeValue / 100))
    : rule.flatFee;
}

// Nominal unik TIKET: 3 digit terakhir bagian bulat dari |jumlah|.
function tiketUnikOf(jumlah) {
  const absValue = Math.abs(parseFloat(jumlah) || 0);
  return parseInt(String(absValue).split('.')[0].slice(-3)) || 0;
}

// `compiledRules` hasil compileAdminRules(); dikompilasi sekali per batch.
function computeAdminFee(row, compiledRules) {
  const absValue = Math.abs(parseFloat(row.jumlah) || 0);
  const keterangan = String(row.keterangan || '');

  const matching = compiledRules.filter(rule => rule.regexes.some(re => re.test(keterangan)));

  let feeFromRules = 0;
  if (matching.length > 0) {
    const bracket = matching.find(rule => absValue <= rule.amount) || matching[matching.length - 1];
    feeFromRules = feeForRule(bracket, absValue);
  }

  return row.tipe_sheet === 'TIKET' ? feeFromRules + tiketUnikOf(row.jumlah) : feeFromRules;
}

module.exports = {
  compileAdminRules,
  computeAdminFee,
  tiketUnikOf
};
