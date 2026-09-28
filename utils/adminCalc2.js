const { tiketUnikOf } = require('./adminFee');

// Biaya admin per baris sudah tersimpan di kolom admin_fee (dihitung saat upload).
function rowAdminFee(row) {
  return Number(row.admin_fee) || 0;
}

// Agregasi komisi per outlet — rumus identik dengan `aggregateData` di
// public/js/handlers.js (sumber kebenaran untuk angka yang dilihat pengguna).
function aggregateByOutlet(data, settings) {
  const outletMap = {};

  data.forEach(row => {
    const nama = row.nama;
    if (!nama) return;
    if (!outletMap[nama]) {
      outletMap[nama] = { nama, count: 0, total_jumlah: 0, manualFee: 0, tiketFee: 0, tiketUnik: 0 };
    }
    const o = outletMap[nama];
    const fee = rowAdminFee(row);
    o.count += 1;
    o.total_jumlah += parseFloat(row.jumlah) || 0;

    if (row.tipe_sheet === 'MANUAL') {
      o.manualFee += fee;
    } else if (row.tipe_sheet === 'TIKET') {
      const unik = tiketUnikOf(row.jumlah);
      o.tiketFee += fee - unik;
      o.tiketUnik += unik;
    }
  });

  const pctOutlet = (parseFloat(settings.outletCommissionPercentage) || 0) / 100;
  const pctCS = (parseFloat(settings.csCommissionPercentage) || 0) / 100;
  const ticketDest = settings.ticketFeeDestination;

  const result = Object.values(outletMap).map(o => {
    let commissionBase = o.manualFee + o.tiketFee;
    if (ticketDest === 'adminFee') commissionBase += o.tiketUnik;

    let initialCommOutlet = commissionBase * pctOutlet;
    if (ticketDest === 'outletCommission') initialCommOutlet += o.tiketUnik;

    const commCS = initialCommOutlet * pctCS;

    return {
      nama: o.nama,
      count: o.count,
      total_jumlah: o.total_jumlah,
      total_admin_fee: o.manualFee + o.tiketFee + o.tiketUnik,
      komisi_outlet: Math.round(initialCommOutlet - commCS),
      komisi_cs: Math.round(commCS),
      _raw: o
    };
  });

  return result.sort((a, b) => b.komisi_outlet - a.komisi_outlet);
}

module.exports = {
  rowAdminFee,
  aggregateByOutlet
};
