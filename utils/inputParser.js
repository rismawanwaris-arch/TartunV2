function parseDateWithPriority(str, formatOrder = ['yyyy_mm_dd', 'dd_mm_yyyy', 'iso']) {
  const ts = Date.parse(str);
  if (!isNaN(ts)) return new Date(ts).toISOString();
  
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`).toISOString();
    if (parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString();
  }
  return null;
}

function parseRawDataInput(text, delimiter, settings) {
  const lines = text.split('\n');
  const results = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    if (line.toLowerCase().includes('tanggal') && line.toLowerCase().includes('keterangan')) continue;
    
    const parts = line.split(delimiter);
    if (parts.length < 4) {
      results.push({ raw: line, error: 'Jumlah kolom tidak sesuai format' });
      continue;
    }
    
    let [tanggalStr, nama, jumlahStr, keterangan, ...rest] = parts;
    
    if (settings.exceptionKeywords.some(kw => (keterangan||'').toUpperCase().includes(kw.toUpperCase()))) {
      continue;
    }
    
    let jumlah = parseFloat(jumlahStr.replace(/\./g, '').replace(/,/g, '.'));
    if (isNaN(jumlah)) {
      results.push({ raw: line, error: 'Format jumlah salah' });
      continue;
    }
    
    const tanggal = parseDateWithPriority(tanggalStr);
    if (!tanggal) {
      results.push({ raw: line, error: 'Format tanggal tidak dikenali' });
      continue;
    }
    
    nama = nama.replace(/\s\s+/g, ' ').trim();
    if (settings.nameConsolidation[nama.toUpperCase()]) {
      nama = settings.nameConsolidation[nama.toUpperCase()];
    }
    
    let tipe_sheet = null;
    const ketUpper = (keterangan||'').toUpperCase();
    if (settings.routingKeywords.tiket.some(kw => ketUpper.includes(kw.toUpperCase()))) {
      tipe_sheet = 'TIKET';
    } else if (settings.routingKeywords.manual.some(kw => ketUpper.includes(kw.toUpperCase()))) {
      tipe_sheet = 'MANUAL';
    } else {
      results.push({ raw: line, error: 'Tidak ada routing cocok' });
      continue;
    }
    
    results.push({
      tanggal,
      nama,
      jumlah,
      keterangan,
      tipe_sheet,
      status: 'valid'
    });
  }
  
  return results;
}

module.exports = {
  parseDateWithPriority,
  parseRawDataInput
};
