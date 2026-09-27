// ===========================================================
// Cek Admin QRIS — kalkulator publik, tanpa sentuh database.
//
// Tempel teks notifikasi QRIS -> parse jadi daftar transaksi -> hitung fee
// admin & tunai keluar memakai `adminRules` yang SAMA dengan yang dipakai
// untuk transaksi sungguhan (this.utils.calculateAdminFee), bukan tabel
// tarif terpisah. Hasil hanya disimpan di localStorage browser pengunjung
// (bertahan sampai tombol "Hapus" ditekan) — tidak pernah dikirim ke server.
//
// Transaksi yang dicentang "Bayar" dirangkum menjadi teks siap-tempel untuk
// operator, dalam format yang langsung terbaca oleh "Batch Filter Keterangan"
// di menu Analisis tanpa perlu mengubah pola regex-nya.
// ===========================================================
const AppQrisCheck = {
    STORAGE_KEY: 'fkof_qrisCheckData',

    // Pola default Batch Filter Keterangan (sama dengan nilai awal
    // AppState.batchFilterRegexPattern). Disalin sebagai konstanta agar uji-baca
    // tidak terpengaruh bila pola di sesi ini pernah diubah.
    BATCH_FILTER_PATTERN: 'RRN:\\s*([^|]+?)\\s*\\|',

    _escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    },

    // Netralkan teks bebas (outlet, bank, jam) sebelum masuk teks operator agar
    // tidak pernah bisa terbaca sebagai kode oleh regex Batch Filter.
    _safeOperatorText(str) {
        return String(str ?? '')
            .replace(/\|/g, '/')
            .replace(/RRN\s*:/gi, 'RRN-')
            .replace(/\s+/g, ' ')
            .trim();
    },

    _today() {
        return this.utils.formatDateForInput(new Date());
    },

    // ---- Parser ----
    // Format yang didukung (notifikasi QRIS per transaksi, dipisah baris kosong):
    //   RRN: 00F1000ZT4P1 | 21.42 WIB
    //   ALFA 1 CELL (NMID: ID1026574479725)
    //   Menerima pembayaran dari SEABANK a.n. **YLA ****SYA
    //   + Rp 175.000
    parse(rawText) {
        const blocks = String(rawText || '')
            .split(/(?=RRN:\s*)/i)
            .map(b => b.trim())
            .filter(Boolean);

        const transactions = [];
        for (const block of blocks) {
            const tx = this.qrisCheck._parseBlock(block);
            if (tx) transactions.push(tx);
        }
        return transactions;
    },

    _parseBlock(block) {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) return null;

        const rrnMatch = lines[0].match(/RRN:\s*([^\s|]+)\s*\|\s*([\d.]+)\s*WIB/i);
        if (!rrnMatch) return null;
        const rrn = rrnMatch[1];
        const time = rrnMatch[2] + ' WIB';

        // Baris outlet, mis. "ALFA 1 CELL (NMID: ID1026574479725)".
        let outlet = '';
        const outletLine = lines.find(l => /\(NMID:\s*[^)]+\)/i.test(l));
        if (outletLine) {
            const outletMatch = outletLine.match(/^(.*?)\s*\(NMID:\s*[^)]+\)/i);
            if (outletMatch) outlet = outletMatch[1].trim();
        }

        // Baris bank + nama customer, mis. "Menerima pembayaran dari DANA a.n. *******".
        let bank = '';
        let customerName = '';
        const payLine = lines.find(l => /Menerima pembayaran dari/i.test(l));
        if (payLine) {
            const payMatch = payLine.match(/Menerima pembayaran dari\s+(.+?)\s+a\.n\.\s*(.+)/i);
            if (payMatch) {
                bank = payMatch[1].trim();
                customerName = payMatch[2].trim();
            }
        }

        // Baris nominal, mis. "+ Rp 175.000".
        let amount = 0;
        const amountLine = lines.find(l => /^[+]\s*Rp/i.test(l));
        if (amountLine) {
            const amountMatch = amountLine.match(/[+]\s*Rp\s*([\d.]+)/i);
            if (amountMatch) amount = parseInt(amountMatch[1].replace(/\./g, ''), 10) || 0;
        }
        if (!amount) return null;

        return { rrn, time, outlet, bank, customerName, amount, isPayment: false };
    },

    // ---- Kalkulasi fee ----
    // Nominal di notifikasi QRIS ("+ Rp X") adalah TOTAL yang sudah termasuk
    // admin -- persis `row.jumlah` yang dipakai `calculateAdminFee` untuk
    // transaksi QR sungguhan. Jadi cukup panggil ulang fungsi yang sama
    // lewat baris sintetis, tanpa logika/tabel tarif baru.
    computeRow(tx, settings) {
        if (tx.isPayment) {
            return { fee: 0, cash: tx.amount };
        }
        const fee = this.utils.calculateAdminFee(
            { jumlah: tx.amount, keterangan: 'QR', tipe_sheet: null },
            settings
        );
        return { fee, cash: tx.amount - fee };
    },

    // ---- Teks untuk operator (Batch Filter Keterangan) ----
    // Contoh hasil:
    //   QRIS BAYAR — ALFA 1 CELL
    //   Tanggal 27/09/2026 · 3 transaksi · Total Rp 480.000
    //
    //   RRN: 1so9kbr81013 | 17.32 WIB · DANA · Rp 22.000
    //
    // Regex Batch Filter hanya mengambil teks di antara "RRN:" dan "|" pertama,
    // jadi info setelah "|" aman untuk verifikasi manusia. Baris ringkasan
    // sengaja tidak memuat "RRN:" sama sekali.
    buildOperatorText(paymentTxs, dateStr) {
        const safe = this.qrisCheck._safeOperatorText;

        const outlets = [...new Set(paymentTxs.map(tx => safe(tx.outlet)).filter(Boolean))];
        const outletLabel = outlets.length ? outlets.join(', ') : 'Outlet tidak diketahui';
        const total = paymentTxs.reduce((sum, tx) => sum + tx.amount, 0);
        const [y, m, d] = String(dateStr || '').split('-');
        const dateLabel = d ? `${d}/${m}/${y}` : '-';

        const header = [
            `QRIS BAYAR — ${outletLabel}`,
            `Tanggal ${dateLabel} · ${paymentTxs.length} transaksi · Total ${this.utils.formatCurrency(total)}`
        ];
        const lines = paymentTxs.map(tx => {
            const info = [safe(tx.time), safe(tx.bank), this.utils.formatCurrency(tx.amount)]
                .filter(Boolean)
                .join(' · ');
            return `RRN: ${tx.rrn} | ${info}`;
        });

        return [...header, '', ...lines].join('\n');
    },

    // Jalankan fungsi Batch Filter yang sama terhadap teks hasil generate, lalu
    // pastikan kode yang terbaca persis sama dengan RRN transaksi yang dicentang.
    verifyOperatorText(text, paymentTxs) {
        const { codes, error } = this.utils.extractBatchFilterCodes(text, this.qrisCheck.BATCH_FILTER_PATTERN);
        const expected = new Set(paymentTxs.map(tx => String(tx.rrn).toLowerCase()));
        const read = new Set(codes.map(c => c.toLowerCase()));
        const matches = !error
            && read.size === expected.size
            && [...expected].every(code => read.has(code));
        return { ok: matches, readCount: codes.length, expectedCount: expected.size, error };
    },

    renderOperatorPanel(transactions) {
        const panel = document.getElementById('qris-check-operator');
        const textEl = document.getElementById('qris-check-operator-text');
        const checkEl = document.getElementById('qris-check-operator-check');
        const dateEl = document.getElementById('qris-check-date');
        if (!panel || !textEl || !checkEl || !dateEl) return;

        const paymentTxs = (transactions || []).filter(tx => tx.isPayment);
        if (paymentTxs.length === 0) {
            panel.classList.add('hidden');
            textEl.value = '';
            checkEl.textContent = '';
            return;
        }

        dateEl.value = this.state.qrisCheckDate;
        const text = this.qrisCheck.buildOperatorText(paymentTxs, this.state.qrisCheckDate);
        textEl.value = text;

        const result = this.qrisCheck.verifyOperatorText(text, paymentTxs);
        if (result.ok) {
            checkEl.textContent = `✓ ${result.readCount} kode terbaca oleh Batch Filter — sesuai ${result.expectedCount} transaksi dicentang.`;
            checkEl.className = 'text-xs mt-2 text-color-success';
        } else {
            checkEl.textContent = result.error
                ? `⚠ Uji-baca gagal: ${result.error}`
                : `⚠ Batch Filter membaca ${result.readCount} kode, padahal ada ${result.expectedCount} transaksi dicentang. Periksa data sebelum dikirim.`;
            checkEl.className = 'text-xs mt-2 text-color-warning';
        }

        panel.classList.remove('hidden');
    },

    async copyOperatorText() {
        const textEl = document.getElementById('qris-check-operator-text');
        const text = textEl ? textEl.value : '';
        if (!text) return;

        let copied = false;
        if (window.isSecureContext && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(text);
                copied = true;
            } catch (e) {
                copied = false;
            }
        }

        if (!copied) {
            // Cadangan untuk HTTP polos (IP LAN/Tailscale), di mana browser
            // menonaktifkan navigator.clipboard. Pola textarea sementara ini juga
            // bekerja di Safari iOS.
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.setAttribute('readonly', '');
            temp.style.position = 'absolute';
            temp.style.left = '-9999px';
            temp.style.top = `${window.scrollY || 0}px`;
            temp.style.fontSize = '12pt';
            document.body.appendChild(temp);
            temp.select();
            temp.setSelectionRange(0, text.length);
            try {
                copied = document.execCommand('copy');
            } catch (e) {
                copied = false;
            }
            temp.remove();
        }

        const label = document.getElementById('qris-check-copy-label');
        if (copied && label) {
            label.textContent = 'Tersalin ✓';
            clearTimeout(this.state._qrisCopyTimer);
            this.state._qrisCopyTimer = setTimeout(() => {
                const current = document.getElementById('qris-check-copy-label');
                if (current) current.textContent = 'Salin';
            }, 2000);
        } else if (!copied) {
            this.ui.showModal('Gagal Menyalin', 'Browser tidak mengizinkan salin otomatis. Silakan blok teks di kotak "Data untuk Operator" lalu salin manual.');
        }
    },

    // ---- Persistensi (localStorage saja -- tidak pernah ke server/DB) ----
    _save() {
        const input = document.getElementById('qris-check-input');
        const payload = {
            rawText: input ? input.value : '',
            transactions: this.state.qrisCheckData || [],
            date: this.state.qrisCheckDate || ''
        };
        try {
            localStorage.setItem(this.qrisCheck.STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            // localStorage penuh/nonaktif (mode privat, dsb) -- fitur tetap jalan, hanya tanpa persist.
        }
    },

    _load() {
        try {
            const raw = localStorage.getItem(this.qrisCheck.STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    // ---- Aksi UI ----
    process() {
        const input = document.getElementById('qris-check-input');
        const rawText = (input.value || '').trim();
        if (!rawText) {
            this.ui.showModal('Info', 'Silakan tempel teks notifikasi QRIS terlebih dahulu.');
            return;
        }

        const transactions = this.qrisCheck.parse(rawText);
        if (transactions.length === 0) {
            this.ui.showModal('Info', 'Tidak ada transaksi QRIS yang terdeteksi dari teks tersebut. Pastikan format sesuai contoh (RRN, baris outlet, baris pembayaran, dan nominal).');
            return;
        }

        this.state.qrisCheckData = transactions;
        this.qrisCheck._save();
        this.qrisCheck.render();
    },

    clear() {
        const input = document.getElementById('qris-check-input');
        if (input) input.value = '';
        this.state.qrisCheckData = [];
        this.state.qrisCheckDate = this.qrisCheck._today();
        this.qrisCheck._save();
        this.qrisCheck.render();
    },

    togglePayment(index) {
        const tx = (this.state.qrisCheckData || [])[index];
        if (!tx) return;
        tx.isPayment = !tx.isPayment;
        this.qrisCheck._save();
        this.qrisCheck.render();
    },

    changeDate(value) {
        this.state.qrisCheckDate = value || this.qrisCheck._today();
        this.qrisCheck._save();
        this.qrisCheck.renderOperatorPanel(this.state.qrisCheckData);
    },

    // ---- Render ----
    render() {
        const summaryEl = document.getElementById('qris-check-summary');
        const resultsEl = document.getElementById('qris-check-results');
        const tbody = document.getElementById('qris-check-table-body');
        const tfoot = document.getElementById('qris-check-table-foot');
        if (!tbody || !summaryEl || !resultsEl || !tfoot) return; // view sudah berpindah

        const transactions = this.state.qrisCheckData || [];
        if (transactions.length === 0) {
            summaryEl.classList.add('hidden');
            resultsEl.classList.add('hidden');
            tbody.innerHTML = '';
            tfoot.innerHTML = '';
            this.qrisCheck.renderOperatorPanel([]);
            return;
        }

        const settings = this.state.settings;
        const esc = this.qrisCheck._escapeHtml;
        let totalReceived = 0, totalFee = 0, totalCash = 0, totalPayment = 0;

        const rowsHtml = transactions.map((tx, idx) => {
            const { fee, cash } = this.qrisCheck.computeRow(tx, settings);
            totalReceived += tx.amount;
            totalFee += fee;
            totalCash += cash;
            if (tx.isPayment) totalPayment++;

            const statusLabel = tx.isPayment ? 'Pembayaran' : 'OK';
            const statusClass = tx.isPayment ? 'text-text-secondary' : 'text-color-success';

            return `
                <tr class="border-b border-border-color/50">
                    <td class="p-2 text-text-muted">${idx + 1}</td>
                    <td class="p-2 whitespace-nowrap">${esc(tx.time)}</td>
                    <td class="p-2">${esc(tx.outlet || '-')}</td>
                    <td class="p-2 whitespace-nowrap">${esc(tx.bank || '-')}</td>
                    <td class="p-2 truncate max-w-[200px]" title="${esc(tx.customerName)}">${esc(tx.customerName || '-')}</td>
                    <td class="p-2 text-right whitespace-nowrap">${this.utils.formatCurrency(tx.amount)}</td>
                    <td class="p-2 text-right whitespace-nowrap ${tx.isPayment ? 'text-text-muted' : 'text-color-warning'}">${fee > 0 ? this.utils.formatCurrency(fee) : '-'}</td>
                    <td class="p-2 text-right whitespace-nowrap font-bold text-color-success">${this.utils.formatCurrency(cash)}</td>
                    <td class="p-2 text-center">
                        <input type="checkbox" class="form-input qris-check-payment-toggle" data-index="${idx}" ${tx.isPayment ? 'checked' : ''} title="Tandai sebagai pembayaran (tanpa admin)">
                    </td>
                    <td class="p-2 ${statusClass}">${statusLabel}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
        tfoot.innerHTML = `
            <tr class="font-bold border-t-2 border-border-color">
                <td class="p-2" colspan="5">Total (${transactions.length} transaksi)</td>
                <td class="p-2 text-right whitespace-nowrap">${this.utils.formatCurrency(totalReceived)}</td>
                <td class="p-2 text-right whitespace-nowrap text-color-warning">${this.utils.formatCurrency(totalFee)}</td>
                <td class="p-2 text-right whitespace-nowrap text-color-success">${this.utils.formatCurrency(totalCash)}</td>
                <td colspan="2"></td>
            </tr>
        `;

        document.querySelectorAll('.qris-check-payment-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                this.qrisCheck.togglePayment(idx);
            });
        });

        document.getElementById('qris-check-total-received').textContent = this.utils.formatCurrency(totalReceived);
        document.getElementById('qris-check-total-fee').textContent = this.utils.formatCurrency(totalFee);
        document.getElementById('qris-check-total-cash').textContent = this.utils.formatCurrency(totalCash);
        document.getElementById('qris-check-total-count').textContent = transactions.length;
        document.getElementById('qris-check-total-payment').textContent = totalPayment;

        summaryEl.classList.remove('hidden');
        resultsEl.classList.remove('hidden');

        this.qrisCheck.renderOperatorPanel(transactions);
    },

    // Dipanggil oleh ui.viewSetups['qris-check'] setiap kali view ini dibuka.
    setup() {
        const input = document.getElementById('qris-check-input');
        const processBtn = document.getElementById('qris-check-process-btn');
        const clearBtn = document.getElementById('qris-check-clear-btn');
        const dateEl = document.getElementById('qris-check-date');
        const copyBtn = document.getElementById('qris-check-copy-btn');
        if (!input || !processBtn || !clearBtn || !dateEl || !copyBtn) return;

        const saved = this.qrisCheck._load();
        input.value = (saved && saved.rawText) || '';
        this.state.qrisCheckData = (saved && Array.isArray(saved.transactions)) ? saved.transactions : [];
        this.state.qrisCheckDate = (saved && saved.date) || this.qrisCheck._today();
        this.qrisCheck.render();

        processBtn.addEventListener('click', () => this.qrisCheck.process());
        clearBtn.addEventListener('click', () => this.qrisCheck.clear());
        dateEl.addEventListener('change', () => this.qrisCheck.changeDate(dateEl.value));
        copyBtn.addEventListener('click', () => this.qrisCheck.copyOperatorText());
    }
};
