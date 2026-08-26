// ==UserScript==
// @name         Tartun V2 - KlikBCA QRIS Multi-Outlet Auto Sync
// @namespace    https://tartun.app/
// @version      3.0.0
// @description  Otomasi penarikan mutasi transaksi QRIS dari seluruh 45 outlet di qr.klikbca.com langsung ke sistem Tartun V2 dengan visual progress bar real-time
// @author       Tartun V2 AI
// @match        https://qr.klikbca.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @connect      bms.ebanksvc.bca.co.id
// @connect      qr.klikbca.com
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Konfigurasi Penyimpanan Lokal
    let config = {
        tartunUrl: GM_getValue('tartun_url', 'http://100.103.255.45:3000'),
        tartunToken: GM_getValue('tartun_token', ''),
        tartunEmail: GM_getValue('tartun_email', 'firz411@gmail.com'),
        tartunPassword: GM_getValue('tartun_password', 'FkOf2025'),
    };

    // 45 Daftar NMID & MID Lengkap
    let nmidList = [
        { mid: "004767950", nmid: "ID1026574479725", name: "ALFA 1 CELL" },
        { mid: "004767951", nmid: "ID1026574479691", name: "ALFA 2 CELL" },
        { mid: "004767952", nmid: "ID1026574479766", name: "ALFA 3 CELL" },
        { mid: "004767953", nmid: "ID1026574479709", name: "ALFA 4 CELL" },
        { mid: "004767954", nmid: "ID1026574479741", name: "ALFA 5 CELL" },
        { mid: "004767939", nmid: "ID1026574478578", name: "ALFA 6 CELL" },
        { mid: "004767940", nmid: "ID1026574478586", name: "ALFA 7 CELL" },
        { mid: "004767941", nmid: "ID1026574478594", name: "ASBER 1 CELL" },
        { mid: "004767942", nmid: "ID1026574478560", name: "ASBER 2 CELL" },
        { mid: "004769826", nmid: "ID1026575135805", name: "BAKSAR 1 CELL" },
        { mid: "004768126", nmid: "ID1026574492439", name: "BAKSAR 2 CELL" },
        { mid: "001776782", nmid: "ID1022223873046", name: "BANDAR KUOTA QR" },
        { mid: "004767943", nmid: "ID1026574478552", name: "BK 5 CIGER CELL" },
        { mid: "004769824", nmid: "ID1026575135789", name: "BK 6 PANGARITAN CELL" },
        { mid: "004769825", nmid: "ID1026575135821", name: "BK 7 NAGROG CELL" },
        { mid: "004768125", nmid: "ID1026574492447", name: "BK CIJAMBE CELL" },
        { mid: "004769819", nmid: "ID1026575060516", name: "BK CIPADUNG CELL" },
        { mid: "004768124", nmid: "ID1026574492462", name: "BK JH 2 CELL" },
        { mid: "004768123", nmid: "ID1026574492470", name: "BK SINOM CELL" },
        { mid: "004767944", nmid: "ID1026570614358", name: "BUNISARI CELL" },
        { mid: "004768127", nmid: "ID1026574492454", name: "CICUKANG CELL" },
        { mid: "004768128", nmid: "ID1026574480152", name: "CIHAURKUKU CELL" },
        { mid: "004769820", nmid: "ID1026575042621", name: "CIKADUT 2 CELL" },
        { mid: "004769821", nmid: "ID1026575042639", name: "CIKADUT CELL" },
        { mid: "004769822", nmid: "ID1026575042647", name: "CILENGKRANG 1 CELL" },
        { mid: "004769823", nmid: "ID1026575042654", name: "CILENGKRANG 2 CELL" },
        { mid: "004769827", nmid: "ID1026575042613", name: "CILENGKRANG 3 CELL" },
        { mid: "004769828", nmid: "ID1026575060524", name: "CILENGKRANG 4 CELL" },
        { mid: "004769829", nmid: "ID1026575060557", name: "CIPADUNG 2 CELL" },
        { mid: "004768130", nmid: "ID1026574487421", name: "CIPAGALO CELL" },
        { mid: "004769830", nmid: "ID1026575060532", name: "CIPOREAT CELL" },
        { mid: "004769831", nmid: "ID1026575060540", name: "CISARANTEN CELL" },
        { mid: "004768131", nmid: "ID1026574486258", name: "DM CELL" },
        { mid: "004768132", nmid: "ID1026574486274", name: "PADASUKA 1 CELL" },
        { mid: "004768133", nmid: "ID1026574486225", name: "PADASUKA 2 CELL" },
        { mid: "004768134", nmid: "ID1026574486241", name: "PADASUKA 3 CELL" },
        { mid: "004768135", nmid: "ID1026574486233", name: "PC 3 CELL" },
        { mid: "004768136", nmid: "ID1026574487462", name: "PC 4 CELL" },
        { mid: "004768137", nmid: "ID1026574487439", name: "PC 5 CELL" },
        { mid: "004768138", nmid: "ID1026574480095", name: "PERMATA CELL" },
        { mid: "001779652", nmid: "ID1022225940488", name: "POLICE CELL I QR" },
        { mid: "004768139", nmid: "ID1026574480137", name: "RAWA CELL" },
        { mid: "004768140", nmid: "ID1026574487447", name: "REOG CELL" },
        { mid: "004768141", nmid: "ID1026574480103", name: "SUKAPURA CELL" },
        { mid: "004769832", nmid: "ID1026575042605", name: "VIJAYA CELL" }
    ];

    // Data Sesi & Template API Internal KlikBCA yang Tertangkap
    let bcaApiTemplate = {
        lastUrl: null,
        lastHeaders: {},
        lastMethod: 'GET',
        lastBody: null,
        detectedAt: null
    };

    let isScanning = false;

    // 1. NETWORK INTERCEPTOR: MENANGKAP PERMINTAAN API KLIKBCA
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const url = args[0] ? (typeof args[0] === 'string' ? args[0] : args[0].url) : '';
            const options = args[1] || {};
            if (url && (url.includes('transaction') || url.includes('bms.ebanksvc') || url.includes('mutation') || url.includes('list'))) {
                saveApiTemplate(url, options.method || 'GET', options.headers || {}, options.body);
            }
        } catch (e) {}
        return originalFetch.apply(this, args);
    };

    const originalXHROpen = window.XMLHttpRequest.prototype.open;
    const originalXHRSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._method = method;
        this._headers = {};
        return originalXHROpen.apply(this, arguments);
    };

    const originalSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;
    window.XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (!this._headers) this._headers = {};
        this._headers[header] = value;
        return originalSetRequestHeader.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function(body) {
        if (this._url && (this._url.includes('transaction') || this._url.includes('bms.ebanksvc') || this._url.includes('mutation') || this._url.includes('list'))) {
            saveApiTemplate(this._url, this._method, this._headers, body);
        }
        return originalXHRSend.apply(this, arguments);
    };

    function saveApiTemplate(url, method, headers, body) {
        bcaApiTemplate.lastUrl = url;
        bcaApiTemplate.lastMethod = method || 'GET';
        bcaApiTemplate.lastHeaders = headers || {};
        bcaApiTemplate.lastBody = body || null;
        bcaApiTemplate.detectedAt = new Date();
        logTerminal(`🟢 Sesi BCA Tertangkap: ${url.split('?')[0]} [${bcaApiTemplate.lastMethod}]`, 'success');
        updateSessionIndicator(true, url);
    }

    // 2. DISPATCH REQUEST VIA GM_XMLHTTPREQUEST (BEBAS CORS & MEMBAWA COOKIES LENGKAP)
    function executeBcaApiRequest(url, method, headers, body) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: method,
                url: url,
                headers: {
                    ...headers,
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: body,
                timeout: 8000,
                onload: function(response) {
                    try {
                        if (response.status >= 200 && response.status < 300) {
                            const json = JSON.parse(response.responseText);
                            resolve(json);
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                        }
                    } catch (err) {
                        reject(new Error(`Gagal parse JSON: ${response.responseText.slice(0, 80)}`));
                    }
                },
                onerror: function(err) {
                    reject(new Error('Koneksi network BCA gagal'));
                },
                ontimeout: function() {
                    reject(new Error('BCA API Timeout (8s)'));
                }
            });
        });
    }

    // 3. PARSER JSON RESPONSE TRANSAKSI KLIKBCA
    function parseBcaTransactionJson(json, outlet) {
        const rows = [];
        if (!json) return rows;

        let list = [];
        if (Array.isArray(json)) list = json;
        else if (json.data && Array.isArray(json.data)) list = json.data;
        else if (json.transactions && Array.isArray(json.transactions)) list = json.transactions;
        else if (json.list && Array.isArray(json.list)) list = json.list;
        else if (json.detail && Array.isArray(json.detail)) list = json.detail;
        else if (json.content && Array.isArray(json.content)) list = json.content;

        list.forEach(item => {
            const amount = parseFloat(item.amount || item.nominal || item.jumlah || item.transAmount || 0);
            const rrn = item.rrn || item.referenceNo || item.refNo || item.retrievalReferenceNumber || '';
            const sender = item.customerName || item.senderName || item.issuer || item.description || item.keterangan || 'QRIS';
            const dateRaw = item.transactionDate || item.date || item.transDate || item.createdDate || item.tanggal || new Date().toISOString();

            if (amount > 0) {
                rows.push({
                    tanggal: new Date(dateRaw).toISOString(),
                    nama: outlet.nmid || outlet.name,
                    jumlah: amount,
                    keterangan: `TARTUN QR RRN:${rrn} Menerima pembayaran dari ${sender}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            }
        });
        return rows;
    }

    // 4. PARSER DOM (MEMBACA DATA DI LAYAR TAMPILAN AKTIF)
    function parseTransactionsFromDOM() {
        const items = [];
        const rawText = document.body.innerText;

        let currentNmid = '';
        let currentOutletName = '';
        const nmidMatch = rawText.match(/NMID\s*[:\s]*([ID\d]+)/i);
        if (nmidMatch) currentNmid = nmidMatch[1].trim();

        const outletHeaderMatch = rawText.match(/TOTAL TRANSAKSI\s+([^(]+)\(/i);
        if (outletHeaderMatch) currentOutletName = outletHeaderMatch[1].trim();

        const today = new Date();
        const selectedDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const blocks = rawText.split(/(?=RRN:\s*[\w\d]+)/gi);
        blocks.forEach(block => {
            if (!block.toLowerCase().includes('rrn:')) return;
            try {
                const rrnMatch = block.match(/RRN:\s*([^\s|]+)/i);
                const timeMatch = block.match(/\|\s*(\d{1,2})[.:](\d{1,2})/);
                const blockNmidMatch = block.match(/\(NMID:\s*([ID\d]+)\)/i);
                const nmid = blockNmidMatch ? blockNmidMatch[1].trim() : currentNmid;
                const descMatch = block.match(/Menerima pembayaran[^\n+]+/i);
                const desc = descMatch ? descMatch[0].trim() : 'Menerima pembayaran QRIS';

                const amountMatch = block.match(/\+\s*Rp\s*([\d.,]+)/i);
                if (!amountMatch) return;
                const amount = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.')) || 0;

                const rrn = rrnMatch ? rrnMatch[1].trim() : '';
                let hours = 0, minutes = 0;
                if (timeMatch) {
                    hours = parseInt(timeMatch[1], 10);
                    minutes = parseInt(timeMatch[2], 10);
                }

                const d = new Date(selectedDateStr);
                d.setHours(hours, minutes, 0, 0);

                items.push({
                    tanggal: d.toISOString(),
                    nama: nmid || currentOutletName || 'OUTLET QRIS',
                    jumlah: amount,
                    keterangan: `TARTUN QR RRN:${rrn} ${desc}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            } catch (e) {}
        });

        return items;
    }

    // 5. PENGIRIMAN HASIL BATCH KE TARTUN V2
    async function sendDataToTartun(rows) {
        if (!config.tartunToken) {
            logTerminal('🔑 Token belum ada. Melakukan login ke Tartun V2...', 'info');
            const ok = await loginToTartun();
            if (!ok) throw new Error('Gagal login ke Tartun V2. Periksa IP/URL server dan Password.');
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.tartunUrl.replace(/\/$/, '')}/api/transactions/bulk`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.tartunToken}`
                },
                data: JSON.stringify({ rows: rows }),
                onload: function(res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (res.status === 200 && json.success) {
                            resolve({ success: true, count: json.inserted || rows.length });
                        } else {
                            reject(new Error(json.error || res.statusText));
                        }
                    } catch (e) {
                        reject(new Error(`Error parse response Tartun: ${res.responseText.slice(0, 80)}`));
                    }
                },
                onerror: function(err) {
                    reject(new Error(`Tidak dapat menghubungi server Tartun di ${config.tartunUrl}`));
                }
            });
        });
    }

    async function loginToTartun() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.tartunUrl.replace(/\/$/, '')}/api/auth/login`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ email: config.tartunEmail, password: config.tartunPassword }),
                onload: function(res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (res.status === 200 && json.token) {
                            config.tartunToken = json.token;
                            GM_setValue('tartun_token', json.token);
                            logTerminal('✅ Sukses login ke Tartun V2.', 'success');
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                },
                onerror: () => resolve(false)
            });
        });
    }

    // 6. PROSES UTAMA: MENARIK SELURUH 45 OUTLET DENGAN LIVE PROGRESS
    async function startAutoPullAllOutlets() {
        if (isScanning) return;
        isScanning = true;
        setUiRunningState(true);

        logTerminal('========================================', 'info');
        logTerminal('🚀 MEMULAI PENARIKAN OTOMATIS 45 OUTLET', 'highlight');
        logTerminal(`📅 Tanggal Sesi: ${new Date().toLocaleDateString('id-ID')}`, 'info');
        logTerminal('========================================', 'info');

        let allCollectedRows = [];
        let totalNominal = 0;
        let successOutlets = 0;
        let emptyOutlets = 0;
        let errorOutlets = 0;

        const totalCount = nmidList.length;

        for (let i = 0; i < totalCount; i++) {
            const outlet = nmidList[i];
            const currentStep = i + 1;
            const percent = Math.round((currentStep / totalCount) * 100);

            updateProgressBar(currentStep, totalCount, percent, outlet.name);

            // Coba panggil via Direct BCA API jika template tersedia
            if (bcaApiTemplate.lastUrl) {
                try {
                    let targetUrl = bcaApiTemplate.lastUrl;
                    let targetBody = bcaApiTemplate.lastBody;

                    // Modifikasi URL / Body dengan NMID dan MID outlet
                    if (targetUrl.includes('nmid=')) {
                        targetUrl = targetUrl.replace(/nmid=[^&]+/i, `nmid=${outlet.nmid}`);
                    }
                    if (targetUrl.includes('mid=')) {
                        targetUrl = targetUrl.replace(/mid=[^&]+/i, `mid=${outlet.mid}`);
                    }
                    if (targetUrl.includes('merchantId=')) {
                        targetUrl = targetUrl.replace(/merchantId=[^&]+/i, `merchantId=${outlet.nmid}`);
                    }

                    if (targetBody && typeof targetBody === 'string') {
                        try {
                            const bodyJson = JSON.parse(targetBody);
                            if (bodyJson.nmid !== undefined) bodyJson.nmid = outlet.nmid;
                            if (bodyJson.mid !== undefined) bodyJson.mid = outlet.mid;
                            if (bodyJson.merchantId !== undefined) bodyJson.merchantId = outlet.nmid;
                            if (bodyJson.outletId !== undefined) bodyJson.outletId = outlet.nmid;
                            targetBody = JSON.stringify(bodyJson);
                        } catch (e) {}
                    }

                    const jsonResult = await executeBcaApiRequest(
                        targetUrl,
                        bcaApiTemplate.lastMethod,
                        bcaApiTemplate.lastHeaders,
                        targetBody
                    );

                    const rows = parseBcaTransactionJson(jsonResult, outlet);
                    if (rows.length > 0) {
                        const sumAmount = rows.reduce((s, r) => s + r.jumlah, 0);
                        totalNominal += sumAmount;
                        allCollectedRows.push(...rows);
                        successOutlets++;
                        logTerminal(`[${currentStep}/${totalCount}] ✓ ${outlet.name}: +${rows.length} trx (Rp ${sumAmount.toLocaleString('id-ID')})`, 'success');
                    } else {
                        emptyOutlets++;
                        logTerminal(`[${currentStep}/${totalCount}] ○ ${outlet.name}: 0 trx`, 'dim');
                    }

                } catch (err) {
                    errorOutlets++;
                    logTerminal(`[${currentStep}/${totalCount}] ⚠️ ${outlet.name}: ${err.message}`, 'error');
                }
            } else {
                // Fallback: Jika belum ada URL tertangkap, log peringatan
                logTerminal(`[${currentStep}/${totalCount}] ⚠️ Belum ada sesi API KlikBCA tertangkap. Klik salah satu menu tanggal di website terlebih dahulu.`, 'error');
                break;
            }

            updateLiveStats(allCollectedRows.length, totalNominal, successOutlets, errorOutlets);
            await new Promise(r => setTimeout(r, 120)); // Delay halus 120ms
        }

        // Jika Direct API berhasil mengumpulkan transaksi, kirim ke Tartun V2
        if (allCollectedRows.length > 0) {
            logTerminal('----------------------------------------', 'info');
            logTerminal(`📤 Mengirim ${allCollectedRows.length} transaksi ke Tartun V2 (${config.tartunUrl})...`, 'highlight');

            try {
                const res = await sendDataToTartun(allCollectedRows);
                logTerminal(`🎉 BERHASIL! ${res.count} transaksi tersimpan di database Tartun V2.`, 'success');
                alert(`🎉 SINKRONISASI SELESAI!\n\n• Total Outlet: ${totalCount}\n• Transaksi Ditemukan: ${allCollectedRows.length} Transaksi\n• Total Nominal: Rp ${totalNominal.toLocaleString('id-ID')}\n\nSemua data telah masuk ke Tartun V2.`);
            } catch (err) {
                logTerminal(`❌ GAGAL KIRIM KE TARTUN: ${err.message}`, 'error');
                alert(`Gagal mengirim data ke Tartun V2: ${err.message}`);
            }
        } else {
            // Jika kosong, coba ambil tampilan DOM saat ini sebagai cadangan
            const domRows = parseTransactionsFromDOM();
            if (domRows.length > 0) {
                logTerminal(`📍 Menemukan ${domRows.length} transaksi di tampilan aktif. Mengirim...`, 'info');
                try {
                    const res = await sendDataToTartun(domRows);
                    logTerminal(`✅ ${res.count} transaksi tampilan aktif terkirim.`, 'success');
                    alert(`✅ Sukses mengirim ${res.count} transaksi dari tampilan saat ini.`);
                } catch (e) {
                    logTerminal(`❌ Gagal: ${e.message}`, 'error');
                }
            } else {
                logTerminal('ℹ️ Selesai: Tidak ada transaksi QRIS pada tanggal ini.', 'dim');
                alert('Tidak ada transaksi QRIS yang ditemukan pada tanggal ini.');
            }
        }

        isScanning = false;
        setUiRunningState(false);
    }

    // 7. PEMBUATAN UI DASHBOARD MELAYANG (FLOATING HUD)
    function createTartunFloatingWidget() {
        if (document.getElementById('tartun-sync-widget')) return;

        const widget = document.createElement('div');
        widget.id = 'tartun-sync-widget';
        widget.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        widget.innerHTML = `
            <div id="tartun-widget-container" style="
                background: rgba(8, 12, 20, 0.97);
                backdrop-filter: blur(24px);
                border: 1px solid rgba(56, 189, 248, 0.35);
                border-radius: 16px;
                padding: 16px;
                width: 380px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8), 0 0 25px rgba(14, 165, 233, 0.25);
                color: #f8fafc;
                box-sizing: border-box;
            ">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span id="tartun-status-indicator" style="background: #eab308; width: 10px; height: 10px; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #eab308;"></span>
                        <strong style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: #38bdf8;">TARTUN V2 AUTO-SYNC</strong>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="tartun-btn-clear" title="Bersihkan Log" style="background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 12px;">🗑️</button>
                        <button id="tartun-toggle-min" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">−</button>
                    </div>
                </div>

                <!-- Body -->
                <div id="tartun-widget-body" style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- Server Settings -->
                    <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        <label style="font-size: 9.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Server Tartun V2 URL:</label>
                        <input type="text" id="tartun-server-url" value="${config.tartunUrl}" placeholder="http://100.103.255.45:3000" style="
                            width: 100%; background: rgba(0,0,0,0.5); border: 1px solid #334155; border-radius: 6px; padding: 5px 8px; color: #fff; font-size: 11px; margin-top: 2px; box-sizing: border-box;
                        ">
                    </div>

                    <!-- Progress Bar Container -->
                    <div id="tartun-progress-wrapper" style="display: none; background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; border-radius: 10px; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
                            <span id="tartun-progress-label" style="color: #38bdf8; font-weight: 700;">Memproses Outlet: -</span>
                            <span id="tartun-progress-pct" style="color: #a5f3fc; font-weight: 800;">0%</span>
                        </div>
                        <div style="background: #1e293b; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div id="tartun-progress-fill" style="background: linear-gradient(90deg, #0284c7, #10b981); height: 100%; width: 0%; transition: width 0.15s ease;"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; font-size: 10px; color: #94a3b8;">
                            <div>Transaksi: <strong id="tartun-stat-trx" style="color: #fff;">0</strong></div>
                            <div>Nominal: <strong id="tartun-stat-nom" style="color: #10b981;">Rp 0</strong></div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <button id="tartun-btn-sync-all" style="
                        background: linear-gradient(135deg, #0284c7, #06b6d4);
                        color: #ffffff;
                        font-weight: 800;
                        font-size: 12px;
                        border: none;
                        border-radius: 8px;
                        padding: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        box-shadow: 0 4px 15px rgba(6, 182, 212, 0.35);
                        transition: all 0.2s ease;
                    ">
                        ⚡ TARIK & SINKRONKAN SEMUA 45 OUTLET
                    </button>

                    <div style="display: flex; gap: 6px;">
                        <button id="tartun-btn-test-session" style="flex: 1; background: rgba(30, 41, 59, 0.8); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 6px; cursor: pointer;">
                            🔍 Tes Sesi BCA
                        </button>
                        <button id="tartun-btn-sync-current" style="flex: 1; background: rgba(30, 41, 59, 0.8); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 6px; cursor: pointer;">
                            📍 Layar Ini Saja
                        </button>
                    </div>

                    <!-- Terminal Console Box -->
                    <div id="tartun-terminal-box" style="
                        background: #030712;
                        border: 1px solid #1e293b;
                        border-radius: 8px;
                        padding: 8px;
                        font-size: 10.5px;
                        font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
                        color: #a5f3fc;
                        height: 110px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                        line-height: 1.4;
                    ">Siap sinkronisasi. Klik tombol biru di atas untuk menarik seluruh 45 outlet.</div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);

        // Bindings
        const minBtn = document.getElementById('tartun-toggle-min');
        const bodyEl = document.getElementById('tartun-widget-body');
        let isMin = false;
        minBtn.onclick = () => {
            isMin = !isMin;
            bodyEl.style.display = isMin ? 'none' : 'flex';
            minBtn.textContent = isMin ? '+' : '−';
        };

        document.getElementById('tartun-btn-clear').onclick = () => {
            const box = document.getElementById('tartun-terminal-box');
            if (box) box.innerHTML = 'Log dibersihkan.\n';
        };

        document.getElementById('tartun-server-url').onchange = (e) => {
            config.tartunUrl = e.target.value.trim();
            GM_setValue('tartun_url', config.tartunUrl);
        };

        // Tombol Tarik Semua
        document.getElementById('tartun-btn-sync-all').onclick = async () => {
            await startAutoPullAllOutlets();
        };

        // Tombol Tes Sesi BCA
        document.getElementById('tartun-btn-test-session').onclick = async () => {
            if (!bcaApiTemplate.lastUrl) {
                alert('⚠️ Belum ada sesi API KlikBCA yang terdeteksi.\nSilakan klik salah satu tanggal (misal 25 Agu) di layar terlebih dahulu.');
                return;
            }
            logTerminal('🔍 Menguji koneksi ke BCA untuk ALFA 1 CELL...', 'info');
            try {
                const outlet = nmidList[0];
                let targetUrl = bcaApiTemplate.lastUrl.replace(/nmid=[^&]+/i, `nmid=${outlet.nmid}`).replace(/mid=[^&]+/i, `mid=${outlet.mid}`);
                const json = await executeBcaApiRequest(targetUrl, bcaApiTemplate.lastMethod, bcaApiTemplate.lastHeaders, bcaApiTemplate.lastBody);
                const rows = parseBcaTransactionJson(json, outlet);
                logTerminal(`✅ Tes Berhasil! Mendapatkan ${rows.length} transaksi dari BCA.`, 'success');
                alert(`✅ Tes Berhasil!\nSesi BCA aktif dan berfungsi normal.\nMendapatkan ${rows.length} transaksi.`);
            } catch (err) {
                logTerminal(`❌ Tes Gagal: ${err.message}`, 'error');
                alert(`Tes Gagal: ${err.message}`);
            }
        };

        // Tombol Layar Ini Saja
        document.getElementById('tartun-btn-sync-current').onclick = async () => {
            const rows = parseTransactionsFromDOM();
            if (rows.length === 0) {
                alert('Tidak ada transaksi di layar saat ini.');
                return;
            }
            logTerminal(`🚀 Mengirim ${rows.length} transaksi dari layar ini...`, 'info');
            try {
                const res = await sendDataToTartun(rows);
                logTerminal(`✅ Berhasil mengirim ${res.count} transaksi ke Tartun V2.`, 'success');
                alert(`✅ Sukses mengirim ${res.count} transaksi.`);
            } catch (err) {
                logTerminal(`❌ Gagal: ${err.message}`, 'error');
                alert(`Gagal: ${err.message}`);
            }
        };
    }

    function logTerminal(msg, type = 'normal') {
        console.log(`[TartunSync] ${msg}`);
        const box = document.getElementById('tartun-terminal-box');
        if (!box) return;

        let color = '#a5f3fc';
        if (type === 'success') color = '#34d399';
        else if (type === 'error') color = '#f87171';
        else if (type === 'highlight') color = '#38bdf8';
        else if (type === 'dim') color = '#64748b';

        const time = new Date().toLocaleTimeString('id-ID');
        const entry = document.createElement('div');
        entry.style.color = color;
        entry.textContent = `[${time}] ${msg}`;
        box.appendChild(entry);
        box.scrollTop = box.scrollHeight;
    }

    function updateSessionIndicator(active, url) {
        const ind = document.getElementById('tartun-status-indicator');
        if (ind) {
            ind.style.background = active ? '#10b981' : '#eab308';
            ind.style.boxShadow = active ? '0 0 10px #10b981' : '0 0 8px #eab308';
        }
    }

    function setUiRunningState(running) {
        const btn = document.getElementById('tartun-btn-sync-all');
        const pWrapper = document.getElementById('tartun-progress-wrapper');
        if (btn) {
            btn.disabled = running;
            btn.innerHTML = running ? '⏳ SEDANG MENARIK 45 OUTLET...' : '⚡ TARIK & SINKRONKAN SEMUA 45 OUTLET';
            btn.style.opacity = running ? '0.7' : '1';
        }
        if (pWrapper) pWrapper.style.display = running ? 'block' : 'none';
    }

    function updateProgressBar(current, total, pct, outletName) {
        const fill = document.getElementById('tartun-progress-fill');
        const pctEl = document.getElementById('tartun-progress-pct');
        const lbl = document.getElementById('tartun-progress-label');
        if (fill) fill.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${pct}% (${current}/${total})`;
        if (lbl) lbl.textContent = `Memproses: ${outletName}`;
    }

    function updateLiveStats(trxCount, nominal, success, error) {
        const trxEl = document.getElementById('tartun-stat-trx');
        const nomEl = document.getElementById('tartun-stat-nom');
        if (trxEl) trxEl.textContent = `${trxCount} Transaksi (${success} Sukses, ${error} Gagal)`;
        if (nomEl) nomEl.textContent = `Rp ${nominal.toLocaleString('id-ID')}`;
    }

    window.addEventListener('load', () => setTimeout(createTartunFloatingWidget, 1200));
    setInterval(() => {
        if (!document.getElementById('tartun-sync-widget')) createTartunFloatingWidget();
    }, 3000);

})();
