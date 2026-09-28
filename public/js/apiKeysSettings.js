// Panel "API Ingest" di Pengaturan > Sistem (khusus Master): info endpoint,
// pembuatan & pencabutan API key untuk sistem pengirim data QR.
const AppApiKeys = {
    render() {
        const panel = document.getElementById('api-keys-panel');
        if (!panel) return;
        const isMaster = this.state.currentUser?.role === 'Master';
        panel.classList.toggle('hidden', !isMaster);
        if (!isMaster) return;

        const endpoint = `${window.location.origin}/api/v1/ingest/qr`;
        document.getElementById('api-ingest-endpoint').textContent = endpoint;
        document.getElementById('api-ingest-example').textContent = this.apiKeys.exampleRequest(endpoint);
        document.getElementById('api-key-new-result').classList.add('hidden');

        document.getElementById('api-ingest-copy-endpoint').onclick = () => this.apiKeys.copy(endpoint);
        document.getElementById('api-ingest-copy-example').onclick = () => this.apiKeys.copy(this.apiKeys.exampleRequest(endpoint));
        document.getElementById('api-key-create-btn').onclick = () => this.apiKeys.create();
        document.getElementById('api-key-list').onclick = e => {
            const btn = e.target.closest('[data-revoke-id]');
            if (btn) this.apiKeys.revoke(Number(btn.dataset.revokeId), btn.dataset.name);
        };
        this.apiKeys.loadList();
    },

    exampleRequest(endpoint) {
        const body = {
            transactions: [{
                ref: '1sodncj75027',
                outlet_code: 'ID1026575135789',
                outlet_name: 'BK 6 PANGARITAN CELL',
                amount: 300000,
                paid_at: '2026-09-27T19:59:00+07:00',
                method: 'GOPAY',
                payer: '**PAY',
                status: 'success'
            }]
        };
        return `curl -X POST '${endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-API-Key: tk_...' \\\n  -d '${JSON.stringify(body, null, 2)}'`;
    },

    async copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.ui.showModal('Disalin', 'Teks sudah disalin ke clipboard.');
        } catch (e) {
            this.ui.showModal('Gagal Menyalin', 'Clipboard tidak tersedia di koneksi ini. Salin manual dari kotak teks.');
        }
    },

    formatDate(value) {
        if (!value) return '-';
        const date = new Date(String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`);
        return isNaN(date.getTime()) ? value : date.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    },

    async loadList() {
        const list = document.getElementById('api-key-list');
        const esc = this.utils.escapeHtml;
        try {
            const { data } = await this.api.req('/api-keys');
            if (data.length === 0) {
                list.innerHTML = '<p class="text-xs text-text-muted">Belum ada API key.</p>';
                return;
            }
            list.innerHTML = data.map(k => `
                <div class="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-black/20 ${k.revoked_at ? 'opacity-50' : ''}">
                    <div class="flex-1 min-w-[180px]">
                        <div class="font-bold text-sm">${esc(k.name)}</div>
                        <div class="text-xs text-text-muted font-mono">${esc(k.key_prefix)}…</div>
                    </div>
                    <div class="text-xs text-text-secondary">
                        <div>Dibuat: ${esc(this.apiKeys.formatDate(k.created_at))}</div>
                        <div>Terakhir dipakai: ${esc(this.apiKeys.formatDate(k.last_used_at))}</div>
                    </div>
                    ${k.revoked_at
                        ? `<span class="text-xs text-color-danger">Dicabut ${esc(this.apiKeys.formatDate(k.revoked_at))}</span>`
                        : `<button type="button" class="btn btn-danger btn-sm" data-revoke-id="${k.id}" data-name="${esc(k.name)}">Cabut</button>`}
                </div>`).join('');
        } catch (e) {
            list.innerHTML = `<p class="text-xs text-color-danger">Gagal memuat API key: ${esc(e.message)}</p>`;
        }
    },

    async create() {
        const input = document.getElementById('api-key-name');
        const name = input.value.trim();
        if (name.length < 3) {
            this.ui.showModal('Info', 'Nama key minimal 3 karakter, mis. "Payment Gateway Utama".');
            return;
        }
        try {
            const { data } = await this.api.req('/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
            input.value = '';
            document.getElementById('api-key-new-value').textContent = data.key;
            document.getElementById('api-key-copy-new').onclick = () => this.apiKeys.copy(data.key);
            document.getElementById('api-key-new-result').classList.remove('hidden');
            this.apiKeys.loadList();
        } catch (e) {
            this.ui.showModal('Error', `Gagal membuat API key: ${e.message}`);
        }
    },

    async revoke(id, name) {
        if (!confirm(`Cabut API key "${name}"? Sistem yang memakai key ini tidak akan bisa mengirim data lagi.`)) return;
        try {
            await this.api.req(`/api-keys/${id}`, { method: 'DELETE' });
            document.getElementById('api-key-new-result').classList.add('hidden');
            this.apiKeys.loadList();
        } catch (e) {
            this.ui.showModal('Error', `Gagal mencabut API key: ${e.message}`);
        }
    }
};
