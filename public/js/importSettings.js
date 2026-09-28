// Editor "Profil Format Import" di Pengaturan > Data.
// Bekerja pada salinan (draft) profil; draft baru masuk ke settings saat
// tombol Simpan Pengaturan ditekan (lihat collectSettingsFromUI).
const AppImportSettings = {
    _draft: [],
    _selectedId: null,

    _clone(value) {
        return JSON.parse(JSON.stringify(value));
    },

    render() {
        this.importSettings._draft = this.importSettings._clone(AppImport.getProfiles(this.state.settings));
        this.importSettings._selectedId = this.importSettings._draft[0]?.id || null;

        const container = document.getElementById('import-profiles-editor');
        if (!container) return;
        container.oninput = e => this.importSettings.handleFieldChange(e);
        container.onchange = e => {
            if (e.target.id === 'import-profile-edit-select') {
                this.importSettings._selectedId = e.target.value;
                this.importSettings.renderEditor();
            } else {
                this.importSettings.handleFieldChange(e);
            }
        };
        document.getElementById('import-profile-duplicate-btn').onclick = () => this.importSettings.duplicateSelected();
        document.getElementById('import-profile-delete-btn').onclick = () => this.importSettings.deleteSelected();
        document.getElementById('import-profile-reset-btn').onclick = () => this.importSettings.resetToDefaults();
        this.importSettings.renderEditor();
    },

    _selected() {
        return this.importSettings._draft.find(p => p.id === this.importSettings._selectedId);
    },

    renderEditor() {
        const esc = this.utils.escapeHtml;
        const profile = this.importSettings._selected();
        const select = document.getElementById('import-profile-edit-select');
        select.innerHTML = this.importSettings._draft
            .map(p => `<option value="${esc(p.id)}" ${p.id === this.importSettings._selectedId ? 'selected' : ''}>${esc(p.name)}</option>`)
            .join('');
        const form = document.getElementById('import-profile-form');
        if (!profile) {
            form.innerHTML = '';
            return;
        }

        const text = (field, label, value, hint = '') => `
            <div>
                <label class="text-xs font-bold text-text-secondary" for="import-field-${field}">${label}</label>
                <input type="text" id="import-field-${field}" data-field="${field}" class="form-input w-full mt-1" value="${esc(value)}">
                ${hint ? `<p class="text-[11px] text-text-muted mt-1">${hint}</p>` : ''}
            </div>`;
        const choice = (field, label, value, options) => `
            <div>
                <label class="text-xs font-bold text-text-secondary" for="import-field-${field}">${label}</label>
                <select id="import-field-${field}" data-field="${field}" class="form-select w-full mt-1">
                    ${options.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
            </div>`;
        const check = (field, label, value) => `
            <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" data-field="${field}" class="form-input" ${value ? 'checked' : ''}> ${label}
            </label>`;
        const columnInputs = AppImport.FIELDS.map(f => `
            <div>
                <label class="text-xs font-bold text-text-secondary" for="import-col-${f.id}">${f.label}${f.required ? ' *' : ''}</label>
                <input type="text" id="import-col-${f.id}" data-column="${f.id}" class="form-input w-full mt-1" value="${esc((profile.columns || {})[f.id] || '')}">
            </div>`).join('');

        form.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${text('name', 'Nama Profil', profile.name)}
                ${choice('fileType', 'Jenis File', profile.fileType, [['csv', 'CSV'], ['xlsx', 'Excel (.xlsx)']])}
                ${text('delimiter', 'Pemisah CSV', profile.delimiter, 'Gunakan \\t untuk Tab. Diabaikan untuk Excel.')}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${text('headerKeywords', 'Kata Kunci Header', (profile.headerKeywords || []).join(', '), 'Kata yang harus ada di baris header, dipisah koma. Dipakai juga untuk deteksi otomatis.')}
                <div class="flex items-end pb-6">${check('headerRequired', 'Header wajib ada (dicari di 10 baris awal; sheet tanpa header dilewati)', profile.headerRequired)}</div>
            </div>
            <div>
                <div class="font-bold text-sm">Pemetaan Kolom</div>
                <p class="text-xs text-text-secondary mt-1">Tulis nama header persis seperti di file (huruf besar/kecil bebas). Beberapa alternatif dipisah <code>|</code> — isi pertama yang tidak kosong dipakai. Gunakan <code>#3</code> untuk kolom ke-3. Kosongkan bila tidak ada.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mt-2">${columnInputs}</div>
            </div>
            ${text('template', 'Template Keterangan', profile.template, 'Placeholder: {keterangan} {ref} {metode} {pembayar} {kodeOutlet} {namaOutlet}. Bagian [a|b|c] memilih alternatif pertama yang semua placeholder-nya terisi. Ubah dengan hati-hati: keterangan yang berbeda dari data lama membuat duplikat tidak terdeteksi.')}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${choice('tipe', 'Tipe Transaksi', profile.tipe, [['auto', 'Otomatis (Kata Kunci Routing)'], ['MANUAL', 'Selalu MANUAL'], ['TIKET', 'Selalu TIKET']])}
                ${choice('dateFormat', 'Format Tanggal', profile.dateFormat, [['auto', 'Otomatis (Prioritas Format Tanggal)'], ['dmy', 'DD/MM/YYYY'], ['iso', 'ISO (YYYY-MM-DDTHH:mm)']])}
                ${choice('amountFormat', 'Format Jumlah', profile.amountFormat, [['id', 'Indonesia (1.234,56)'], ['en', 'Internasional (1,234.56)']])}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${text('statusValues', 'Status yang Diproses', (profile.statusValues || []).join(', '), 'Isi mis. success agar hanya baris dengan kolom Status tsb yang masuk. Kosongkan untuk semua baris.')}
                ${text('skipPrefixes', 'Lewati Bila Nama Outlet Diawali', (profile.skipPrefixes || []).join(', '), 'Mis. subtotal, total, note:')}
            </div>
            <div class="flex flex-wrap gap-6">
                ${check('skipIfNoOutlet', 'Lewati baris tanpa Nama Outlet', profile.skipIfNoOutlet)}
                ${check('skipNonPositive', 'Lewati baris dengan jumlah ≤ 0 / tidak terbaca', profile.skipNonPositive)}
            </div>
            <div id="import-profile-errors" class="text-xs text-color-danger"></div>
        `;
        this.importSettings.showErrors();
    },

    handleFieldChange(e) {
        const profile = this.importSettings._selected();
        if (!profile) return;
        const el = e.target;
        const listFields = ['headerKeywords', 'statusValues', 'skipPrefixes'];

        if (el.dataset.column) {
            profile.columns = { ...(profile.columns || {}), [el.dataset.column]: el.value };
        } else if (el.dataset.field) {
            const field = el.dataset.field;
            if (el.type === 'checkbox') profile[field] = el.checked;
            else if (listFields.includes(field)) profile[field] = el.value.split(',').map(s => s.trim()).filter(Boolean);
            else profile[field] = el.value;

            if (field === 'name') {
                const option = document.querySelector(`#import-profile-edit-select option[value="${CSS.escape(profile.id)}"]`);
                if (option) option.textContent = el.value;
            }
        } else {
            return;
        }
        this.importSettings.showErrors();
    },

    showErrors() {
        const box = document.getElementById('import-profile-errors');
        const profile = this.importSettings._selected();
        if (!box || !profile) return;
        const errors = AppImport.validateProfile(profile);
        box.innerHTML = errors.map(err => `<div>• ${this.utils.escapeHtml(err)}</div>`).join('');
    },

    duplicateSelected() {
        const source = this.importSettings._selected();
        if (!source) return;
        const copy = { ...this.importSettings._clone(source), id: `custom_${Date.now()}`, name: `${source.name} (salinan)` };
        this.importSettings._draft = [...this.importSettings._draft, copy];
        this.importSettings._selectedId = copy.id;
        this.importSettings.renderEditor();
    },

    deleteSelected() {
        const profile = this.importSettings._selected();
        if (!profile) return;
        if (this.importSettings._draft.length <= 1) {
            this.ui.showModal('Info', 'Minimal harus ada satu profil format import.');
            return;
        }
        if (!confirm(`Hapus profil "${profile.name}"? Perubahan tersimpan setelah menekan Simpan Pengaturan.`)) return;
        this.importSettings._draft = this.importSettings._draft.filter(p => p.id !== profile.id);
        this.importSettings._selectedId = this.importSettings._draft[0].id;
        this.importSettings.renderEditor();
    },

    resetToDefaults() {
        if (!confirm('Kembalikan semua profil format import ke bawaan? Profil tambahan akan dihapus setelah menekan Simpan Pengaturan.')) return;
        this.importSettings._draft = this.importSettings._clone(AppImport.DEFAULT_PROFILES);
        this.importSettings._selectedId = this.importSettings._draft[0].id;
        this.importSettings.renderEditor();
    },

    // Kesalahan semua profil, diberi nama profil (dipakai sebelum menyimpan).
    validateAll() {
        return this.importSettings._draft.flatMap(p =>
            AppImport.validateProfile(p).map(err => `${p.name || '(tanpa nama)'}: ${err}`));
    },

    getProfiles() {
        return this.importSettings._clone(this.importSettings._draft);
    }
};
