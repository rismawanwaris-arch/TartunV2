// ==UserScript==
// @name         Tartun V2 - KlikBCA QRIS Multi-Outlet Auto Sync
// @namespace    https://tartun.app/
// @version      3.4.0
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

    let isScanning = false;
    let shouldStopScan = false;
    let manualDropdownElement = null;

    // 1. PARSER DOM TRANSAKSI (MEMBACA TRANSAKSI YANG TAMPIL DI LAYAR)
    function parseTransactionsFromDOM() {
        const items = [];
        const widget = document.getElementById('tartun-sync-widget');
        
        // Buat clone teks halaman tanpa widget Tartun
        let rawText = '';
        if (widget) {
            const tempDiv = document.body.cloneNode(true);
            const w = tempDiv.querySelector('#tartun-sync-widget');
            if (w) w.remove();
            rawText = tempDiv.innerText || '';
        } else {
            rawText = document.body.innerText || '';
        }

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

    // 2. DETEKSI ELEMEN DROPDOWN & MENU OUTLET
    function findDropdownTrigger() {
        if (manualDropdownElement && document.body.contains(manualDropdownElement)) {
            return manualDropdownElement;
        }

        const allElements = Array.from(document.querySelectorAll('div, button, a, span, p'));
        const candidates = allElements.filter(el => {
            if (el.closest('#tartun-sync-widget')) return false;
            const txt = (el.innerText || '').trim();
            const hasNmid = txt.includes('NMID') || txt.includes('ID102');
            const isShort = txt.length < 120 && txt.length > 5;
            const hasChildren = el.children.length >= 1 && el.children.length <= 8;
            return hasNmid && isShort && hasChildren;
        });

        if (candidates.length > 0) {
            candidates.sort((a, b) => a.innerText.length - b.innerText.length);
            return candidates[0];
        }
        return null;
    }

    function getDropdownOptionElements() {
        // Cari container dropdown popup yang terbuka di layar (modal / menu overlay)
        const all = Array.from(document.querySelectorAll('*'));
        
        const candidateItems = all.filter(el => {
            // Abaikan apapun yang ada di dalam widget Tartun
            if (el.closest('#tartun-sync-widget')) return false;

            const txt = (el.innerText || '').trim();
            if (!txt || txt.length > 80 || txt.length < 4) return false;

            // Harus berisi nama outlet atau ID NMID
            const isOutletPattern = txt.includes('ID102') || txt.includes('CELL') || txt.includes('QR');
            const isNotHeader = !txt.includes('TOTAL TRANSAKSI') && !txt.includes('Pakai Merchant');
            const isVisible = el.offsetHeight > 15 && el.offsetWidth > 40;

            return isOutletPattern && isNotHeader && isVisible;
        });

        // Filter: Ambil elemen terdalam (leaf element) agar tidak duplikat dengan container pembungkusnya
        const leafOptions = candidateItems.filter(el => {
            return !candidateItems.some(other => other !== el && el.contains(other));
        });

        // Hapus duplikat berdasarkan teks persis
        const seenTexts = new Set();
        const uniqueLeafs = [];
        for (const item of leafOptions) {
            const cleanTxt = item.innerText.replace(/\s+/g, ' ').trim();
            if (!seenTexts.has(cleanTxt)) {
                seenTexts.add(cleanTxt);
                uniqueLeafs.push(item);
            }
        }

        return uniqueLeafs;
    }

    function clickElement(el) {
        if (!el) return;
        try {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evtType => {
                el.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window }));
            });
            if (typeof el.click === 'function') {
                el.click();
            }
        } catch (e) {
            console.error("Error clicking:", e);
        }
    }

    // 3. SMART UI CRAWLER
    async function runSmartUiCrawler() {
        if (isScanning) return;
        isScanning = true;
        shouldStopScan = false;
        setUiRunningState(true);

        try {
            logTerminal('========================================', 'info');
            logTerminal('🚀 MEMULAI PENARIKAN LENGKAP OUTLET', 'highlight');
            logTerminal('========================================', 'info');

            let allCollectedRows = [];
            let totalNominal = 0;

            logTerminal('🔍 Membuka menu dropdown outlet di atas layar...', 'info');
            const trigger = findDropdownTrigger();

            if (!trigger) {
                logTerminal('❌ Tombol pilihan outlet tidak terdeteksi otomatis.', 'error');
                logTerminal('💡 Klik tombol "🎯 Pilih Dropdown Manual" di panel lalu klik kotak nama outlet di atas layar.', 'highlight');
                alert('Tombol outlet belum terdeteksi.\n\nKlik tombol "🎯 Pilih Dropdown Manual" di panel Tartun, lalu klik kotak nama outlet di bagian atas layar KlikBCA Anda.');
                return;
            }

            // Buka dropdown
            clickElement(trigger);
            await new Promise(r => setTimeout(r, 800));

            let optionElements = getDropdownOptionElements();
            logTerminal(`📋 Berhasil mendeteksi ${optionElements.length} outlet unik di menu.`, 'success');

            if (optionElements.length === 0) {
                logTerminal('⚠️ Menu belum terbuka. Mencoba klik ulang...', 'dim');
                clickElement(trigger);
                await new Promise(r => setTimeout(r, 800));
                optionElements = getDropdownOptionElements();
            }

            if (optionElements.length === 0) {
                logTerminal('❌ Menu daftar outlet tidak dapat dibuka.', 'error');
                alert('Daftar outlet tidak muncul.\nPastikan Anda sudah mengklik tombol dropdown outlet di atas layar.');
                return;
            }

            // Catat nama semua outlet yang terdeteksi
            const outletNames = optionElements.map(el => el.innerText.replace(/\s+/g, ' ').trim());
            logTerminal(`📋 Daftar Outlet (${optionElements.length}): ${outletNames.slice(0, 3).join(', ')} ... (${optionElements.length} total)`, 'info');

            const totalOutlets = optionElements.length;

            // Tutup sementara
            clickElement(trigger);
            await new Promise(r => setTimeout(r, 400));

            // Loop seluruh outlet
            for (let i = 0; i < totalOutlets; i++) {
                if (shouldStopScan) {
                    logTerminal('⏹️ Proses dihentikan oleh pengguna.', 'error');
                    break;
                }

                const currentStep = i + 1;
                const pct = Math.round((currentStep / totalOutlets) * 100);
                const currentOutletName = outletNames[i] || `Outlet #${currentStep}`;

                updateProgressBar(currentStep, totalOutlets, pct, currentOutletName);

                // Buka kembali dropdown
                const currentTrigger = findDropdownTrigger();
                if (currentTrigger) {
                    clickElement(currentTrigger);
                    await new Promise(r => setTimeout(r, 600));
                }

                // Cari elemen yang sesuai dengan nama outlet ke-i
                const currentOptions = getDropdownOptionElements();
                let targetOption = currentOptions.find(el => el.innerText.replace(/\s+/g, ' ').trim() === currentOutletName) || currentOptions[i];

                if (targetOption) {
                    clickElement(targetOption);
                    // Tunggu KlikBCA me-render mutasi
                    await new Promise(r => setTimeout(r, 1300));

                    // Baca transaksi di layar
                    const rows = parseTransactionsFromDOM();
                    if (rows.length > 0) {
                        const sum = rows.reduce((s, r) => s + r.jumlah, 0);
                        allCollectedRows.push(...rows);
                        totalNominal += sum;
                        logTerminal(`[${currentStep}/${totalOutlets}] ✓ ${currentOutletName}: +${rows.length} trx (Rp ${sum.toLocaleString('id-ID')})`, 'success');
                    } else {
                        logTerminal(`[${currentStep}/${totalOutlets}] ○ ${currentOutletName}: 0 trx`, 'dim');
                    }

                    updateLiveStats(allCollectedRows.length, totalNominal);
                } else {
                    logTerminal(`[${currentStep}/${totalOutlets}] ⚠️ Gagal menemukan item: ${currentOutletName}`, 'error');
                }
            }

            // Hapus duplikat transaksi
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
                    alert(`🎉 SINKRONISASI SELESAI!\n\n• Outlet Dipindai: ${totalOutlets} Outlet\n• Transaksi Ditemukan: ${finalRows.length} Transaksi\n• Total Nominal: Rp ${totalNominal.toLocaleString('id-ID')}\n\nSemua data berhasil masuk ke database Tartun V2.`);
                } catch (err) {
                    logTerminal(`❌ GAGAL KIRIM KE TARTUN: ${err.message}`, 'error');
                    alert(`Gagal mengirim ke Tartun V2: ${err.message}`);
                }
            } else {
                logTerminal('ℹ️ Selesai: Tidak ada transaksi QRIS pada tanggal ini.', 'dim');
                alert('Tidak ada transaksi QRIS yang ditemukan pada tanggal terpilih.');
            }

        } catch (err) {
            logTerminal(`❌ ERROR: ${err.message}`, 'error');
            console.error("Crawler error:", err);
            alert(`Terjadi kesalahan: ${err.message}`);
        } finally {
            isScanning = false;
            setUiRunningState(false);
        }
    }

    // 4. PENGIRIMAN DATA KE TARTUN V2
    async function sendDataToTartun(rows) {
        if (!config.tartunToken) {
            logTerminal('🔑 Melakukan login ke Tartun V2...', 'info');
            const ok = await loginToTartun();
            if (!ok) throw new Error('Gagal login ke Tartun V2. Periksa IP server dan Password.');
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
                        reject(new Error(`Response Tartun: ${res.responseText.slice(0, 80)}`));
                    }
                },
                onerror: function() {
                    reject(new Error(`Gagal menghubungi server Tartun di ${config.tartunUrl}`));
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

    // 5. FITUR PILIH DROPDOWN MANUAL (INTERACTIVE PICKER)
    function activateManualElementPicker() {
        logTerminal('🎯 MODE PILIH MANUAL: Klik kotak pilihan nama outlet di bagian atas layar Anda...', 'highlight');
        alert('Mode Pilih Manual Aktif!\n\nSilakan KLIK SATU KALI pada kotak pilihan nama outlet di bagian atas halaman KlikBCA Anda.');

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(14, 165, 233, 0.15); z-index: 99999999; cursor: crosshair;
        `;
        document.body.appendChild(overlay);

        const onPickerClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.remove();

            const clickedEl = document.elementFromPoint(e.clientX, e.clientY);
            if (clickedEl && !clickedEl.closest('#tartun-sync-widget')) {
                manualDropdownElement = clickedEl;
                logTerminal(`✅ Elemen Terpilih: "${(clickedEl.innerText || clickedEl.tagName).slice(0, 35)}..."`, 'success');
                alert(`✅ Berhasil memilih elemen dropdown!\n\nSekarang klik tombol "⚡ TARIK & SINKRONKAN SEMUA 45 OUTLET" untuk memulai.`);
            }
            window.removeEventListener('click', onPickerClick, true);
        };

        setTimeout(() => {
            window.addEventListener('click', onPickerClick, true);
        }, 100);
    }

    // 6. FLOATING UI WIDGET
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
                        <span style="background: #10b981; width: 10px; height: 10px; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #10b981;"></span>
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
                        <button id="tartun-btn-pick-element" style="flex: 1; background: rgba(30, 41, 59, 0.8); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 7px; cursor: pointer;">
                            🎯 Pilih Dropdown Manual
                        </button>
                        <button id="tartun-btn-sync-current" style="flex: 1; background: rgba(30, 41, 59, 0.8); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 7px; cursor: pointer;">
                            📍 Layar Ini Saja
                        </button>
                        <button id="tartun-btn-stop" style="display: none; background: #dc2626; color: #fff; font-size: 10.5px; font-weight: 700; border: none; border-radius: 6px; padding: 7px; cursor: pointer;">
                            ⏹️ Stop
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
                        height: 120px;
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
            await runSmartUiCrawler();
        };

        // Tombol Pilih Dropdown Manual
        document.getElementById('tartun-btn-pick-element').onclick = () => {
            activateManualElementPicker();
        };

        // Tombol Stop
        document.getElementById('tartun-btn-stop').onclick = () => {
            shouldStopScan = true;
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
            btn.innerHTML = running ? '⏳ SEDANG MENARIK 45 OUTLET...' : '⚡ TARIK & SINKRONKAN SEMUA 45 OUTLET';
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

    window.addEventListener('load', () => setTimeout(createTartunFloatingWidget, 1200));
    setInterval(() => {
        if (!document.getElementById('tartun-sync-widget')) createTartunFloatingWidget();
    }, 3000);

})();
