// Kode referensi bank (RRN/REF) di keterangan transaksi QR, mis.
// "TARTUN QR RRN:1s3rzha43173 ..." atau "TARTUN QR RRN: 1r2kknb64895 | 19.20 WIB".
// Kode ini unik per transaksi sehingga dipakai sebagai kunci duplikat lintas outlet.
// Pola harus sama dengan AppImport.extractReference di public/js/importEngine.js.
const REF_PATTERN = /(?:RRN|REF)\s*:\s*([A-Za-z0-9]{6,})/i;

function extractReference(keterangan) {
  const match = String(keterangan || '').match(REF_PATTERN);
  return match ? match[1].toUpperCase() : '';
}

module.exports = { REF_PATTERN, extractReference };
