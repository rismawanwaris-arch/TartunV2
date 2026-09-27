// ===========================================================
// Cek Admin QRIS — kalkulator publik, tanpa sentuh database.
//
// Tempel teks notifikasi QRIS -> parse jadi daftar transaksi -> hitung fee
// admin & tunai keluar memakai `adminRules` yang SAMA dengan yang dipakai
// untuk transaksi sungguhan (this.utils.calculateAdminFee), bukan tabel
// tarif terpisah. Hasil hanya disimpan di localStorage browser pengunjung
// (bertahan sampai tombol "Hapus" ditekan) — tidak pernah dikirim ke server.
// ===========================================================
const AppQrisCheck = {
    STORAGE_KEY: 'fkof_qrisCheckData',

    _escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
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

    // ---- Persistensi (localStorage saja -- tidak pernah ke server/DB) ----
    _save(rawText, transactions) {
        try {
            localStorage.setItem(this.qrisCheck.STORAGE_KEY, JSON.stringify({ rawText, transactions }));
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
        this.qrisCheck._save(rawText, transactions);
        this.qrisCheck.render();
    },

    clear() {
        const input = document.getElementById('qris-check-input');
        if (input) input.value = '';
        this.state.qrisCheckData = [];
        this.qrisCheck._save('', []);
        this.qrisCheck.render();
    },

    togglePayment(index) {
        const tx = (this.state.qrisCheckData || [])[index];
        if (!tx) return;
        tx.isPayment = !tx.isPayment;

        const input = document.getElementById('qris-check-input');
        this.qrisCheck._save(input ? input.value : '', this.state.qrisCheckData);
        this.qrisCheck.render();
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
            return;
        }

        const settings = this.state.settings;
        const esc = this.qrisCheck._escapeHtml;
        let totalReceived = 0, totalFee = 0, totalCash = 0;

        const rowsHtml = transactions.map((tx, idx) => {
            const { fee, cash } = this.qrisCheck.computeRow(tx, settings);
            totalReceived += tx.amount;
            totalFee += fee;
            totalCash += cash;

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

        summaryEl.classList.remove('hidden');
        resultsEl.classList.remove('hidden');
    },

    // Dipanggil oleh ui.viewSetups['qris-check'] setiap kali view ini dibuka.
    setup() {
        const input = document.getElementById('qris-check-input');
        const processBtn = document.getElementById('qris-check-process-btn');
        const clearBtn = document.getElementById('qris-check-clear-btn');
        if (!input || !processBtn || !clearBtn) return;

        const saved = this.qrisCheck._load();
        input.value = (saved && saved.rawText) || '';
        this.state.qrisCheckData = (saved && Array.isArray(saved.transactions)) ? saved.transactions : [];
        this.qrisCheck.render();

        processBtn.addEventListener('click', () => this.qrisCheck.process());
        clearBtn.addEventListener('click', () => this.qrisCheck.clear());
    }
};
