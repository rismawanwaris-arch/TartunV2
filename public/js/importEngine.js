// Mesin import file berbasis "profil format" (Pengaturan > Profil Format Import).
// Semua fungsi di sini murni (tanpa DOM) sehingga bisa diuji di Node.
//
// Satu profil menjelaskan cara membaca satu jenis file:
//   - fileType      : 'csv' | 'xlsx'
//   - delimiter     : pemisah kolom CSV (`\t` untuk Tab)
//   - headerKeywords: kata yang WAJIB ada di baris header (huruf kecil/besar bebas)
//   - headerRequired: true  -> header dicari di 10 baris pertama; tabel tanpa header dilewati
//                     false -> header opsional, hanya baris pertama yang diperiksa
//   - columns       : { field: 'Nama Header | Alternatif | #3' } — '#3' = kolom ke-3.
//                     Nilai field = isi pertama yang tidak kosong dari kolom-kolom tsb.
//   - template      : format keterangan, mis. 'TARTUN QR RRN:{ref} Menerima pembayaran [dari {metode}|QRIS]'
//                     {field} diganti nilai kolom; [a|b|c] memilih alternatif pertama
//                     yang semua placeholder-nya terisi.
//   - tipe          : 'auto' (pakai Kata Kunci Routing) | 'MANUAL' | 'TIKET'
//   - dateFormat    : 'auto' (Prioritas Format Tanggal) | 'dmy' (DD/MM/YYYY) | 'iso'
//   - amountFormat  : 'id' (1.234,56) | 'en' (1,234.56)
//   - statusValues  : bila diisi, hanya baris dengan kolom status bernilai ini yang diproses
//   - skipPrefixes  : lewati baris yang Nama Outlet-nya diawali teks ini (Subtotal, Total, ...)
//   - skipIfNoOutlet: lewati baris tanpa Nama Outlet
//   - skipNonPositive: lewati baris dengan jumlah <= 0 atau tidak terbaca

const IMPORT_FIELDS = [
    { id: 'tanggal', label: 'Tanggal', required: true },
    { id: 'jam', label: 'Jam' },
    { id: 'kodeOutlet', label: 'Kode Outlet / NMID' },
    { id: 'namaOutlet', label: 'Nama Outlet', required: true },
    { id: 'jumlah', label: 'Jumlah', required: true },
    { id: 'keterangan', label: 'Keterangan' },
    { id: 'ref', label: 'Referensi / RRN' },
    { id: 'metode', label: 'Metode Bayar' },
    { id: 'pembayar', label: 'Nama Pembayar' },
    { id: 'status', label: 'Status' }
];

const DEFAULT_IMPORT_PROFILES = [
    {
        id: 'template_csv',
        name: 'CSV Template Aplikasi',
        fileType: 'csv',
        delimiter: ';',
        headerKeywords: ['tanggal', 'keterangan'],
        headerRequired: false,
        columns: { tanggal: '#1', namaOutlet: '#2', jumlah: '#3', keterangan: '#4' },
        template: '{keterangan}',
        tipe: 'auto',
        dateFormat: 'auto',
        amountFormat: 'id',
        statusValues: [],
        skipPrefixes: [],
        skipIfNoOutlet: false,
        skipNonPositive: false
    },
    {
        id: 'bca_merchant_xlsx',
        name: 'Excel Merchant BCA',
        fileType: 'xlsx',
        delimiter: ',',
        headerKeywords: ['merchant name', 'original amount'],
        headerRequired: true,
        columns: {
            tanggal: 'Transaction Date',
            jam: 'Transaction Time',
            kodeOutlet: 'National Merchant ID',
            namaOutlet: 'Merchant Name',
            jumlah: 'Original Amount',
            ref: 'Reference Number',
            metode: 'Payment Type',
            pembayar: 'Payer Name'
        },
        template: 'TARTUN QR RRN:{ref} Menerima pembayaran [dari {metode} a.n. {pembayar}|dari {metode}|dari {pembayar}|QRIS]',
        tipe: 'MANUAL',
        dateFormat: 'dmy',
        amountFormat: 'en',
        statusValues: [],
        skipPrefixes: ['subtotal', 'total', 'note:'],
        skipIfNoOutlet: true,
        skipNonPositive: true
    },
    {
        id: 'qris_settlement_csv',
        name: 'Settlement QRIS (CSV)',
        fileType: 'csv',
        delimiter: ',',
        headerKeywords: ['outlet code', 'amount (rp)'],
        headerRequired: true,
        columns: {
            tanggal: 'Transaction Date',
            kodeOutlet: 'Outlet Code',
            namaOutlet: 'Outlet Name',
            jumlah: 'Amount (Rp)',
            ref: 'Reference | Transaction ID',
            metode: 'Payment Method',
            pembayar: 'Customer',
            status: 'Status'
        },
        template: 'TARTUN QR REF:{ref} [Menerima pembayaran dari {metode} a.n. {pembayar}|Menerima pembayaran dari {metode}|Menerima pembayaran QRIS]',
        tipe: 'MANUAL',
        dateFormat: 'iso',
        amountFormat: 'en',
        statusValues: ['success'],
        skipPrefixes: [],
        skipIfNoOutlet: false,
        skipNonPositive: true
    }
];

const HEADER_SEARCH_ROWS = 10;

// Harus sama dengan REF_PATTERN di utils/transactionRef.js (server).
const REF_PATTERN = /(?:RRN|REF)\s*:\s*([A-Za-z0-9]{6,})/i;

// Pencocokan kata/frasa utuh, tidak peka huruf besar/kecil:
// "BAYAR" cocok dengan "bayar tagihan" tetapi tidak dengan "pembayaran".
function _keywordRegex(keyword) {
    const escaped = String(keyword).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu');
}

const AppImport = {
    FIELDS: IMPORT_FIELDS,
    DEFAULT_PROFILES: DEFAULT_IMPORT_PROFILES,

    getProfiles(settings) {
        const profiles = settings && Array.isArray(settings.importProfiles) ? settings.importProfiles : null;
        return profiles && profiles.length > 0 ? profiles : DEFAULT_IMPORT_PROFILES;
    },

    // Kode referensi bank (RRN/REF) di keterangan; '' bila tidak ada.
    extractReference(keterangan) {
        const match = String(keterangan || '').match(REF_PATTERN);
        return match ? match[1].toUpperCase() : '';
    },

    // Kunci duplikat: transaksi ber-RRN/REF cukup dicocokkan dari kode + jumlah
    // (lintas outlet, format keterangan & tanggal); sisanya harus sama persis.
    duplicateKey(data) {
        const ref = this.extractReference(data.keterangan);
        if (ref) return `REF|${ref}|${Number(data.jumlah).toFixed(2)}`;
        return `${String(data.tanggal).split('T')[0]}|${data.nama}|${data.jumlah}|${data.keterangan}`;
    },

    matchesKeyword(text, keywords) {
        const value = String(text || '');
        return (keywords || []).some(kw => String(kw || '').trim() && _keywordRegex(kw).test(value));
    },

    // CSV dengan dukungan tanda kutip ("a;b" tetap satu kolom) dan BOM.
    parseDelimited(text, delimiter) {
        const sep = delimiter === '\\t' ? '\t' : (delimiter || ',');
        let src = String(text || '');
        if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
        const rows = [];
        let row = [], field = '', inQuotes = false;
        for (let i = 0; i < src.length; i++) {
            const c = src[i];
            if (inQuotes) {
                if (c === '"') {
                    if (src[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else field += c;
            } else if (c === '"' && field === '') inQuotes = true;
            else if (src.startsWith(sep, i)) { row.push(field); field = ''; i += sep.length - 1; }
            else if (c === '\r') { /* dilewati */ }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else field += c;
        }
        if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
        return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
    },

    findHeaderRow(rows, profile) {
        const keywords = (profile.headerKeywords || []).map(k => String(k).trim().toLowerCase()).filter(Boolean);
        if (keywords.length === 0) return -1;
        const limit = profile.headerRequired ? Math.min(rows.length, HEADER_SEARCH_ROWS) : Math.min(rows.length, 1);
        for (let r = 0; r < limit; r++) {
            const text = (rows[r] || []).map(c => String(c).toLowerCase()).join(' ');
            if (keywords.every(k => text.includes(k))) return r;
        }
        return -1;
    },

    // field -> daftar indeks kolom. Mengembalikan juga field yang tidak ditemukan.
    resolveColumns(headerRow, profile) {
        const header = (headerRow || []).map(h => String(h).trim().toLowerCase());
        const map = {};
        const missing = [];
        for (const [field, spec] of Object.entries(profile.columns || {})) {
            const indexes = [];
            String(spec || '').split('|').map(s => s.trim()).filter(Boolean).forEach(part => {
                const pos = part.match(/^#(\d+)$/);
                if (pos) {
                    indexes.push(parseInt(pos[1], 10) - 1);
                } else {
                    const idx = header.indexOf(part.toLowerCase());
                    if (idx > -1) indexes.push(idx);
                }
            });
            if (indexes.length > 0) map[field] = indexes;
            else if (String(spec || '').trim()) missing.push(field);
        }
        return { map, missing };
    },

    renderTemplate(template, values) {
        const fill = text => text.replace(/\{(\w+)\}/g, (_, key) => values[key] || '');
        const placeholdersFilled = text => (text.match(/\{(\w+)\}/g) || []).every(p => values[p.slice(1, -1)]);
        const withAlternatives = String(template || '').replace(/\[([^\]]*)\]/g, (_, group) => {
            const chosen = group.split('|').find(placeholdersFilled);
            return chosen === undefined ? '' : chosen;
        });
        return fill(withAlternatives).trim();
    },

    parseAmount(raw, amountFormat) {
        const str = String(raw === undefined || raw === null ? '' : raw).trim();
        if (!str) return NaN;
        const clean = amountFormat === 'en'
            ? str.replace(/,/g, '')
            : str.replace(/\./g, '').replace(',', '.');
        return parseFloat(clean);
    },

    // helpers.parseDateAuto dipakai untuk dateFormat 'auto' (Prioritas Format Tanggal).
    parseDate(rawDate, rawTime, profile, helpers) {
        const str = String(rawDate === undefined || rawDate === null ? '' : rawDate).trim();
        if (!str) return null;
        let date = null;
        if (profile.dateFormat === 'dmy') {
            const parts = str.split(/[\/\-.]/);
            if (parts.length === 3) {
                let year = parseInt(parts[2], 10);
                if (year < 100) year += 2000;
                date = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 0, 0, 0, 0);
            }
        } else if (profile.dateFormat === 'iso') {
            const ts = Date.parse(str);
            date = isNaN(ts) ? null : new Date(ts);
        } else {
            date = helpers && helpers.parseDateAuto ? helpers.parseDateAuto(str) : null;
        }
        if (!date || isNaN(date.getTime())) return null;

        const time = String(rawTime || '').replace(/wib/i, '').trim();
        if (time) {
            const t = time.split(/[:.]/);
            if (t.length >= 2) {
                date.setHours(parseInt(t[0], 10) || 0, parseInt(t[1], 10) || 0, t.length >= 3 ? parseInt(t[2], 10) || 0 : 0, 0);
            }
        }
        return date;
    },

    resolveOutletName(kode, nama, settings) {
        const consolidation = settings.nameConsolidation || {};
        const nmidMapping = settings.nmidMapping || {};
        const mapped = kode ? nmidMapping[kode] : '';
        return consolidation[String(kode).toUpperCase()] ||
            (mapped && consolidation[String(mapped).toUpperCase()]) ||
            consolidation[String(nama).toUpperCase()] ||
            mapped || nama || kode;
    },

    resolveTipe(profile, keterangan, settings) {
        if (profile.tipe === 'MANUAL' || profile.tipe === 'TIKET') return profile.tipe;
        const routing = settings.routingKeywords || {};
        const lower = String(keterangan || '').toLowerCase();
        if ((routing.tiket || []).some(kw => lower.includes(String(kw).toLowerCase()))) return 'TIKET';
        if ((routing.manual || []).some(kw => lower.includes(String(kw).toLowerCase()))) return 'MANUAL';
        return null;
    },

    // tables: [{ name, rows: [[cell, ...], ...] }]
    // Hasil: { items: [{ status: 'valid'|'error', errorReason, originalLine, data }], tablesRead, tablesSkipped }
    parseTables(tables, profile, settings, helpers) {
        const items = [];
        let tablesRead = 0, tablesSkipped = 0;

        for (const table of tables) {
            const rows = table.rows || [];
            const headerIndex = this.findHeaderRow(rows, profile);
            if (headerIndex === -1 && profile.headerRequired) { tablesSkipped++; continue; }

            const { map, missing } = this.resolveColumns(headerIndex > -1 ? rows[headerIndex] : [], profile);
            const missingRequired = IMPORT_FIELDS.filter(f => f.required && missing.includes(f.id));
            if (missingRequired.length > 0) {
                items.push({
                    status: 'error',
                    errorReason: `Kolom tidak ditemukan${table.name ? ` (${table.name})` : ''}: ${missingRequired.map(f => f.label).join(', ')}`,
                    originalLine: (rows[headerIndex] || []).join(' | '),
                    data: {}
                });
                tablesSkipped++;
                continue;
            }
            tablesRead++;

            for (let r = headerIndex + 1; r < rows.length; r++) {
                const item = this.parseRow(rows[r], map, profile, settings, helpers);
                if (item) items.push(item);
            }
        }
        return { items, tablesRead, tablesSkipped };
    },

    parseRow(row, map, profile, settings, helpers) {
        if (!Array.isArray(row) || row.every(c => String(c).trim() === '')) return null;
        const values = {};
        for (const [field, indexes] of Object.entries(map)) {
            const hit = indexes.map(i => row[i]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
            values[field] = hit === undefined ? '' : String(hit).trim();
        }
        const originalLine = row.join(' | ');
        const error = reason => ({ status: 'error', errorReason: reason, originalLine, data: { ...values } });

        const outletLower = (values.namaOutlet || '').toLowerCase();
        if (profile.skipIfNoOutlet && !values.namaOutlet) return null;
        if ((profile.skipPrefixes || []).some(p => p && outletLower.startsWith(String(p).toLowerCase()))) return null;
        if ((profile.statusValues || []).length > 0) {
            const allowed = profile.statusValues.map(s => String(s).trim().toLowerCase());
            if (!allowed.includes((values.status || '').toLowerCase())) return null;
        }

        const jumlah = this.parseAmount(values.jumlah, profile.amountFormat);
        if (profile.skipNonPositive && !(jumlah > 0)) return null;
        if (isNaN(jumlah)) return error('Format jumlah salah');

        const tanggal = this.parseDate(values.tanggal, values.jam, profile, helpers);
        if (!tanggal) return error('Format tanggal tidak dikenali');

        const keterangan = this.renderTemplate(profile.template, values);
        const tipe = this.resolveTipe(profile, keterangan, settings);
        if (!tipe) return error('Tidak ada routing cocok');

        const nama = this.resolveOutletName(values.kodeOutlet || '', values.namaOutlet || '', settings);
        if (!nama) return error('Nama outlet kosong');

        return {
            status: 'valid',
            errorReason: '',
            originalLine,
            data: { tanggal: tanggal.toISOString(), nama, jumlah, keterangan, tipe_sheet: tipe }
        };
    },

    // Tahap akhir yang sama untuk semua sumber: buang baris berkata kunci pengecualian,
    // rapikan & konsolidasikan nama, tandai duplikat di dalam input, beri hash untuk
    // pengecekan duplikat ke database. Mengembalikan item baru (tidak memutasi input).
    finalizeItems(items, settings) {
        const exceptionKeywords = settings.exceptionKeywords || [];
        const consolidation = settings.nameConsolidation || {};
        const seen = new Map();
        const result = [];
        let skippedByException = 0;

        items.forEach(item => {
            if (item.status !== 'valid') {
                result.push({ ...item, originalIndex: result.length });
                return;
            }
            const d = item.data;
            if (this.matchesKeyword(d.keterangan, exceptionKeywords)) {
                skippedByException++;
                return;
            }
            const normalized = String(d.nama || '').replace(/\s\s+/g, ' ').trim();
            const nama = consolidation[normalized.toUpperCase()] || normalized;
            const hash = `${String(d.tanggal).split('T')[0]}|${nama}|${d.jumlah}|${d.keterangan}`;
            const key = this.duplicateKey({ ...d, nama });
            const firstNama = seen.get(key);
            const isDuplicate = firstNama !== undefined;
            if (!isDuplicate) seen.set(key, nama);
            result.push({
                ...item,
                originalIndex: result.length,
                status: isDuplicate ? 'duplicate_input' : 'valid',
                errorReason: isDuplicate ? this.duplicateInputReason(d.keterangan, firstNama, nama) : '',
                data: { ...d, nama, hash }
            });
        });
        return { items: result, skippedByException };
    },

    duplicateInputReason(keterangan, firstNama, nama) {
        const ref = this.extractReference(keterangan);
        if (!ref) return 'Duplikat di input';
        return firstNama && firstNama !== nama
            ? `Duplikat di input: RRN ${ref} juga ada untuk ${firstNama}`
            : `Duplikat di input: RRN ${ref}`;
    },

    // Profil dengan skor tertinggi untuk tabel-tabel ini (null bila tak ada yang cocok).
    // tablesFor(profile) mengembalikan tabel hasil baca file memakai pemisah profil tsb.
    detectProfile(profiles, fileType, tablesFor) {
        let best = null, bestScore = 0;
        for (const profile of profiles) {
            if (profile.fileType !== fileType) continue;
            const tables = tablesFor(profile);
            let score = 0;
            for (const table of tables) {
                const headerIndex = this.findHeaderRow(table.rows || [], profile);
                if (headerIndex === -1) continue;
                const { map, missing } = this.resolveColumns(table.rows[headerIndex], profile);
                const namedFound = Object.entries(profile.columns || {})
                    .filter(([field, spec]) => map[field] && !/^#\d+$/.test(String(spec).trim())).length;
                const hasRequired = IMPORT_FIELDS.every(f => !f.required || !missing.includes(f.id));
                if (hasRequired) score = Math.max(score, (profile.headerKeywords || []).length + namedFound);
                break;
            }
            if (score > bestScore) { best = profile; bestScore = score; }
        }
        return best;
    },

    validateProfile(profile) {
        const errors = [];
        if (!String(profile.name || '').trim()) errors.push('Nama profil wajib diisi');
        if (!['csv', 'xlsx'].includes(profile.fileType)) errors.push('Jenis file harus CSV atau Excel');
        if (profile.fileType === 'csv' && !String(profile.delimiter || '')) errors.push('Pemisah CSV wajib diisi');
        IMPORT_FIELDS.filter(f => f.required).forEach(f => {
            if (!String((profile.columns || {})[f.id] || '').trim()) errors.push(`Kolom ${f.label} wajib diisi`);
        });
        if (!String(profile.template || '').trim()) errors.push('Template keterangan wajib diisi');
        if (profile.headerRequired && (profile.headerKeywords || []).length === 0) errors.push('Kata kunci header wajib diisi bila header wajib ada');
        return errors;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppImport;
}
