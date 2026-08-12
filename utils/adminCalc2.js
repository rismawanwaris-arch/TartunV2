function calculateAdminFee(row, adminRules) {
  const value = Math.abs(parseFloat(row.jumlah));
  const keterangan = (row.keterangan || "").toUpperCase();
  const isTiket = row.tipe_sheet === 'TIKET';
  
  let fee = 0;
  
  // Sort rules by amount ascending to find the smallest suitable bracket
  const sortedRules = [...adminRules].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
  
  const applicableRules = sortedRules.filter(r => {
    const keywords = r.keyword.split(',').map(k => k.trim().toUpperCase());
    return keywords.some(k => keterangan.includes(k));
  });

  if (applicableRules.length > 0) {
    // Find first rule where value <= rule.amount
    let matchedRule = applicableRules.find(r => value <= parseFloat(r.amount));
    // If no rule is big enough, use the largest one available
    if (!matchedRule) {
      matchedRule = applicableRules[applicableRules.length - 1];
    }
    
    if (matchedRule.feeType === 'percentage') {
      fee = Math.round(value * (parseFloat(matchedRule.feeValue) / 100));
    } else {
      fee = parseFloat(matchedRule.feeValue);
    }
  }

  // Khusus TIKET: tambahkan nominal unik 3 digit terakhir integer
  let tiketUnik = 0;
  if (isTiket) {
    const intPart = String(value).split('.')[0];
    if (intPart.length > 0) {
      tiketUnik = parseInt(intPart.slice(-3)) || 0;
      fee += tiketUnik;
    }
  }

  return { fee, tiketUnik };
}

function aggregateByOutlet(data, settings) {
  const outletMap = {};
  
  data.forEach(row => {
    const { fee, tiketUnik } = calculateAdminFee(row, settings.adminRules);
    const nama = row.nama;
    
    if (!outletMap[nama]) {
      outletMap[nama] = {
        nama,
        count: 0,
        total_jumlah: 0,
        manualFee: 0,
        tiketFee: 0,
        tiketUnik: 0
      };
    }
    
    outletMap[nama].count += 1;
    outletMap[nama].total_jumlah += Math.abs(parseFloat(row.jumlah));
    
    if (row.tipe_sheet === 'TIKET') {
      outletMap[nama].tiketFee += (fee - tiketUnik);
      outletMap[nama].tiketUnik += tiketUnik;
    } else {
      outletMap[nama].manualFee += fee;
    }
  });

  const pctOutlet = parseFloat(settings.outletCommissionPercentage) / 100;
  const pctCS = parseFloat(settings.csCommissionPercentage) / 100;
  const ticketDest = settings.ticketFeeDestination;

  const result = Object.values(outletMap).map(o => {
    const totalAdminFee = o.manualFee + o.tiketFee + o.tiketUnik;
    
    let commissionBase = o.manualFee + o.tiketFee;
    if (ticketDest === 'adminFee' || ticketDest === 'outletCommission') {
       if (ticketDest === 'outletCommission') commissionBase += o.tiketUnik;
    }
    
    const initialCommOutlet = commissionBase * pctOutlet;
    const commCS = initialCommOutlet * pctCS;
    const netCommOutlet = initialCommOutlet - commCS;
    
    return {
      nama: o.nama,
      count: o.count,
      total_jumlah: o.total_jumlah,
      total_admin_fee: totalAdminFee,
      komisi_outlet: netCommOutlet,
      komisi_cs: commCS,
      _raw: o
    };
  });
  
  return result.sort((a, b) => b.komisi_outlet - a.komisi_outlet);
}

module.exports = {
  calculateAdminFee,
  aggregateByOutlet
};
