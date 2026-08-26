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
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(value || 0);
    },

    formatDateForInput(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
        const { adminRules } = settings;
        const value = parseFloat(row.jumlah) || 0;
        const keterangan = String(row.keterangan || '').toUpperCase();
        let feeFromRules = 0;

        const matchingRules = adminRules
            .filter(rule => {
                const keywords = rule.keyword.split(',').map(k => k.trim().toUpperCase());
                return keywords.some(kw => keterangan.includes(kw));
            })
            .sort((a, b) => a.amount - b.amount);

        let ruleApplied = false;
        for (const rule of matchingRules) {
            if (Math.abs(value) <= rule.amount) {
                if (rule.feeType === 'percentage') {
                    feeFromRules = Math.round(Math.abs(value) * (rule.feeValue / 100));
                } else {
                    feeFromRules = rule.feeValue !== undefined ? rule.feeValue : rule.fee;
                }
                ruleApplied = true;
                break;
            }
        }

        if (!ruleApplied && matchingRules.length > 0) {
            const lastRule = matchingRules[matchingRules.length - 1];
            if (lastRule.feeType === 'percentage') {
                feeFromRules = Math.round(Math.abs(value) * (lastRule.feeValue / 100));
            } else {
                feeFromRules = lastRule.feeValue !== undefined ? lastRule.feeValue : lastRule.fee;
            }
        }

        let totalFee = feeFromRules;

        if (row.tipe_sheet === 'TIKET') {
            const feeFromTicketNominal = parseInt(String(Math.abs(value)).split('.')[0].slice(-3)) || 0;
            totalFee += feeFromTicketNominal;
        }

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

    exportToXLSX(filename, headers, data, footerData = null) {
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

    parseMerchantBcaWorkbook(workbook) {
        const allTransactions = [];
        const sheetNames = workbook.SheetNames || [];

        const bcaOutletToParentMap = {
            "ID1026574479725": "PARENT PASIRIMPUN ALFA1",
            "ALFA 1 CELL": "PARENT PASIRIMPUN ALFA1",
            "ID1026574479691": "PARENT SINJAY2 ALFA 2",
            "ALFA 2 CELL": "PARENT SINJAY2 ALFA 2",
            "ID1026574479766": "PARENT SINJAY1 ALFA 3",
            "ALFA 3 CELL": "PARENT SINJAY1 ALFA 3",
            "ID1026574479709": "PARENT PARAKANSAAT ALFA4",
            "ALFA 4 CELL": "PARENT PARAKANSAAT ALFA4",
            "ID1026574479741": "PARENT NAGROG1 ALFA 5",
            "ALFA 5 CELL": "PARENT NAGROG1 ALFA 5",
            "ID1026574478578": "PARENT CINANGKA ALFA 6",
            "ALFA 6 CELL": "PARENT CINANGKA ALFA 6",
            "ID1026574478586": "PARENT ALFA7 CINGISED",
            "ALFA 7 CELL": "PARENT ALFA7 CINGISED",
            "ID1026574478594": "PARENT ASBER 1",
            "ASBER 1 CELL": "PARENT ASBER 1",
            "ID1026574478560": "PARENT ASBER 2",
            "ASBER 2 CELL": "PARENT ASBER 2",
            "ID1026575135805": "PARENT BK8 BAKSAR",
            "BAKSAR 1 CELL": "PARENT BK8 BAKSAR",
            "ID1026574492439": "PARENT BK9 BAKSAR",
            "BAKSAR 2 CELL": "PARENT BK9 BAKSAR",
            "ID1022223873046": "BANDAR KUOTA QR",
            "BANDAR KUOTA QR": "BANDAR KUOTA QR",
            "ID1026574478552": "PARENT CIGER",
            "BK 5 CIGER CELL": "PARENT CIGER",
            "ID1026575135789": "PARENT PANGARITAN",
            "BK 6 PANGARITAN CELL": "PARENT PANGARITAN",
            "ID1026575135821": "PARENT NAGROG2 BK7",
            "BK 7 NAGROG CELL": "PARENT NAGROG2 BK7",
            "ID1026574492447": "PARENT PORTAL CJM",
            "BK CIJAMBE CELL": "PARENT PORTAL CJM",
            "ID1026575060516": "PARENT CIPADUNG",
            "BK CIPADUNG CELL": "PARENT CIPADUNG",
            "ID1026574492462": "PARENT JH2",
            "BK JH 2 CELL": "PARENT JH2",
            "ID1026574492470": "PARENT BK SINOM",
            "BK SINOM CELL": "PARENT BK SINOM",
            "ID1026570614358": "PARENT BUNISARI",
            "BUNISARI CELL": "PARENT BUNISARI",
            "ID1026574492454": "PARENT CICUKANG",
            "CICUKANG CELL": "PARENT CICUKANG",
            "ID1026574480152": "CIHAURKUKU CELL",
            "CIHAURKUKU CELL": "CIHAURKUKU CELL",
            "ID1026575042621": "PARENT CIKADUT 2",
            "CIKADUT 2 CELL": "PARENT CIKADUT 2",
            "ID1026575042639": "PARENT CIKADUT",
            "CIKADUT CELL": "PARENT CIKADUT",
            "ID1026575042647": "PARENT CILENGKRANG 1",
            "CILENGKRANG 1 CELL": "PARENT CILENGKRANG 1",
            "ID1026575042654": "CILENGKRANG 2 CELL",
            "CILENGKRANG 2 CELL": "CILENGKRANG 2 CELL",
            "ID1026575042613": "CILENGKRANG 3 CELL",
            "CILENGKRANG 3 CELL": "CILENGKRANG 3 CELL",
            "ID1026575060524": "CILENGKRANG 4 CELL",
            "CILENGKRANG 4 CELL": "CILENGKRANG 4 CELL",
            "ID1026575060557": "PARENT CIPADUNG2",
            "CIPADUNG 2 CELL": "PARENT CIPADUNG2",
            "ID1026574487421": "PARENT CIPAGALO",
            "CIPAGALO CELL": "PARENT CIPAGALO",
            "ID1026575060532": "CIPOREAT CELL",
            "CIPOREAT CELL": "CIPOREAT CELL",
            "ID1026575060540": "PARENT CISAR",
            "CISARANTEN CELL": "PARENT CISAR",
            "ID1026574486258": "PARENT DM",
            "DM CELL": "PARENT DM",
            "ID1026574486274": "PARENT PD1",
            "PADASUKA 1 CELL": "PARENT PD1",
            "ID1026574486225": "PARENT PADASUKA 2",
            "PADASUKA 2 CELL": "PARENT PADASUKA 2",
            "ID1026574486241": "PARENT PD3",
            "PADASUKA 3 CELL": "PARENT PD3",
            "ID1026574486233": "PARENT CJM PC3",
            "PC 3 CELL": "PARENT CJM PC3",
            "ID1026574487462": "PARENT OJEG PC4",
            "PC 4 CELL": "PARENT OJEG PC4",
            "ID1026574487439": "PARENT CIGENDING PC5",
            "PC 5 CELL": "PARENT CIGENDING PC5",
            "ID1026574480095": "PERMATA CELL",
            "PERMATA CELL": "PERMATA CELL",
            "ID1022225940488": "POLICE CELL I QR",
            "POLICE CELL I QR": "POLICE CELL I QR",
            "ID1026574480137": "RAWA CELL",
            "RAWA CELL": "RAWA CELL",
            "ID1026574480145": "PARENT RK",
            "RK CELL": "PARENT RK",
            "ID1026574487454": "PARENT SUKAASIH",
            "SA CELL": "PARENT SUKAASIH",
            "ID1026574487447": "PARENT SS",
            "SS CELL": "PARENT SS"
        };

        const consolidationMap = this.state?.settings?.nameConsolidation || {};

        sheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;

            const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (!rawRows || rawRows.length < 5) return;

            let headerRowIndex = -1;
            let colMap = {
                merchantName: 0,
                merchantId: 1,
                nmid: 2,
                amount: 6,
                date: 8,
                time: 9,
                rrn: 12,
                payerName: 14,
                paymentType: 17
            };

            for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
                const row = rawRows[r];
                if (Array.isArray(row)) {
                    const rowText = row.join(' ').toLowerCase();
                    if (rowText.includes('merchant name') || rowText.includes('original amount') || rowText.includes('transaction date')) {
                        headerRowIndex = r;
                        row.forEach((cellVal, colIdx) => {
                            const str = String(cellVal).trim().toLowerCase();
                            if (str.includes('merchant name')) colMap.merchantName = colIdx;
                            else if (str === 'merchant id') colMap.merchantId = colIdx;
                            else if (str.includes('national merchant id') || str.includes('nmid')) colMap.nmid = colIdx;
                            else if (str.includes('original amount') || str === 'amount' || str === 'nominal') colMap.amount = colIdx;
                            else if (str.includes('transaction date') || str === 'date' || str === 'tanggal') colMap.date = colIdx;
                            else if (str.includes('transaction time') || str === 'time' || str === 'jam') colMap.time = colIdx;
                            else if (str.includes('reference number') || str.includes('rrn')) colMap.rrn = colIdx;
                            else if (str.includes('payer name') || str.includes('customer name') || str.includes('nama pembayar')) colMap.payerName = colIdx;
                            else if (str.includes('payment type') || str.includes('payment method') || str.includes('issuer')) colMap.paymentType = colIdx;
                        });
                        break;
                    }
                }
            }

            if (headerRowIndex === -1) return;

            for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
                const row = rawRows[r];
                if (!row || !Array.isArray(row) || row.length === 0) continue;

                const merchantName = String(row[colMap.merchantName] || '').trim();
                if (!merchantName || merchantName.toLowerCase().startsWith('subtotal') || merchantName.toLowerCase().startsWith('total') || merchantName.toLowerCase().startsWith('note:')) {
                    continue;
                }

                const nmid = String(row[colMap.nmid] || '').trim();
                const rawAmount = String(row[colMap.amount] || '0').replace(/,/g, '');
                const amount = parseFloat(rawAmount) || 0;
                if (amount <= 0) continue;

                const rawDate = String(row[colMap.date] || '').trim();
                const rawTime = String(row[colMap.time] || '').replace(/wib/i, '').trim();
                const rrn = String(row[colMap.rrn] || '').trim();
                const payerName = String(row[colMap.payerName] || '').trim();
                const paymentType = String(row[colMap.paymentType] || '').trim();

                let d = new Date();
                if (rawDate) {
                    const dateParts = rawDate.split(/[\/\-.]/);
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0], 10);
                        const month = parseInt(dateParts[1], 10) - 1;
                        let year = parseInt(dateParts[2], 10);
                        if (year < 100) year += 2000;
                        d = new Date(year, month, day, 0, 0, 0, 0);
                    }
                }

                if (rawTime) {
                    const timeParts = rawTime.split(/[:.]/);
                    if (timeParts.length >= 2) {
                        const hours = parseInt(timeParts[0], 10) || 0;
                        const minutes = parseInt(timeParts[1], 10) || 0;
                        const seconds = timeParts.length >= 3 ? parseInt(timeParts[2], 10) || 0 : 0;
                        d.setHours(hours, minutes, seconds, 0);
                    }
                }

                let ketDetail = 'Menerima pembayaran';
                if (paymentType && payerName) {
                    ketDetail = `Menerima pembayaran dari ${paymentType} a.n. ${payerName}`;
                } else if (paymentType) {
                    ketDetail = `Menerima pembayaran dari ${paymentType}`;
                } else if (payerName) {
                    ketDetail = `Menerima pembayaran dari ${payerName}`;
                } else {
                    ketDetail = 'Menerima pembayaran QRIS';
                }

                // Resolusi Nama Outlet ke Nama Parent (Kanonik)
                let finalOutletName = consolidationMap[nmid.toUpperCase()] ||
                                      consolidationMap[merchantName.toUpperCase()] ||
                                      bcaOutletToParentMap[nmid] ||
                                      bcaOutletToParentMap[merchantName] ||
                                      merchantName ||
                                      nmid;

                allTransactions.push({
                    tanggal: d.toISOString(),
                    nama: finalOutletName,
                    jumlah: amount,
                    keterangan: `TARTUN QR RRN:${rrn} ${ketDetail}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            }
        });

        return allTransactions;
    },

    exportToJSON(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" });
        this.utils._downloadBlob(filename, blob);
        this.ui.showModal('Sukses', `Data berhasil diekspor sebagai ${filename}`);
    },

    exportToPDF(title, headers, data, footerData = null) {
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
        if (typeof html2canvas === 'undefined' || (format === 'pdf' && typeof window.jspdf === 'undefined')) {
            this.ui.showModal('Error', 'Library ekspor belum termuat. Coba lagi sesaat.');
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
            const monthData = this.state.allData.filter(d => {
                const rowDate = new Date(d.tanggal);
                return rowDate >= mStart && rowDate <= mEnd;
            });
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

