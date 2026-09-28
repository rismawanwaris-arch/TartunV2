// Formatter mata uang di-reuse; membuat Intl.NumberFormat baru pada tiap
// panggilan sangat mahal saat merender ribuan sel tabel.
const _IDR_FORMATTER = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
});

// Cache aturan admin ter-kompilasi + memoisasi hasil biaya, di-key per objek
// `settings`. `settings.load()` selalu membuat objek baru sehingga cache lama
// otomatis gugur (WeakMap) tanpa perlu invalidasi manual.
const _feeBundleCache = new WeakMap();
function _getFeeBundle(settings) {
    let bundle = _feeBundleCache.get(settings);
    if (bundle) return bundle;

    const rules = Array.isArray(settings.adminRules) ? settings.adminRules : [];
    const compiled = rules
        .map(rule => ({
            keywords: String(rule.keyword || '').split(',').map(k => k.trim().toUpperCase()).filter(Boolean),
            amount: Number(rule.amount) || 0,
            feeType: rule.feeType,
            feeValue: Number(rule.feeValue) || 0,
            flatFee: rule.feeValue !== undefined ? Number(rule.feeValue) || 0 : (Number(rule.fee) || 0)
        }))
        .sort((a, b) => a.amount - b.amount);

    bundle = { compiled, memo: new Map() };
    _feeBundleCache.set(settings, bundle);
    return bundle;
}

// Lazy-load library eksternal berat (xlsx ~900KB, jspdf ~350KB, html2canvas ~200KB)
// hanya saat fitur import/export benar-benar dipakai — bukan di setiap page load.
const _scriptPromises = {};
function _loadScriptOnce(url) {
    if (!_scriptPromises[url]) {
        _scriptPromises[url] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => { delete _scriptPromises[url]; reject(new Error('Gagal memuat script: ' + url)); };
            document.head.appendChild(s);
        });
    }
    return _scriptPromises[url];
}
const _CDN_LIBS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    jspdfAutotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
};
async function ensureXLSX() {
    if (typeof XLSX === 'undefined') await _loadScriptOnce(_CDN_LIBS.xlsx);
}
async function ensureJsPDF() {
    if (typeof window.jspdf === 'undefined') await _loadScriptOnce(_CDN_LIBS.jspdf);
    await _loadScriptOnce(_CDN_LIBS.jspdfAutotable);
}
async function ensureHtml2canvas() {
    if (typeof html2canvas === 'undefined') await _loadScriptOnce(_CDN_LIBS.html2canvas);
}

const AppUtils = {
    generateUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            try {
                return crypto.randomUUID();
            } catch (e) {}
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    formatCurrency(value) {
        return _IDR_FORMATTER.format(value || 0);
    },

    formatDateForInput(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    normalizeName(name) {
        if (typeof name !== 'string') return '';
        return name.replace(/\s\s+/g, ' ').trim();
    },

    formatNumberWithDots(value) {
        if (!value) return '';
        const numberString = String(value).replace(/\D/g, '');
        if (numberString === '') return '';
        return new Intl.NumberFormat('id-ID').format(numberString);
    },

    parseFormattedNumber(value) {
        if (typeof value !== 'string') {
            value = String(value || '');
        }
        const numberString = value.replace(/\D/g, '');
        return parseFloat(numberString) || 0;
    },

    parseDateWithPriority(dateString, formats = []) {
        if (!dateString || typeof dateString !== 'string') return null;
        const str = dateString.trim();

        // Ekstrak komponen jam, menit, dan detik jika ada (mendukung format titik atau titik dua, e.g. "21.43.33", "21:43:33", "21.43")
        let hours = 0, minutes = 0, seconds = 0;
        const timeMatch = str.match(/(?:[,\sT]+)(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?(?:\s*(AM|PM))?/i);
        if (timeMatch) {
            hours = parseInt(timeMatch[1], 10) || 0;
            minutes = parseInt(timeMatch[2], 10) || 0;
            seconds = parseInt(timeMatch[3], 10) || 0;
            const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
            if (ampm === 'PM' && hours < 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
        }

        for (const format of formats) {
            if (!format.active) continue;

            let date = null;
            try {
                if (format.id === 'iso_8601') {
                    date = new Date(str);
                    if (!isNaN(date.getTime())) return date;
                } else if (format.id === 'yyyy_mm_dd') {
                    const ymdParts = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
                    if (ymdParts) {
                        date = new Date(parseInt(ymdParts[1], 10), parseInt(ymdParts[2], 10) - 1, parseInt(ymdParts[3], 10), hours, minutes, seconds);
                        if (!isNaN(date.getTime())) return date;
                    }
                } else if (format.id === 'dd_mm_yyyy') {
                    const dmyParts = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
                    if (dmyParts) {
                        date = new Date(parseInt(dmyParts[3], 10), parseInt(dmyParts[2], 10) - 1, parseInt(dmyParts[1], 10), hours, minutes, seconds);
                        if (!isNaN(date.getTime())) return date;
                    }
                } else if (format.id === 'mm_dd_yyyy') {
                    const mdyParts = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
                    if (mdyParts) {
                        date = new Date(parseInt(mdyParts[3], 10), parseInt(mdyParts[1], 10) - 1, parseInt(mdyParts[2], 10), hours, minutes, seconds);
                        if (!isNaN(date.getTime())) return date;
                    }
                }
            } catch (e) { /* Abaikan dan lanjut */ }
        }

        // Fallback global jika format prioritas tidak cocok
        try {
            const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
            if (dmyMatch) {
                const date = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10), hours, minutes, seconds);
                if (!isNaN(date.getTime())) return date;
            }
            const fallback = new Date(str);
            if (!isNaN(fallback.getTime())) return fallback;
        } catch (e) {}

        return null;
    },

    calculateAdminFee(row, settings) {
        // Transaksi dari database membawa admin_fee yang sudah dihitung server saat
        // upload. Perhitungan di bawah hanya untuk data yang belum tersimpan
        // (pratinjau upload, kalkulator, Cek QRIS).
        if (typeof row.admin_fee === 'number') return row.admin_fee;

        const bundle = _getFeeBundle(settings);
        const value = parseFloat(row.jumlah) || 0;
        const absValue = Math.abs(value);
        const keterangan = String(row.keterangan || '').toUpperCase();
        const isTiket = row.tipe_sheet === 'TIKET';

        // Memoisasi: banyak baris berbagi (keterangan, jumlah, tipe) yang sama.
        const memoKey = `${isTiket ? 'T' : 'M'}|${value}|${keterangan}`;
        const cached = bundle.memo.get(memoKey);
        if (cached !== undefined) return cached;

        let feeFromRules = 0;
        const matchingRules = [];
        for (const rule of bundle.compiled) {
            if (rule.keywords.some(kw => keterangan.includes(kw))) {
                matchingRules.push(rule);
            }
        }

        let ruleApplied = false;
        for (const rule of matchingRules) {
            if (absValue <= rule.amount) {
                feeFromRules = rule.feeType === 'percentage'
                    ? Math.round(absValue * (rule.feeValue / 100))
                    : rule.flatFee;
                ruleApplied = true;
                break;
            }
        }

        if (!ruleApplied && matchingRules.length > 0) {
            const lastRule = matchingRules[matchingRules.length - 1];
            feeFromRules = lastRule.feeType === 'percentage'
                ? Math.round(absValue * (lastRule.feeValue / 100))
                : lastRule.flatFee;
        }

        let totalFee = feeFromRules;
        if (isTiket) {
            const feeFromTicketNominal = parseInt(String(absValue).split('.')[0].slice(-3)) || 0;
            totalFee += feeFromTicketNominal;
        }

        bundle.memo.set(memoKey, totalFee);
        return totalFee;
    },

    _downloadBlob(filename, blob) {
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(link.href); // Clean up memory
    },
    
    exportToCSV(filename, headers, data, footerData = null) {
        const delimiter = this.state.settings.dataParsingSettings.csvDelimiter === '\\t' ? '\t' : this.state.settings.dataParsingSettings.csvDelimiter;
        
        const formatCell = (value) => {
            const stringValue = String(value === null || value === undefined ? '' : value);
            if (/[";\n]/.test(stringValue)) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        const headerRow = headers.map(col => formatCell(col.label)).join(delimiter);
        
        const dataRows = data.map(row => {
            return headers.map(col => {
                const value = row[col.id];
                return col.isCurrency ? (value || 0) : formatCell(value);
            }).join(delimiter);
        });
        
        let csvContent = [headerRow, ...dataRows];

        if (footerData) {
            const footerRow = headers.map(col => {
                const value = footerData[col.id];
                return col.isCurrency ? (value || 0) : formatCell(value || '');
            });
            csvContent.push(footerRow.join(delimiter));
        }

        const blob = new Blob(['\uFEFF' + csvContent.join('\r\n')], { type: "text/csv;charset=utf-8;" });
        this.utils._downloadBlob(filename, blob);
        this.ui.showModal('Sukses', `Data berhasil diekspor sebagai ${filename}`);
    },

    async exportToXLSX(filename, headers, data, footerData = null) {
        try { await ensureXLSX(); }
        catch (e) { this.ui.showModal('Error', 'Gagal memuat library Excel. Periksa koneksi internet.'); return; }
        const dataForSheet = data.map(row => {
            const newRow = {};
            headers.forEach(col => {
                const value = row[col.id];
                newRow[col.label] = col.isCurrency ? Number(value || 0) : value;
            });
            return newRow;
        });

        if (footerData) {
            const footerRow = {};
            headers.forEach(col => {
                 const value = footerData[col.id];
                footerRow[col.label] = col.isCurrency ? Number(value || 0) : (value || '');
            });
            dataForSheet.push(footerRow);
        }

        const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        XLSX.writeFile(workbook, filename);
        this.ui.showModal('Sukses', `Data berhasil diekspor sebagai ${filename}`);
    },

    // Batch Filter: ekstrak kode-kode (mis. RRN) dari teks mentah yang ditempel user, memakai
    // pola regex yang bisa dikonfigurasi. Grup tangkap pertama (jika ada) dipakai sebagai hasil,
    // kalau tidak ada grup tangkap maka seluruh teks yang cocok dipakai. Hasil di-dedupe & di-trim.
    extractBatchFilterCodes(rawText, patternStr) {
        const text = String(rawText || '');
        const pattern = String(patternStr || '').trim();
        if (!text.trim() || !pattern) return { codes: [], error: null };

        let regex;
        try {
            regex = new RegExp(pattern, 'g');
        } catch (e) {
            return { codes: [], error: `Pola regex tidak valid: ${e.message}` };
        }

        const codes = [];
        const seen = new Set();
        let match;
        let guard = 0;
        while ((match = regex.exec(text)) !== null && guard < 20000) {
            guard++;
            const raw = match[1] !== undefined ? match[1] : match[0];
            const code = String(raw || '').trim();
            const key = code.toLowerCase();
            if (code && !seen.has(key)) {
                seen.add(key);
                codes.push(code);
            }
            if (match.index === regex.lastIndex) regex.lastIndex++;
        }

        return { codes, error: null };
    },

    exportToJSON(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" });
        this.utils._downloadBlob(filename, blob);
        this.ui.showModal('Sukses', `Data berhasil diekspor sebagai ${filename}`);
    },

    async exportToPDF(title, headers, data, footerData = null) {
        try { await ensureJsPDF(); }
        catch (e) { this.ui.showModal('Error', 'Gagal memuat library PDF. Periksa koneksi internet.'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const tableHeaders = headers.map(h => h.label);
        const tableBody = data.map(row => headers.map(h => {
             const value = row[h.id];
             return h.isCurrency ? this.utils.formatCurrency(value) : String(value === null || value === undefined ? '' : value);
        }));

        let tableFooter = [];
        if (footerData) {
            const footerRow = headers.map(h => {
                const value = footerData[h.id];
                if (value === undefined) return '';
                return h.isCurrency ? this.utils.formatCurrency(value) : String(value);
            });
            tableFooter.push(footerRow);
        }

        doc.text(title, 14, 16);
        doc.autoTable({
            head: [tableHeaders],
            body: tableBody,
            foot: tableFooter,
            startY: 20,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [14, 165, 233] },
            footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' }
        });

        doc.save(`${title.replace(/\s/g, '_')}.pdf`);
        this.ui.showModal('Sukses', `Data berhasil diekspor sebagai PDF.`);
    },

    copyToClipboard(headers, data) {
        const delimiter = '\t';
        const headerRow = headers.map(col => col.label).join(delimiter);
        const dataRows = data.map(row => headers.map(col => row[col.id]).join(delimiter));
        const textToCopy = [headerRow, ...dataRows].join('\n');

        navigator.clipboard.writeText(textToCopy).then(() => {
            this.ui.showModal('Sukses', 'Data berhasil disalin ke clipboard.');
        }, (err) => {
            this.ui.showModal('Error', `Gagal menyalin data: ${err}`);
        });
    },

    async downloadChartReport(format = 'png') {
        try {
            await ensureHtml2canvas();
            if (format === 'pdf') await ensureJsPDF();
        } catch (e) {
            this.ui.showModal('Error', 'Gagal memuat library ekspor. Periksa koneksi internet.');
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'report-render-overlay';
        overlay.innerHTML = `<div id="report-render-content" class="text-center">
                                <i data-lucide="image" class="w-12 h-12 text-color-primary animate-pulse"></i>
                                <h2 class="text-xl font-display mt-4">Mempersiapkan Laporan...</h2>
                                <p class="text-text-secondary mt-1">Harap tunggu, ini mungkin memakan waktu beberapa saat.</p>
                             </div>`;
        document.body.appendChild(overlay);
        lucide.createIcons();

        const stagingArea = document.createElement('div');
        stagingArea.id = 'report-render-staging-area';
        stagingArea.style.position = 'absolute';
        stagingArea.style.left = '-9999px';
        stagingArea.style.top = '-9999px';
        stagingArea.style.width = '1920px';
        stagingArea.style.backgroundColor = '#ffffff';
        document.body.appendChild(stagingArea);

        try {
            // --- PERHITUNGAN DATA SESUAI FILTER ---
            const filteredData = this.handlers.getFilteredData();
            const aggregatedData = this.handlers.aggregateData(filteredData);
            const totalTransactionsFiltered = filteredData.length;
            const totalAdminFeeFiltered = Object.values(aggregatedData.byUser).reduce((sum, u) => sum + u.totalAdminFee, 0);
            const averageAdminFeeFiltered = totalTransactionsFiltered > 0 ? totalAdminFeeFiltered / totalTransactionsFiltered : 0;
            const totalCommissionFiltered = Object.values(aggregatedData.byUser).reduce((sum, u) => sum + u.commissionOutlet, 0);
            const topOutletFiltered = Object.entries(aggregatedData.byUser)
                .sort(([, a], [, b]) => b.commissionOutlet - a.commissionOutlet)[0];
            const topOutletName = topOutletFiltered ? topOutletFiltered[0] : 'N/A';
            const topOutletCommission = topOutletFiltered ? topOutletFiltered[1].commissionOutlet : 0;
            const manualTypeData = aggregatedData.byType['MANUAL'] || { count: 0, totalCommissionOutlet: 0 };
            const tiketTypeData = aggregatedData.byType['TIKET'] || { count: 0, totalCommissionOutlet: 0 };

            // --- PERHITUNGAN DATA BULAN INI ---
            const today = new Date();
            const { monthStartDay, monthEndDay, targetCommission } = this.state.settings;
            let mStart, mEnd;
            if (today.getDate() >= monthStartDay) {
                mStart = new Date(today.getFullYear(), today.getMonth(), monthStartDay);
                mEnd = new Date(today.getFullYear(), today.getMonth() + 1, monthEndDay, 23, 59, 59, 999);
            } else {
                mStart = new Date(today.getFullYear(), today.getMonth() - 1, monthStartDay);
                mEnd = new Date(today.getFullYear(), today.getMonth(), monthEndDay, 23, 59, 59, 999);
            }
            const mStartTs = mStart.getTime(), mEndTs = mEnd.getTime();
            const monthData = this.state.allData.filter(d => d._ts >= mStartTs && d._ts <= mEndTs);
            const monthAggregatedData = this.handlers.aggregateData(monthData);
            const totalMonthCommission = Object.values(monthAggregatedData.byUser).reduce((sum, u) => sum + u.commissionOutlet, 0);
            const commissionProgress = targetCommission > 0 ? Math.min((totalMonthCommission / targetCommission) * 100, 100) : 0;
            const activeOutletsMonth = Object.keys(monthAggregatedData.byUser).length;
            const top10OutletsThisMonth = Object.entries(monthAggregatedData.byUser)
                .sort(([, a], [, b]) => b.commissionOutlet - a.commissionOutlet)
                .slice(0, 10);
            const lowestOutletThisMonth = Object.entries(monthAggregatedData.byUser)
                .filter(([, data]) => data.commissionOutlet > 0)
                .sort(([, a], [, b]) => a.commissionOutlet - b.commissionOutlet)[0];
            const lowestOutletName = lowestOutletThisMonth ? lowestOutletThisMonth[0] : 'N/A';
            const lowestOutletCommission = lowestOutletThisMonth ? lowestOutletThisMonth[1].commissionOutlet : 0;


            const appName = this.state.settings.logoText || 'Laporan Grafik';
            const startDate = this.dom.filterStartDate.value;
            const endDate = this.dom.filterEndDate.value;
            const dateRangeText = (startDate && endDate)
                ? `Periode Data: ${startDate} hingga ${endDate}`
                : 'Menampilkan semua data';
            
            const reportHTML = `
                <div class="report-for-download">
                    <div class="report-header">
                        <h1>${appName}</h1>
                        <p>${dateRangeText}</p>
                    </div>
                    <div class="report-body">
                        <div class="report-main-content">
                            <div class="chart-panel">
                                <h2 class="chart-title">Komisi Outlet (Manual vs Tiket)</h2>
                                <canvas id="report-bar-chart-canvas" style="width: 100%; height: 550px;"></canvas>
                            </div>
                             <div class="report-table">
                                <h2 class="chart-title">Rincian Komisi Outlet Teratas Bulan Ini</h2>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Peringkat</th>
                                            <th>Nama Outlet</th>
                                            <th class="text-right">Jml. Transaksi</th>
                                            <th class="text-right">Komisi Manual</th>
                                            <th class="text-right">Komisi Tiket</th>
                                            <th class="text-right">Total Komisi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${top10OutletsThisMonth.map(([name, data], index) => `
                                            <tr>
                                                <td>${index + 1}</td>
                                                <td>${name}</td>
                                                <td class="text-right">${data.count.toLocaleString('id-ID')}</td>
                                                <td class="text-right">${this.utils.formatCurrency(data.commissionFromManual)}</td>
                                                <td class="text-right">${this.utils.formatCurrency(data.commissionFromTiket)}</td>
                                                <td class="text-right">${this.utils.formatCurrency(data.commissionOutlet)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="report-sidebar">
                             <div class="report-metrics">
                                <div class="metric-card">
                                    <h3>Progres Komisi (Bulan Ini)</h3>
                                    <p>${this.utils.formatCurrency(totalMonthCommission)}</p>
                                    <div class="report-progress-bar-container">
                                        <div class="report-progress-bar" style="width: ${commissionProgress.toFixed(2)}%;"></div>
                                    </div>
                                    <div class="report-progress-label">
                                        <span>Target: ${this.utils.formatCurrency(targetCommission)}</span>
                                        <span>${commissionProgress.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div class="metric-card">
                                    <h3>Outlet Aktif (Bulan Ini)</h3>
                                    <p>${activeOutletsMonth.toLocaleString('id-ID')}</p>
                                </div>
                                <div class="metric-card">
                                    <h3>Outlet Terendah (Bulan Ini)</h3>
                                     <p>${lowestOutletName}
                                        <span style="font-size: 1rem; color: #475569; font-family: var(--font-sans);">
                                        (${this.utils.formatCurrency(lowestOutletCommission)})
                                        </span>
                                    </p>
                                </div>
                                <div class="metric-card">
                                    <h3>Outlet Teratas (Sesuai Filter)</h3>
                                    <p>${topOutletName}
                                        <span style="font-size: 1rem; color: #475569; font-family: var(--font-sans);">
                                        (${this.utils.formatCurrency(topOutletCommission)})
                                        </span>
                                    </p>
                                </div>
                                <div class="metric-card">
                                    <h3>Total Transaksi (Sesuai Filter)</h3>
                                    <p>${totalTransactionsFiltered.toLocaleString('id-ID')}
                                        <span style="font-size: 1rem; color: #475569; font-family: var(--font-sans);">
                                        (Total Komisi: ${this.utils.formatCurrency(totalCommissionFiltered)})
                                        </span>
                                    </p>
                                </div>
                                 <div class="metric-card">
                                    <h3>TRX MANUAL (SESUAI FILTER)</h3>
                                    <p>${manualTypeData.count.toLocaleString('id-ID')}
                                        <span style="font-size: 1rem; color: #475569; font-family: var(--font-sans);">
                                        (${this.utils.formatCurrency(manualTypeData.totalCommissionOutlet)})
                                        </span>
                                    </p>
                                </div>
                                <div class="metric-card">
                                    <h3>TRX TIKET (SESUAI FILTER)</h3>
                                    <p>${tiketTypeData.count.toLocaleString('id-ID')}
                                        <span style="font-size: 1rem; color: #475569; font-family: var(--font-sans);">
                                        (${this.utils.formatCurrency(tiketTypeData.totalCommissionOutlet)})
                                        </span>
                                    </p>
                                </div>
                                <div class="metric-card">
                                    <h3>Rata-rata Biaya Admin (Sesuai Filter)</h3>
                                    <p>${this.utils.formatCurrency(averageAdminFeeFiltered)}</p>
                                </div>
                            </div>
                             <div class="chart-panel">
                                <h2 class="chart-title">Distribusi Transaksi</h2>
                                <canvas id="report-pie-chart-canvas" style="width: 100%; height: 300px;"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="report-footer">
                        Laporan ini dibuat pada: ${new Date().toLocaleString('id-ID')}
                    </div>
                </div>
            `;
            stagingArea.innerHTML = reportHTML;

            await new Promise(resolve => setTimeout(resolve, 50));

            const barChartRenderPromise = new Promise(resolve => {
                const barCtx = document.getElementById('report-bar-chart-canvas').getContext('2d');
                const { chartDataLimit } = this.state.settings;
                const sortedUsers = Object.entries(aggregatedData.byUser)
                    .filter(([, data]) => (data.commissionFromManual + data.commissionFromTiket) > 0)
                    .sort(([, a], [, b]) => (b.commissionOutlet) - (a.commissionOutlet))
                    .slice(0, chartDataLimit);
                
                const barOptions = this.ui.getChartOptions('bar', false);
                barOptions.animation = { onComplete: () => resolve() };

                new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: sortedUsers.map(([user]) => user.length > 15 ? user.substring(0, 12) + '...' : user),
                        datasets: [{
                            label: 'Komisi Manual',
                            data: sortedUsers.map(([, data]) => data.commissionFromManual),
                            backgroundColor: 'rgba(3, 105, 161, 0.8)',
                            datalabels: { display: false }
                        }, {
                            label: 'Komisi Tiket',
                            data: sortedUsers.map(([, data]) => data.commissionFromTiket),
                            backgroundColor: 'rgba(147, 51, 234, 0.8)',
                            datalabels: { display: true }
                        }, {
                           label: 'Total Komisi',
                           data: sortedUsers.map(([, data]) => data.commissionOutlet),
                           hidden: true,
                        }]
                    },
                    options: barOptions
                });
            });

            const pieChartRenderPromise = new Promise(resolve => {
                const pieCtx = document.getElementById('report-pie-chart-canvas').getContext('2d');
                const manualData = aggregatedData.byType['MANUAL'] || { count: 0 };
                const tiketData = aggregatedData.byType['TIKET'] || { count: 0 };

                const pieOptions = this.ui.getChartOptions('pie', false);
                pieOptions.animation = { onComplete: () => resolve() };

                new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Manual', 'Tiket'],
                        datasets: [{
                            data: [manualData.count, tiketData.count],
                            backgroundColor: ['rgba(3, 105, 161, 0.8)', 'rgba(147, 51, 234, 0.8)'],
                            borderColor: '#ffffff',
                            borderWidth: 4,
                        }]
                    },
                    plugins: [ChartDataLabels],
                    options: pieOptions
                });
            });
            
            await Promise.all([barChartRenderPromise, pieChartRenderPromise]);

            document.querySelector('#report-render-content h2').textContent = 'Mengambil Gambar Laporan...';
            
            const reportWrapper = stagingArea.querySelector('.report-for-download');
            const canvas = await html2canvas(reportWrapper, {
                scale: 5,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });

            const filename = `laporan_grafik_${startDate || 'awal'}_hingga_${endDate || 'akhir'}`;

            if (format === 'pdf') {
                const { jsPDF } = window.jspdf;
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'px',
                    format: [canvas.width, canvas.height]
                });
                pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
                pdf.save(`${filename}.pdf`);
            } else {
                const mimeType = `image/${format}`;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.95));
                this.utils._downloadBlob(`${filename}.${format}`, blob);
            }

            this.ui.showModal('Sukses', `Laporan ${format.toUpperCase()} berhasil dibuat.`);

        } catch (e) {
            console.error(`Gagal mengunduh laporan grafik sebagai ${format}:`, e);
            this.ui.showModal('Error', `Gagal membuat laporan: ${e.message}`);
        } finally {
            if (stagingArea) document.body.removeChild(stagingArea);
            if (overlay) document.body.removeChild(overlay);
        }
    },

    censorEmail(email) {
        if (!email || email.indexOf('@') === -1) return '******';
        const [user, domain] = email.split('@');
        if (user.length <= 2) return `${user.substring(0, 1)}***@${domain}`;
        return `${user.substring(0, 2)}***@${domain}`;
    },

    formatLogDetails(details) {
        if (!details || Object.keys(details).length === 0) {
            return '-';
        }
        return Object.entries(details)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
    }
};

