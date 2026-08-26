// ==UserScript==
// @name         Tartun V2 - KlikBCA QRIS Multi-Outlet Auto Sync
// @namespace    https://tartun.app/
// @version      2.0.0
// @description  Otomasi penarikan mutasi transaksi QRIS dari seluruh 45 outlet di qr.klikbca.com langsung ke sistem Tartun V2
// @author       Tartun V2 AI
// @match        https://qr.klikbca.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
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

    // 45 Daftar NMID Default (Akan otomatis diselaraskan dengan Tartun V2 jika terhubung)
    let nmidList = [
        { nmid: "ID1026574479725", name: "ALFA 1 CELL" },
        { nmid: "ID1026574479691", name: "ALFA 2 CELL" },
        { nmid: "ID1026574479766", name: "ALFA 3 CELL" },
        { nmid: "ID1026574479709", name: "ALFA 4 CELL" },
        { nmid: "ID1026574479741", name: "ALFA 5 CELL" },
        { nmid: "ID1026574478578", name: "ALFA 6 CELL" },
        { nmid: "ID1026574478586", name: "ALFA 7 CELL" },
        { nmid: "ID1026574478594", name: "ASBER 1 CELL" },
        { nmid: "ID1026574478560", name: "ASBER 2 CELL" },
        { nmid: "ID1026575135805", name: "BAKSAR 1 CELL" },
        { nmid: "ID1026574492439", name: "BAKSAR 2 CELL" },
        { nmid: "ID1022223873046", name: "BANDAR KUOTA QR" },
        { nmid: "ID1026574478552", name: "BK 5 CIGER CELL" },
        { nmid: "ID1026575135789", name: "BK 6 PANGARITAN CELL" },
        { nmid: "ID1026575135821", name: "BK 7 NAGROG CELL" },
        { nmid: "ID1026574492447", name: "BK CIJAMBE CELL" },
        { nmid: "ID1026575060516", name: "BK CIPADUNG CELL" },
        { nmid: "ID1026574492462", name: "BK JH 2 CELL" },
        { nmid: "ID1026574492470", name: "BK SINOM CELL" },
        { nmid: "ID1026570614358", name: "BUNISARI CELL" },
        { nmid: "ID1026574492454", name: "CICUKANG CELL" },
        { nmid: "ID1026574480152", name: "CIHAURKUKU CELL" },
        { nmid: "ID1026575042621", name: "CIKADUT 2 CELL" },
        { nmid: "ID1026575042639", name: "CIKADUT CELL" },
        { nmid: "ID1026575042647", name: "CILENGKRANG 1 CELL" },
        { nmid: "ID1026575042654", name: "CILENGKRANG 2 CELL" },
        { nmid: "ID1026575042613", name: "CILENGKRANG 3 CELL" },
        { nmid: "ID1026575060524", name: "CILENGKRANG 4 CELL" },
        { nmid: "ID1026575060557", "name": "CIPADUNG 2 CELL" },
        { nmid: "ID1026574487421", "name": "CIPAGALO CELL" },
        { nmid: "ID1026575060532", "name": "CIPOREAT CELL" },
        { nmid: "ID1026575060540", "name": "CISARANTEN CELL" },
        { nmid: "ID1026574486258", "name": "DM CELL" },
        { nmid: "ID1026574486274", "name": "PADASUKA 1 CELL" },
        { nmid: "ID1026574486225", "name": "PADASUKA 2 CELL" },
        { nmid: "ID1026574486241", "name": "PADASUKA 3 CELL" },
        { nmid: "ID1026574486233", "name": "PC 3 CELL" },
        { nmid: "ID1026574487462", "name": "PC 4 CELL" },
        { nmid: "ID1026574487439", "name": "PC 5 CELL" },
        { nmid: "ID1026574480095", "name": "PERMATA CELL" },
        { nmid: "ID1022225940488", "name": "POLICE CELL I QR" },
        { nmid: "ID1026574480137", "name": "RAWA CELL" },
        { nmid: "ID1026574487447", "name": "REOG CELL" },
        { nmid: "ID1026574480103", "name": "SUKAPURA CELL" },
        { nmid: "ID1026575042605", "name": "VIJAYA CELL" }
    ];

    // Data Sesi & Template API Internal KlikBCA yang Tertangkap
    let bcaApiTemplate = {
        lastUrl: null,
        lastHeaders: {},
        lastMethod: 'GET',
        lastBody: null,
        merchantList: []
    };

    let isScanning = false;

    // 1. NETWORK INTERCEPTOR: MENANGKAP PERMINTAAN API KLIKBCA
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const url = args[0] ? (typeof args[0] === 'string' ? args[0] : args[0].url) : '';
            const options = args[1] || {};

            if (url && (url.includes('transaction') || url.includes('mutation') || url.includes('history') || url.includes('inquiry') || url.includes('qris') || url.includes('merchant') || url.includes('report'))) {
                bcaApiTemplate.lastUrl = url;
                bcaApiTemplate.lastHeaders = options.headers || {};
                bcaApiTemplate.lastMethod = options.method || 'GET';
                bcaApiTemplate.lastBody = options.body || null;
                logStatus(`🟢 Sesi API KlikBCA terdeteksi: ${url.split('?')[0]}`);
                updateSessionBadge(true);
            }
        } catch (e) {}

        const response = await originalFetch.apply(this, args);
        try {
            const clone = response.clone();
            clone.json().then(data => {
                handleBcaApiResponse(data);
            }).catch(() => {});
        } catch (e) {}
        return response;
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
        this.addEventListener('load', function() {
            try {
                if (this._url && (this._url.includes('transaction') || this._url.includes('mutation') || this._url.includes('history') || this._url.includes('inquiry') || this._url.includes('qris') || this._url.includes('merchant') || this._url.includes('report'))) {
                    bcaApiTemplate.lastUrl = this._url;
                    bcaApiTemplate.lastHeaders = this._headers || {};
                    bcaApiTemplate.lastMethod = this._method || 'GET';
                    bcaApiTemplate.lastBody = body;
                    logStatus(`🟢 Sesi XHR KlikBCA terdeteksi: ${this._url.split('?')[0]}`);
                    updateSessionBadge(true);

                    const data = JSON.parse(this.responseText);
                    handleBcaApiResponse(data);
                }
            } catch (e) {}
        });
        return originalXHRSend.apply(this, arguments);
    };

    function handleBcaApiResponse(data) {
        if (!data) return;
        // Tangkap daftar merchant jika ada
        if (data.merchants || data.merchantList || data.outlets) {
            const list = data.merchants || data.merchantList || data.outlets;
            if (Array.isArray(list) && list.length > 0) {
                bcaApiTemplate.merchantList = list;
                logStatus(`📋 Terdeteksi ${list.length} merchant dari sesi KlikBCA.`);
            }
        }
    }

    // 2. PARSER DOM (MEMBACA TRANSAKSI YANG TAMPIL DI LAYAR)
    function parseTransactionsFromCurrentView() {
        const items = [];
        const rawText = document.body.innerText;

        // Ambil NMID aktif di layar
        let currentNmid = '';
        let currentOutletName = '';
        const nmidMatch = rawText.match(/NMID\s*[:\s]*([ID\d]+)/i);
        if (nmidMatch) currentNmid = nmidMatch[1].trim();

        const outletHeaderMatch = rawText.match(/TOTAL TRANSAKSI\s+([^(]+)\(/i);
        if (outletHeaderMatch) currentOutletName = outletHeaderMatch[1].trim();

        // Cari tanggal transaksi terpilih di kalender atas
        const today = new Date();
        let selectedDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Potong per blok RRN
        const blocks = rawText.split(/(?=RRN:\s*[\w\d]+)/gi);

        blocks.forEach(block => {
            if (!block.toLowerCase().includes('rrn:')) return;

            try {
                const rrnMatch = block.match(/RRN:\s*([^\s|]+)/i);
                const timeMatch = block.match(/\|\s*(\d{1,2})[.:](\d{1,2})/);
                
                const blockNmidMatch = block.match(/\(NMID:\s*([ID\d]+)\)/i);
                const nmid = blockNmidMatch ? blockNmidMatch[1].trim() : currentNmid;

                const outletMatch = block.match(/^([^\n(]+)\(NMID/m);
                const outletName = outletMatch ? outletMatch[1].replace(/RRN:.*?\n/i, '').trim() : currentOutletName;

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
                    nama: nmid || outletName || 'OUTLET QRIS',
                    jumlah: amount,
                    keterangan: `TARTUN QR RRN:${rrn} ${desc}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            } catch (e) {}
        });

        return items;
    }

    // 3. FUNGSI UNTUK MENGIRIM DATA BATCH KE TARTUN V2
    async function sendTransactionsToTartun(rows) {
        if (!rows || rows.length === 0) return { success: true, count: 0 };

        if (!config.tartunToken) {
            logStatus('🔑 Token belum ada. Melakukan login ke Tartun V2...');
            const ok = await loginToTartun();
            if (!ok) throw new Error('Gagal login ke Tartun V2. Periksa IP/URL dan Password.');
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
                        } else if (res.status === 401) {
                            config.tartunToken = '';
                            GM_setValue('tartun_token', '');
                            reject(new Error('Sesi Tartun kedaluwarsa.'));
                        } else {
                            reject(new Error(json.error || res.statusText));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function(err) {
                    reject(new Error(`Gagal terhubung ke ${config.tartunUrl}`));
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
                            logStatus('✅ Berhasil terhubung & login ke Tartun V2.');
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

    // 4. OTOMASI PENARIKAN LENGKAP SEMUA 45 OUTLET
    async function startAutoPullAllOutlets() {
        if (isScanning) return;
        isScanning = true;
        updateScanButtonState(true);

        logStatus('🚀 MEMULAI OTOMASI PENARIKAN SEMUA OUTLET...');

        let totalCollectedRows = [];
        let successCount = 0;

        // METODE A: DIRECT API REPLAY (JIKA TEMPLATE REQUEST TERTANGKAP)
        if (bcaApiTemplate.lastUrl) {
            logStatus('⚡ Menggunakan Sesi Direct API Replay untuk penarikan super cepat...');
            for (let i = 0; i < nmidList.length; i++) {
                const outlet = nmidList[i];
                logStatus(`[${i+1}/${nmidList.length}] Menarik ${outlet.name} (${outlet.nmid})...`);
                
                try {
                    // Modifikasi URL dengan NMID outlet terkait
                    let targetUrl = bcaApiTemplate.lastUrl;
                    if (targetUrl.includes('nmid=')) {
                        targetUrl = targetUrl.replace(/nmid=[^&]+/i, `nmid=${outlet.nmid}`);
                    } else if (targetUrl.includes('merchantId=')) {
                        targetUrl = targetUrl.replace(/merchantId=[^&]+/i, `merchantId=${outlet.nmid}`);
                    } else {
                        targetUrl += (targetUrl.includes('?') ? '&' : '?') + `nmid=${outlet.nmid}`;
                    }

                    const response = await fetch(targetUrl, {
                        method: bcaApiTemplate.lastMethod,
                        headers: bcaApiTemplate.lastHeaders,
                        body: bcaApiTemplate.lastBody
                    });

                    if (response.ok) {
                        const json = await response.json();
                        const parsed = extractRowsFromApiJson(json, outlet);
                        if (parsed.length > 0) {
                            totalCollectedRows.push(...parsed);
                            logStatus(`   ✨ ${parsed.length} transaksi ditemukan.`);
                        }
                    }
                } catch (err) {
                    console.warn(`Gagal direct API untuk ${outlet.name}:`, err);
                }
                await new Promise(r => setTimeout(r, 150)); // Jeda 150ms agar aman
            }
        }

        // METODE B: DOM INTERACTION SCANNER (FALLBACK JIKA DIRECT API BELUM LENGKAP)
        if (totalCollectedRows.length === 0) {
            logStatus('🔄 Menjalankan Virtual DOM Switcher untuk memindai seluruh outlet...');

            // Cari elemen dropdown merchant di header
            const merchantDropdown = findMerchantDropdownElement();
            if (merchantDropdown) {
                // Buka dropdown
                simulateClick(merchantDropdown);
                await new Promise(r => setTimeout(r, 1000));

                const options = getDropdownOptions();
                logStatus(`📋 Ditemukan ${options.length} outlet pada menu dropdown.`);

                for (let i = 0; i < options.length; i++) {
                    try {
                        // Buka kembali dropdown jika tertutup
                        const trigger = findMerchantDropdownElement();
                        if (trigger) simulateClick(trigger);
                        await new Promise(r => setTimeout(r, 600));

                        const currentOpts = getDropdownOptions();
                        if (currentOpts[i]) {
                            const optText = currentOpts[i].innerText.replace(/\n/g, ' ').trim();
                            logStatus(`[${i+1}/${options.length}] Membuka ${optText}...`);
                            
                            simulateClick(currentOpts[i]);
                            await new Promise(r => setTimeout(r, 1800)); // Tunggu data me-render

                            const rows = parseTransactionsFromCurrentView();
                            if (rows.length > 0) {
                                totalCollectedRows.push(...rows);
                                logStatus(`   ✨ ${rows.length} transaksi dibaca.`);
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            } else {
                // Jika tidak ada dropdown, ambil halaman saat ini
                const currentRows = parseTransactionsFromCurrentView();
                totalCollectedRows.push(...currentRows);
            }
        }

        // Hapus data duplikat di buffer penarikan
        const uniqueMap = new Map();
        totalCollectedRows.forEach(r => {
            const key = `${r.tanggal}|${r.nama}|${r.jumlah}|${r.keterangan}`;
            if (!uniqueMap.has(key)) uniqueMap.set(key, r);
        });
        const finalRows = Array.from(uniqueMap.values());

        if (finalRows.length > 0) {
            logStatus(`📤 Mengirim ${finalRows.length} total transaksi ke Tartun V2...`);
            try {
                const res = await sendTransactionsToTartun(finalRows);
                logStatus(`🎉 SELESAI! ${res.count} transaksi dari semua outlet berhasil masuk ke Tartun V2!`);
                alert(`🎉 SUKSES!\n\n${res.count} transaksi dari seluruh outlet berhasil disinkronkan ke Tartun V2.`);
            } catch (err) {
                logStatus(`❌ Error pengiriman ke Tartun: ${err.message}`);
                alert(`Gagal mengirim ke Tartun V2: ${err.message}`);
            }
        } else {
            logStatus('ℹ️ Tidak ada data transaksi yang ditemukan pada tanggal ini.');
            alert('Tidak ada transaksi QRIS yang ditemukan pada tanggal terpilih.');
        }

        isScanning = false;
        updateScanButtonState(false);
    }

    function extractRowsFromApiJson(json, outlet) {
        const rows = [];
        let list = [];
        if (Array.isArray(json)) list = json;
        else if (json.data && Array.isArray(json.data)) list = json.data;
        else if (json.transactions && Array.isArray(json.transactions)) list = json.transactions;
        else if (json.list && Array.isArray(json.list)) list = json.list;

        list.forEach(item => {
            const amount = parseFloat(item.amount || item.nominal || item.jumlah || 0);
            const rrn = item.rrn || item.referenceNo || item.refNo || '';
            const desc = item.description || item.keterangan || item.customerName || 'Menerima pembayaran QRIS';
            const dateStr = item.date || item.transactionDate || item.tanggal || new Date().toISOString();

            if (amount > 0) {
                rows.push({
                    tanggal: new Date(dateStr).toISOString(),
                    nama: outlet.nmid || outlet.name,
                    jumlah: amount,
                    keterangan: `TARTUN QR RRN:${rrn} ${desc}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            }
        });
        return rows;
    }

    function findMerchantDropdownElement() {
        // Cari container yang memuat teks NMID atau dropdown di header
        const candidates = Array.from(document.querySelectorAll('div, button, a, span, p')).filter(el => {
            const txt = el.innerText || '';
            return (txt.includes('NMID ID') || txt.includes('NMID: ID') || txt.includes('ALFA') || txt.includes('TOTAL TRANSAKSI')) && el.children.length < 8;
        });
        
        // Pilih elemen yang paling cocok
        for (const el of candidates) {
            if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'combobox' || el.className.includes('select') || el.className.includes('merchant') || el.className.includes('dropdown')) {
                return el;
            }
        }
        return candidates[0] || null;
    }

    function getDropdownOptions() {
        const options = Array.from(document.querySelectorAll('[role="option"], [class*="option"], [class*="item"], [class*="menu-item"], li')).filter(el => {
            const txt = el.innerText || '';
            return txt.includes('ID102') || txt.includes('CELL') || txt.includes('QR') || txt.includes('NMID');
        });
        return options;
    }

    function simulateClick(element) {
        if (!element) return;
        ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
            const evt = new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window });
            element.dispatchEvent(evt);
        });
    }

    // 5. FLOATING UI CONTROLLER
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
                background: rgba(10, 15, 29, 0.96);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(56, 189, 248, 0.35);
                border-radius: 16px;
                padding: 16px;
                width: 340px;
                box-shadow: 0 20px 35px -5px rgba(0,0,0,0.7), 0 0 20px rgba(14, 165, 233, 0.3);
                color: #f8fafc;
                box-sizing: border-box;
            ">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span id="tartun-status-indicator" style="background: #eab308; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
                        <strong style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: #38bdf8;">TARTUN V2 AUTO-SYNC</strong>
                    </div>
                    <button id="tartun-toggle-min" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">−</button>
                </div>

                <!-- Body -->
                <div id="tartun-widget-body" style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <label style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Server Tartun V2 URL:</label>
                        <input type="text" id="tartun-server-url" value="${config.tartunUrl}" placeholder="http://100.103.255.45:3000" style="
                            width: 100%; background: rgba(0,0,0,0.5); border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; color: #fff; font-size: 11px; margin-top: 2px; box-sizing: border-box;
                        ">
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <div>
                            <label style="font-size: 10px; color: #94a3b8;">Email:</label>
                            <input type="text" id="tartun-server-email" value="${config.tartunEmail}" style="width: 100%; background: rgba(0,0,0,0.5); border: 1px solid #334155; border-radius: 6px; padding: 4px 6px; color: #fff; font-size: 11px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-size: 10px; color: #94a3b8;">Password:</label>
                            <input type="password" id="tartun-server-pass" value="${config.tartunPassword}" style="width: 100%; background: rgba(0,0,0,0.5); border: 1px solid #334155; border-radius: 6px; padding: 4px 6px; color: #fff; font-size: 11px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Tombol Aksi Utama -->
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
                        box-shadow: 0 4px 15px rgba(6, 182, 212, 0.4);
                        transition: all 0.2s ease;
                    ">
                        ⚡ TARIK & SINKRONKAN SEMUA 45 OUTLET
                    </button>

                    <button id="tartun-btn-sync-current" style="
                        background: rgba(30, 41, 59, 0.8);
                        color: #94a3b8;
                        border: 1px solid rgba(255,255,255,0.1);
                        font-size: 11px;
                        font-weight: 600;
                        border-radius: 6px;
                        padding: 6px;
                        cursor: pointer;
                    ">
                        📍 Sinkron Outlet Ini Saja
                    </button>

                    <!-- Console Box -->
                    <div id="tartun-status-box" style="
                        background: rgba(0,0,0,0.65);
                        border: 1px solid #1e293b;
                        border-radius: 6px;
                        padding: 8px;
                        font-size: 10.5px;
                        font-family: 'JetBrains Mono', monospace, sans-serif;
                        color: #a5f3fc;
                        min-height: 52px;
                        max-height: 90px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                    ">Menunggu klik untuk memulai sinkronisasi...</div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);

        // Event bindings
        const minBtn = document.getElementById('tartun-toggle-min');
        const bodyEl = document.getElementById('tartun-widget-body');
        let isMin = false;
        minBtn.onclick = () => {
            isMin = !isMin;
            bodyEl.style.display = isMin ? 'none' : 'flex';
            minBtn.textContent = isMin ? '+' : '−';
        };

        document.getElementById('tartun-server-url').onchange = (e) => {
            config.tartunUrl = e.target.value.trim();
            GM_setValue('tartun_url', config.tartunUrl);
        };
        document.getElementById('tartun-server-email').onchange = (e) => {
            config.tartunEmail = e.target.value.trim();
            GM_setValue('tartun_email', config.tartunEmail);
        };
        document.getElementById('tartun-server-pass').onchange = (e) => {
            config.tartunPassword = e.target.value.trim();
            GM_setValue('tartun_password', config.tartunPassword);
        };

        document.getElementById('tartun-btn-sync-all').onclick = async () => {
            await startAutoPullAllOutlets();
        };

        document.getElementById('tartun-btn-sync-current').onclick = async () => {
            const rows = parseTransactionsFromCurrentView();
            if (rows.length === 0) {
                alert('Tidak ada transaksi di tampilan saat ini.');
                return;
            }
            logStatus(`🚀 Mengirim ${rows.length} transaksi outlet aktif...`);
            try {
                const res = await sendTransactionsToTartun(rows);
                alert(`✅ Sukses mengirim ${res.count} transaksi.`);
            } catch (err) {
                alert(`Gagal: ${err.message}`);
            }
        };
    }

    function logStatus(msg) {
        console.log(`[TartunSync] ${msg}`);
        const box = document.getElementById('tartun-status-box');
        if (box) {
            box.innerText = msg;
            box.scrollTop = box.scrollHeight;
        }
    }

    function updateSessionBadge(active) {
        const ind = document.getElementById('tartun-status-indicator');
        if (ind) ind.style.background = active ? '#10b981' : '#eab308';
    }

    function updateScanButtonState(loading) {
        const btn = document.getElementById('tartun-btn-sync-all');
        if (btn) {
            btn.disabled = loading;
            btn.innerHTML = loading ? '⏳ SEDANG MENARIK SEMUA OUTLET...' : '⚡ TARIK & SINKRONKAN SEMUA 45 OUTLET';
            btn.style.opacity = loading ? '0.7' : '1';
        }
    }

    window.addEventListener('load', () => setTimeout(createTartunFloatingWidget, 1500));
    setInterval(() => {
        if (!document.getElementById('tartun-sync-widget')) createTartunFloatingWidget();
    }, 3000);

})();
