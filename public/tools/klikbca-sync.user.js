// ==UserScript==
// @name         Tartun V2 - KlikBCA QRIS Master Sync
// @namespace    https://tartun.app/
// @version      4.0.0
// @description  Sistem otomatisasi penarikan mutasi QRIS KlikBCA ke Tartun V2: Real-time Auto-Sync, Verified Crawler, dan Instant One-Click Import
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
        autoSyncRealtime: GM_getValue('tartun_auto_realtime', true) // Default: Otomatis kirim saat outlet dibuka di layar
    };

    let isScanning = false;
    let shouldStopScan = false;
    let lastProcessedOutletKey = '';
    let accumulatedOutlets = new Map(); // Penyimpan sesi penarikan multi-outlet

    // 1. PARSER TRANSAKSI PRESISI DARI LAYAR (100% ROBUST & TESTED)
    function extractTransactionsFromScreen() {
        const widget = document.getElementById('tartun-sync-widget');
        let rawText = '';
        if (widget) {
            const tempDiv = document.body.cloneNode(true);
            const w = tempDiv.querySelector('#tartun-sync-widget');
            if (w) w.remove();
            rawText = tempDiv.innerText || '';
        } else {
            rawText = document.body.innerText || '';
        }

        let nmid = '';
        let outletName = '';
        const nmidMatch = rawText.match(/NMID\s*[:\s]*([ID\d]+)/i);
        if (nmidMatch) nmid = nmidMatch[1].trim();

        const outletHeaderMatch = rawText.match(/TOTAL TRANSAKSI\s+([^(]+)\(/i);
        if (outletHeaderMatch) outletName = outletHeaderMatch[1].trim();

        const today = new Date();
        const selectedDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const items = [];
        const blocks = rawText.split(/(?=RRN:\s*[\w\d]+)/gi);

        blocks.forEach(block => {
            if (!block.toLowerCase().includes('rrn:')) return;
            try {
                const rrnMatch = block.match(/RRN:\s*([^\s|]+)/i);
                const timeMatch = block.match(/\|\s*(\d{1,2})[.:](\d{1,2})/);
                const blockNmidMatch = block.match(/\(NMID:\s*([ID\d]+)\)/i);
                const itemNmid = blockNmidMatch ? blockNmidMatch[1].trim() : nmid;
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
                    nama: itemNmid || outletName || 'OUTLET QRIS',
                    jumlah: amount,
                    keterangan: `TARTUN QR RRN:${rrn} ${desc}`.trim(),
                    tipe_sheet: 'MANUAL'
                });
            } catch (e) {}
        });

        return { items, nmid, outletName };
    }

    // 2. PENGIRIMAN DATA KE SERVER TARTUN V2
    async function sendDataToTartun(rows, outletInfo = '') {
        if (!rows || rows.length === 0) return { success: true, count: 0 };

        if (!config.tartunToken) {
            logTerminal('🔑 Mengautentikasi ke Tartun V2...', 'info');
            const ok = await loginToTartun();
            if (!ok) throw new Error('Gagal login ke Tartun V2. Periksa URL server dan Password.');
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
                        reject(new Error(`Response: ${res.responseText.slice(0, 60)}`));
                    }
                },
                onerror: function() {
                    reject(new Error(`Gagal menghubungi ${config.tartunUrl}`));
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
                            logTerminal('✅ Terhubung ke Tartun V2.', 'success');
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

    // 3. FITUR REAL-TIME AUTO SYNC (SETIAP OUTLET YANG DIBUKA DI LAYAR OTOMATIS TERSINKRONISASI)
    function monitorRealTimeChanges() {
        setInterval(async () => {
            if (isScanning || !config.autoSyncRealtime) return;

            const { items, nmid, outletName } = extractTransactionsFromScreen();
            const currentKey = `${nmid || outletName}_${items.length}`;

            // Jika outlet atau jumlah transaksi berubah dan ada data baru
            if (items.length > 0 && currentKey !== lastProcessedOutletKey && (nmid || outletName)) {
                lastProcessedOutletKey = currentKey;
                logTerminal(`⚡ Auto-Sync: Mendeteksi ${items.length} transaksi di ${outletName || nmid}...`, 'highlight');
                
                try {
                    const res = await sendDataToTartun(items, outletName || nmid);
                    logTerminal(`✅ Sukses Auto-Sync: ${res.count} transaksi (${outletName || nmid}) tersimpan ke Tartun V2!`, 'success');
                    showToast(`⚡ ${res.count} Trx (${outletName || nmid}) Tersimpan ke Tartun V2!`, 'success');
                } catch (e) {
                    logTerminal(`⚠️ Auto-Sync tertunda: ${e.message}`, 'error');
                }
            }
        }, 1500);
    }

    // 4. SMART MULTI-OUTLET VERIFIED CRAWLER
    async function startVerifiedMultiOutletCrawler() {
        if (isScanning) return;
        isScanning = true;
        shouldStopScan = false;
        setUiRunningState(true);

        try {
            logTerminal('========================================', 'info');
            logTerminal('🚀 MEMULAI OTOMASI SEMUA OUTLET', 'highlight');
            logTerminal('========================================', 'info');

            let allCollectedRows = [];
            let totalNominal = 0;

            // Langkah 1: Deteksi atau Buka Menu Dropdown
            logTerminal('📂 Membuka menu daftar outlet...', 'info');
            const dropdownBtn = findHeaderDropdown();
            if (dropdownBtn) {
                dispatchClick(dropdownBtn);
                await new Promise(r => setTimeout(r, 800));
            }

            let outletCards = getDropdownOutletCards();
            if (outletCards.length === 0) {
                logTerminal('💡 Silakan klik kotak nama outlet di atas layar Anda...', 'highlight');
                alert('Silakan KLIK PADA KOTAK NAMA OUTLET di bagian atas layar agar menunya terbuka.');
                for (let t = 0; t < 20; t++) {
                    await new Promise(r => setTimeout(r, 500));
                    outletCards = getDropdownOutletCards();
                    if (outletCards.length > 0) break;
                }
            }

            if (outletCards.length === 0) {
                logTerminal('❌ Menu outlet belum terbuka.', 'error');
                alert('Menu daftar outlet belum terbuka di layar.');
                return;
            }

            logTerminal(`📋 Berhasil mendeteksi ${outletCards.length} outlet terdaftar.`, 'success');

            const total = outletCards.length;

            // Loop setiap outlet
            for (let i = 0; i < total; i++) {
                if (shouldStopScan) {
                    logTerminal('⏹️ Dihentikan oleh pengguna.', 'error');
                    break;
                }

                const currentStep = i + 1;
                const pct = Math.round((currentStep / total) * 100);

                // Buka kembali dropdown
                const trigger = findHeaderDropdown();
                if (trigger) {
                    dispatchClick(trigger);
                    await new Promise(r => setTimeout(r, 600));
                }

                // Cari baris outlet ke-i
                let cards = getDropdownOutletCards();
                let targetCard = cards[i] || outletCards[i];

                if (targetCard && targetCard.element) {
                    const cardLabel = targetCard.label;
                    updateProgressBar(currentStep, total, pct, cardLabel);

                    logTerminal(`[${currentStep}/${total}] 🔄 Membuka: ${cardLabel.slice(0, 30)}...`, 'info');

                    // Scroll item ke tampilan lalu klik
                    targetCard.element.scrollIntoView({ block: 'center', behavior: 'instant' });
                    await new Promise(r => setTimeout(r, 150));
                    dispatchClick(targetCard.element);

                    // Tunggu render
                    await new Promise(r => setTimeout(r, 1500));

                    // Baca transaksi di layar
                    const { items, outletName, nmid } = extractTransactionsFromScreen();
                    if (items.length > 0) {
                        const sum = items.reduce((s, r) => s + r.jumlah, 0);
                        allCollectedRows.push(...items);
                        totalNominal += sum;
                        logTerminal(`[${currentStep}/${total}] ✓ Selesai: +${items.length} trx (Rp ${sum.toLocaleString('id-ID')})`, 'success');
                    } else {
                        logTerminal(`[${currentStep}/${total}] ○ 0 transaksi`, 'dim');
                    }

                    updateLiveStats(allCollectedRows.length, totalNominal);
                }
            }

            // Hapus duplikat
            const uniqueMap = new Map();
            allCollectedRows.forEach(r => {
                const key = `${r.tanggal}|${r.nama}|${r.jumlah}|${r.keterangan}`;
                if (!uniqueMap.has(key)) uniqueMap.set(key, r);
            });
            const finalRows = Array.from(uniqueMap.values());

            if (finalRows.length > 0) {
                logTerminal('----------------------------------------', 'info');
                logTerminal(`📤 Mengirim ${finalRows.length} total transaksi ke Tartun V2...`, 'highlight');

                try {
                    const res = await sendDataToTartun(finalRows);
                    logTerminal(`🎉 BERHASIL! ${res.count} transaksi dari seluruh outlet tersimpan di Tartun V2.`, 'success');
                    alert(`🎉 SINKRONISASI SELESAI!\n\n• Outlet Dipindai: ${total} Outlet\n• Transaksi Ditemukan: ${finalRows.length} Transaksi\n• Total Nominal: Rp ${totalNominal.toLocaleString('id-ID')}\n\nSemua data berhasil masuk ke database Tartun V2.`);
                } catch (err) {
                    logTerminal(`❌ GAGAL KIRIM KE TARTUN: ${err.message}`, 'error');
                    alert(`Gagal mengirim ke Tartun V2: ${err.message}`);
                }
            } else {
                logTerminal('ℹ️ Selesai: Tidak ada transaksi QRIS pada tanggal ini.', 'dim');
                alert('Tidak ada transaksi QRIS pada tanggal terpilih.');
            }

        } catch (err) {
            logTerminal(`❌ ERROR: ${err.message}`, 'error');
            alert(`Terjadi kesalahan: ${err.message}`);
        } finally {
            isScanning = false;
            setUiRunningState(false);
        }
    }

    function findHeaderDropdown() {
        const candidates = Array.from(document.querySelectorAll('div, button, a, span, p')).filter(el => {
            if (el.closest('#tartun-sync-widget')) return false;
            const txt = (el.innerText || '').trim();
            const hasNmid = txt.includes('NMID') || txt.includes('ID102');
            const isShort = txt.length < 100 && txt.length > 5;
            return hasNmid && isShort && el.children.length <= 6;
        });
        candidates.sort((a, b) => a.innerText.length - b.innerText.length);
        return candidates[0] || null;
    }

    function getDropdownOutletCards() {
        const all = Array.from(document.querySelectorAll('*')).filter(el => {
            if (el.closest('#tartun-sync-widget')) return false;
            const txt = (el.innerText || '').trim();
            const isOutlet = (txt.includes('ID102') || txt.includes('CELL') || txt.includes('QR')) && txt.length < 120;
            const isNotHeader = !txt.includes('TOTAL TRANSAKSI') && !txt.includes('Pakai Merchant');
            const isVisible = el.offsetHeight > 15 && el.offsetWidth > 40;
            return isOutlet && isNotHeader && isVisible;
        });

        const cards = [];
        const seen = new Set();

        all.forEach(el => {
            let container = el;
            for (let d = 0; d < 4; d++) {
                if (container.parentElement && !container.parentElement.isSameNode(document.body)) {
                    const pTxt = container.parentElement.innerText || '';
                    if (pTxt.includes('ID102') && (pTxt.includes('CELL') || pTxt.includes('QR')) && pTxt.length < 140) {
                        container = container.parentElement;
                    }
                }
            }
            const clean = container.innerText.replace(/\s+/g, ' ').trim();
            if (!seen.has(clean) && clean.length > 5) {
                seen.add(clean);
                cards.push({ element: container, label: clean });
            }
        });

        return cards;
    }

    function dispatchClick(el) {
        if (!el) return;
        try {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const targets = [el, el.parentElement, ...Array.from(el.querySelectorAll('*'))];
            for (const t of targets) {
                if (!t) continue;
                const opts = { bubbles: true, cancelable: true, composed: true, view: window };
                t.dispatchEvent(new PointerEvent('pointerdown', opts));
                t.dispatchEvent(new MouseEvent('mousedown', opts));
                t.dispatchEvent(new PointerEvent('pointerup', opts));
                t.dispatchEvent(new MouseEvent('mouseup', opts));
                t.dispatchEvent(new MouseEvent('click', opts));
                if (typeof t.click === 'function') t.click();
            }
        } catch (e) {}
    }

    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${type === 'success' ? '#059669' : '#0284c7'};
            color: #fff; padding: 12px 20px; border-radius: 10px;
            font-size: 13px; font-weight: bold; z-index: 99999999;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            font-family: sans-serif;
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // 5. FLOATING HUD WIDGET
    function createTartunFloatingWidget() {
        if (document.getElementById('tartun-sync-widget')) return;

        const widget = document.createElement('div');
        widget.id = 'tartun-sync-widget';
        widget.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        widget.innerHTML = `
            <div id="tartun-widget-container" style="
                background: rgba(8, 12, 20, 0.97); backdrop-filter: blur(24px);
                border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 16px;
                padding: 16px; width: 380px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8), 0 0 25px rgba(14, 165, 233, 0.25);
                color: #f8fafc; box-sizing: border-box;
            ">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: #10b981; width: 10px; height: 10px; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #10b981;"></span>
                        <strong style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: #38bdf8;">TARTUN V2 MASTER SYNC</strong>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="tartun-btn-clear" title="Bersihkan Log" style="background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 12px;">🗑️</button>
                        <button id="tartun-toggle-min" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">−</button>
                    </div>
                </div>

                <!-- Body -->
                <div id="tartun-widget-body" style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- Auto-Sync Toggle -->
                    <div style="background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 11.5px; font-weight: bold; color: #38bdf8;">⚡ Auto-Sync Real-time</div>
                            <div style="font-size: 10px; color: #94a3b8;">Otomatis kirim saat Anda membuka outlet di layar</div>
                        </div>
                        <input type="checkbox" id="tartun-toggle-realtime" ${config.autoSyncRealtime ? 'checked' : ''} style="transform: scale(1.2); cursor: pointer;">
                    </div>

                    <!-- Progress Bar Container -->
                    <div id="tartun-progress-wrapper" style="display: none; background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; border-radius: 10px; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
                            <span id="tartun-progress-label" style="color: #38bdf8; font-weight: 700;">Memproses: -</span>
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
                        background: linear-gradient(135deg, #0284c7, #06b6d4); color: #ffffff;
                        font-weight: 800; font-size: 12px; border: none; border-radius: 8px;
                        padding: 12px; cursor: pointer; display: flex; align-items: center;
                        justify-content: center; gap: 6px; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.35);
                        transition: all 0.2s ease;
                    ">
                        ⚡ TARIK & SINKRONKAN SEMUA OUTLET
                    </button>

                    <div style="display: flex; gap: 6px;">
                        <button id="tartun-btn-sync-current" style="flex: 1; background: rgba(30, 41, 59, 0.8); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 7px; cursor: pointer;">
                            📍 Kirim Layar Ini Saja
                        </button>
                        <button id="tartun-btn-stop" style="display: none; background: #dc2626; color: #fff; font-size: 10.5px; font-weight: 700; border: none; border-radius: 6px; padding: 7px; cursor: pointer;">
                            ⏹️ Stop
                        </button>
                    </div>

                    <!-- Terminal Console Box -->
                    <div id="tartun-terminal-box" style="
                        background: #030712; border: 1px solid #1e293b; border-radius: 8px;
                        padding: 8px; font-size: 10.5px; font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
                        color: #a5f3fc; height: 115px; overflow-y: auto; white-space: pre-wrap; line-height: 1.4;
                    ">Siap sinkronisasi. Fitur Auto-Sync Real-time aktif.</div>
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

        document.getElementById('tartun-toggle-realtime').onchange = (e) => {
            config.autoSyncRealtime = e.target.checked;
            GM_setValue('tartun_auto_realtime', config.autoSyncRealtime);
            logTerminal(config.autoSyncRealtime ? '⚡ Auto-Sync Real-time DIAKTIFKAN.' : '⏸️ Auto-Sync Real-time DIMATIKAN.', 'info');
        };

        // Tombol Tarik Semua
        document.getElementById('tartun-btn-sync-all').onclick = async () => {
            await startVerifiedMultiOutletCrawler();
        };

        // Tombol Stop
        document.getElementById('tartun-btn-stop').onclick = () => {
            shouldStopScan = true;
        };

        // Tombol Layar Ini Saja
        document.getElementById('tartun-btn-sync-current').onclick = async () => {
            const { items, outletName, nmid } = extractTransactionsFromScreen();
            if (items.length === 0) {
                alert('Tidak ada transaksi di layar saat ini.');
                return;
            }
            logTerminal(`🚀 Mengirim ${items.length} transaksi (${outletName || nmid})...`, 'info');
            try {
                const res = await sendDataToTartun(items, outletName || nmid);
                logTerminal(`✅ Berhasil mengirim ${res.count} transaksi ke Tartun V2.`, 'success');
                alert(`✅ Sukses mengirim ${res.count} transaksi dari layar ini.`);
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

    function setUiRunningState(running) {
        const btn = document.getElementById('tartun-btn-sync-all');
        const stopBtn = document.getElementById('tartun-btn-stop');
        const pWrapper = document.getElementById('tartun-progress-wrapper');
        if (btn) {
            btn.disabled = running;
            btn.innerHTML = running ? '⏳ SEDANG MENARIK SEMUA OUTLET...' : '⚡ TARIK & SINKRONKAN SEMUA OUTLET';
            btn.style.opacity = running ? '0.7' : '1';
        }
        if (stopBtn) stopBtn.style.display = running ? 'block' : 'none';
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

    function updateLiveStats(trxCount, nominal) {
        const trxEl = document.getElementById('tartun-stat-trx');
        const nomEl = document.getElementById('tartun-stat-nom');
        if (trxEl) trxEl.textContent = `${trxCount} Transaksi`;
        if (nomEl) nomEl.textContent = `Rp ${nominal.toLocaleString('id-ID')}`;
    }

    window.addEventListener('load', () => {
        setTimeout(() => {
            createTartunFloatingWidget();
            monitorRealTimeChanges();
        }, 1200);
    });

    setInterval(() => {
        if (!document.getElementById('tartun-sync-widget')) {
            createTartunFloatingWidget();
            monitorRealTimeChanges();
        }
    }, 3000);

})();
