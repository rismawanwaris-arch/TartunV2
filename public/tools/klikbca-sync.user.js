// ==UserScript==
// @name         Tartun V2 - KlikBCA QRIS Auto Sync
// @namespace    https://tartun.app/
// @version      1.0.0
// @description  Otomasi penarikan dan pengiriman mutasi transaksi QRIS dari qr.klikbca.com langsung ke sistem Tartun V2
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
        autoSync: GM_getValue('tartun_auto_sync', false)
    };

    // Buffer Penampung Data yang Tertangkap dari Network
    let capturedTransactions = [];

    // 1. INTERCEPT FETCH & XHR UNTUK MENANGKAP DATA API INTERNAL BCA SECARA PRESISI
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const clone = response.clone();
            const url = args[0] ? (typeof args[0] === 'string' ? args[0] : args[0].url) : '';
            if (url && (url.includes('transaction') || url.includes('mutation') || url.includes('history') || url.includes('qris') || url.includes('merchant'))) {
                clone.json().then(data => {
                    extractTransactionsFromPayload(data);
                }).catch(() => {});
            }
        } catch (e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener('load', function() {
            try {
                if (url && (url.includes('transaction') || url.includes('mutation') || url.includes('history') || url.includes('qris') || url.includes('merchant'))) {
                    const data = JSON.parse(this.responseText);
                    extractTransactionsFromPayload(data);
                }
            } catch (e) {}
        });
        return originalXHR.apply(this, arguments);
    };

    function extractTransactionsFromPayload(data) {
        if (!data) return;
        let list = [];
        if (Array.isArray(data)) list = data;
        else if (data.data && Array.isArray(data.data)) list = data.data;
        else if (data.transactions && Array.isArray(data.transactions)) list = data.transactions;
        else if (data.list && Array.isArray(data.list)) list = data.list;

        if (list.length > 0) {
            logStatus(`📡 Berhasil menangkap ${list.length} transaksi dari network response API.`);
            capturedTransactions = list;
            updateSyncButtonLabel(list.length);
        }
    }

    // 2. PARSER DOM (MEMBACA ELEMEN DI LAYAR JIKA DATA TAMPIL DI DOM)
    function parseTransactionsFromDOM() {
        const items = [];
        // Cari elemen-elemen kartu transaksi di layar
        const allTextElements = document.body.innerText;
        const blocks = allTextElements.split(/(?=RRN:\s*[\w\d]+)/gi);

        // Ambil info outlet aktif di header
        let activeNmid = '';
        let activeOutletName = '';
        const nmidMatch = document.body.innerText.match(/NMID\s*[:\s]*([ID\d]+)/i);
        if (nmidMatch) activeNmid = nmidMatch[1].trim();

        // Cari tombol/pilihan tanggal aktif di bar kalender
        let activeDateStr = '';
        const activeDateEl = document.querySelector('.active, [aria-selected="true"], [class*="selected"], [class*="active"]');
        const today = new Date();
        activeDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        blocks.forEach(block => {
            if (!block.toLowerCase().includes('rrn:')) return;

            try {
                // RRN & Jam
                const rrnMatch = block.match(/RRN:\s*([^\s|]+)/i);
                const timeMatch = block.match(/\|\s*(\d{1,2})[.:](\d{1,2})/);
                
                // NMID
                const blockNmidMatch = block.match(/\(NMID:\s*([ID\d]+)\)/i);
                const nmid = blockNmidMatch ? blockNmidMatch[1].trim() : activeNmid;

                // Nama Outlet di baris atas
                const outletMatch = block.match(/^([^\n(]+)\(NMID/m);
                const outletName = outletMatch ? outletMatch[1].replace(/RRN:.*?\n/i, '').trim() : '';

                // Keterangan Pembayaran
                const descMatch = block.match(/Menerima pembayaran[^\n+]+/i);
                const desc = descMatch ? descMatch[0].trim() : 'Menerima pembayaran QRIS';

                // Nominal Uang
                const amountMatch = block.match(/\+\s*Rp\s*([\d.,]+)/i);
                if (!amountMatch) return;
                const cleanAmount = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.')) || 0;

                const rrn = rrnMatch ? rrnMatch[1].trim() : '';
                let hours = 0, minutes = 0;
                if (timeMatch) {
                    hours = parseInt(timeMatch[1], 10);
                    minutes = parseInt(timeMatch[2], 10);
                }

                const d = new Date(activeDateStr);
                d.setHours(hours, minutes, 0, 0);

                items.push({
                    tanggal: d.toISOString(),
                    nama: nmid || outletName || 'OUTLET QRIS',
                    jumlah: cleanAmount,
                    keterangan: `TARTUN QR RRN:${rrn} ${desc}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            } catch (e) {
                console.error("Error parsing block:", e);
            }
        });

        return items;
    }

    // 3. PENGIRIMAN DATA KE TARTUN V2 API
    async function sendDataToTartun(rows) {
        if (!rows || rows.length === 0) {
            alert('⚠️ Tidak ada data transaksi yang ditemukan di halaman ini.');
            return;
        }

        if (!config.tartunToken) {
            logStatus('🔑 Token belum ada. Mencoba login otomatis ke Tartun V2...');
            const loggedIn = await performTartunLogin();
            if (!loggedIn) {
                alert('❌ Gagal login ke Tartun V2. Periksa URL, Email, dan Password di panel Tartun.');
                return;
            }
        }

        logStatus(`🚀 Mengirim ${rows.length} transaksi ke Tartun V2 (${config.tartunUrl})...`);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.tartunUrl.replace(/\/$/, '')}/api/transactions/bulk`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.tartunToken}`
                },
                data: JSON.stringify({ rows: rows }),
                onload: function(response) {
                    try {
                        const res = JSON.parse(response.responseText);
                        if (response.status === 200 && res.success) {
                            logStatus(`✅ SUKSES! ${res.inserted || rows.length} transaksi berhasil masuk ke Tartun V2!`);
                            showToast(`✅ ${res.inserted || rows.length} Data Berhasil Disinkronkan!`, 'success');
                            resolve(res);
                        } else if (response.status === 401) {
                            // Token kedaluwarsa, hapus dan coba login lagi
                            config.tartunToken = '';
                            GM_setValue('tartun_token', '');
                            logStatus('⚠️ Token kedaluwarsa. Silakan klik sinkron kembali untuk login ulang.');
                            reject(new Error('Unauthorized'));
                        } else {
                            logStatus(`❌ Gagal: ${res.error || response.statusText}`);
                            alert(`Gagal mengirim data: ${res.error || response.statusText}`);
                            reject(new Error(res.error));
                        }
                    } catch (e) {
                        logStatus(`❌ Error response: ${response.responseText}`);
                        reject(e);
                    }
                },
                onerror: function(err) {
                    logStatus(`❌ Error koneksi ke ${config.tartunUrl}`);
                    alert(`Tidak dapat menghubungi server Tartun V2 di ${config.tartunUrl}. Pastikan server aktif dan IP dapat diakses.`);
                    reject(err);
                }
            });
        });
    }

    async function performTartunLogin() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.tartunUrl.replace(/\/$/, '')}/api/auth/login`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    email: config.tartunEmail,
                    password: config.tartunPassword
                }),
                onload: function(response) {
                    try {
                        const res = JSON.parse(response.responseText);
                        if (response.status === 200 && res.token) {
                            config.tartunToken = res.token;
                            GM_setValue('tartun_token', res.token);
                            logStatus('✅ Berhasil login ke Tartun V2.');
                            resolve(true);
                        } else {
                            logStatus(`❌ Login gagal: ${res.error || 'Password salah'}`);
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                },
                onerror: function() {
                    logStatus('❌ Tidak dapat menghubungi server Tartun V2.');
                    resolve(false);
                }
            });
        });
    }

    // 4. OTOMASI BATCH: LOOP SELURUH OUTLET / NMID
    async function syncAllOutletsSequentially() {
        logStatus('⚡ Memulai penarikan otomatis seluruh outlet...');
        
        // Cari dropdown outlet di halaman
        const dropdownTrigger = document.querySelector('[class*="select"], [class*="dropdown"], [role="combobox"], [class*="merchant"]');
        if (!dropdownTrigger) {
            logStatus('⚠️ Dropdown outlet tidak ditemukan. Melakukan sinkronisasi halaman saat ini saja.');
            const rows = parseTransactionsFromDOM();
            await sendDataToTartun(rows);
            return;
        }

        // Trigger buka dropdown
        dropdownTrigger.click();
        await new Promise(r => setTimeout(r, 800));

        // Ambil semua item pilihan outlet
        const options = Array.from(document.querySelectorAll('[role="option"], [class*="option"], [class*="item"], [class*="menu-item"]'));
        logStatus(`📋 Ditemukan ${options.length} outlet pada akun KlikBCA ini.`);

        if (options.length === 0) {
            dropdownTrigger.click(); // tutup kembali
            const rows = parseTransactionsFromDOM();
            await sendDataToTartun(rows);
            return;
        }

        let totalSubmitted = 0;
        for (let i = 0; i < options.length; i++) {
            try {
                dropdownTrigger.click();
                await new Promise(r => setTimeout(r, 500));
                
                const currentOpts = Array.from(document.querySelectorAll('[role="option"], [class*="option"], [class*="item"], [class*="menu-item"]'));
                if (currentOpts[i]) {
                    const outletTitle = currentOpts[i].innerText.trim().replace(/\n/g, ' ');
                    logStatus(`[${i+1}/${options.length}] Membuka ${outletTitle}...`);
                    currentOpts[i].click();
                    
                    // Tunggu data ter-render
                    await new Promise(r => setTimeout(r, 1500));

                    const rows = parseTransactionsFromDOM();
                    if (rows.length > 0) {
                        await sendDataToTartun(rows);
                        totalSubmitted += rows.length;
                    } else {
                        logStatus(`ℹ️ Tidak ada transaksi untuk ${outletTitle}`);
                    }
                }
            } catch (err) {
                console.error("Error on outlet loop:", err);
            }
        }

        logStatus(`🎉 SELESAI! Total ${totalSubmitted} transaksi dari semua outlet telah dikirim ke Tartun V2.`);
        showToast(`🎉 Selesai! ${totalSubmitted} total transaksi disinkronkan.`, 'success');
    }

    // 5. UI FLOATING WIDGET TARTUN V2 DI WEBSITE KLIKBCA
    function createTartunFloatingWidget() {
        if (document.getElementById('tartun-sync-widget')) return;

        const widget = document.createElement('div');
        widget.id = 'tartun-sync-widget';
        widget.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
        `;

        widget.innerHTML = `
            <div id="tartun-widget-container" style="
                background: rgba(15, 23, 42, 0.95);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 16px;
                padding: 16px;
                width: 320px;
                box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 0 15px rgba(14, 165, 233, 0.3);
                color: #f8fafc;
                transition: all 0.3s ease;
            ">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: linear-gradient(135deg, #0284c7, #38bdf8); width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
                        <strong style="font-size: 14px; letter-spacing: 0.5px; color: #38bdf8;">TARTUN V2 SYNC</strong>
                    </div>
                    <button id="tartun-toggle-min" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;">−</button>
                </div>

                <!-- Body Controls -->
                <div id="tartun-widget-body" style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Server URL Tartun V2:</label>
                        <input type="text" id="tartun-server-url" value="${config.tartunUrl}" placeholder="http://100.103.255.45:3000" style="
                            width: 100%; background: rgba(0,0,0,0.4); border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; color: #fff; font-size: 12px; margin-top: 3px; box-sizing: border-box;
                        ">
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <div>
                            <label style="font-size: 10px; color: #94a3b8;">Email Login:</label>
                            <input type="text" id="tartun-server-email" value="${config.tartunEmail}" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid #334155; border-radius: 6px; padding: 4px 6px; color: #fff; font-size: 11px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-size: 10px; color: #94a3b8;">Password:</label>
                            <input type="password" id="tartun-server-pass" value="${config.tartunPassword}" style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid #334155; border-radius: 6px; padding: 4px 6px; color: #fff; font-size: 11px; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <button id="tartun-btn-sync-current" style="
                        background: linear-gradient(135deg, #0284c7, #0ea5e9);
                        color: #ffffff;
                        font-weight: 700;
                        border: none;
                        border-radius: 8px;
                        padding: 10px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
                        transition: all 0.2s ease;
                    ">
                        🚀 Sinkronkan Halaman Ini
                    </button>

                    <button id="tartun-btn-sync-all" style="
                        background: rgba(30, 41, 59, 0.8);
                        color: #38bdf8;
                        border: 1px solid rgba(56, 189, 248, 0.4);
                        font-weight: 600;
                        border-radius: 8px;
                        padding: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        transition: all 0.2s ease;
                    ">
                        ⚡ Auto-Tarik SEMUA Outlet (Batch)
                    </button>

                    <!-- Status Console -->
                    <div id="tartun-status-box" style="
                        background: rgba(0,0,0,0.6);
                        border: 1px solid #1e293b;
                        border-radius: 6px;
                        padding: 8px;
                        font-size: 11px;
                        font-family: monospace;
                        color: #a5f3fc;
                        min-height: 48px;
                        max-height: 80px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                    ">Siap sinkronisasi ke Tartun V2.</div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);

        // Event Listeners
        const minBtn = document.getElementById('tartun-toggle-min');
        const bodyEl = document.getElementById('tartun-widget-body');
        let isMinimized = false;

        minBtn.onclick = () => {
            isMinimized = !isMinimized;
            bodyEl.style.display = isMinimized ? 'none' : 'flex';
            minBtn.textContent = isMinimized ? '+' : '−';
        };

        const urlInput = document.getElementById('tartun-server-url');
        urlInput.onchange = () => {
            config.tartunUrl = urlInput.value.trim();
            GM_setValue('tartun_url', config.tartunUrl);
        };

        const emailInput = document.getElementById('tartun-server-email');
        emailInput.onchange = () => {
            config.tartunEmail = emailInput.value.trim();
            GM_setValue('tartun_email', config.tartunEmail);
        };

        const passInput = document.getElementById('tartun-server-pass');
        passInput.onchange = () => {
            config.tartunPassword = passInput.value.trim();
            GM_setValue('tartun_password', config.tartunPassword);
        };

        // Tombol Sinkron Halaman Ini
        document.getElementById('tartun-btn-sync-current').onclick = async () => {
            const rows = parseTransactionsFromDOM();
            logStatus(`🔍 Ditemukan ${rows.length} transaksi di tampilan saat ini.`);
            await sendDataToTartun(rows);
        };

        // Tombol Sinkron Semua Outlet
        document.getElementById('tartun-btn-sync-all').onclick = async () => {
            if (confirm('Mulai otomatisasi penarikan transaksi untuk seluruh outlet yang terdaftar di akun KlikBCA ini?')) {
                await syncAllOutletsSequentially();
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

    function updateSyncButtonLabel(count) {
        const btn = document.getElementById('tartun-btn-sync-current');
        if (btn) {
            btn.innerHTML = `🚀 Sinkronkan (${count} Transaksi Tertangkap)`;
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            background: ${type === 'success' ? '#059669' : '#0284c7'};
            color: #fff;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 10px 25px rgba(0,0,0,0.4);
            z-index: 1000000;
            animation: fadeIn 0.3s ease;
        `;
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Inisialisasi Widget saat DOM Siap
    window.addEventListener('load', () => {
        setTimeout(createTartunFloatingWidget, 1500);
    });

    // Fallback jika page SPA berganti rute
    setInterval(() => {
        if (!document.getElementById('tartun-sync-widget')) {
            createTartunFloatingWidget();
        }
    }, 3000);

})();
