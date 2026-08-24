const AppHandlers = {
    _throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    _setupExportDropdown(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const toggleBtn = container.querySelector('button');
        const menu = container.querySelector('div');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });

        window.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    },

    setupFilterPresets() {
        const presetPanel = document.getElementById('filter-preset-panel');
        if (!presetPanel) return;

        if (this.state.currentUser) {
            presetPanel.classList.remove('hidden');
            const toggleBtn = document.getElementById('preset-dropdown-toggle');
            const menu = document.getElementById('preset-dropdown-menu');
            const saveBtn = document.getElementById('save-new-preset-btn');
            const newNameInput = document.getElementById('new-preset-name-input');

            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                const isHidden = menu.classList.contains('hidden');
                
                if (isHidden) {
                    const rect = toggleBtn.getBoundingClientRect();
                    document.body.appendChild(menu);
                    menu.style.position = 'absolute';
                    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
                    menu.style.left = `${rect.left + window.scrollX}px`;
                    menu.style.width = `${rect.width}px`;
                    menu.classList.remove('hidden');
                } else {
                    menu.classList.add('hidden');
                }
                
                toggleBtn.querySelector('[data-lucide="chevron-down"]').classList.toggle('rotate-180', isHidden);
            };

            saveBtn.onclick = (e) => {
                e.stopPropagation();
                this.handlers.handleSavePreset();
            };
            
            newNameInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handlers.handleSavePreset();
                }
            };

            window.addEventListener('click', (e) => {
                if (!menu.classList.contains('hidden') && !presetPanel.contains(e.target)) {
                    menu.classList.add('hidden');
                    toggleBtn.querySelector('[data-lucide="chevron-down"]').classList.remove('rotate-180');
                }
            });
            
            this.handlers.populatePresetDropdown();

        } else {
            presetPanel.classList.add('hidden');
        }
    },

    populatePresetDropdown() {
        const container = document.getElementById('preset-list-container');
        const presets = this.state.filterPresets || [];
        container.innerHTML = '';

        if (presets.length === 0) {
            container.innerHTML = '<p class="text-xs text-text-muted text-center p-2">Belum ada preset tersimpan.</p>';
            return;
        }

        presets.forEach(preset => {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center p-2 rounded hover:bg-white/10 group';
            
            const nameButton = document.createElement('button');
            nameButton.className = 'text-left flex-grow truncate';
            nameButton.textContent = preset.name;
            nameButton.dataset.presetName = preset.name;
            nameButton.onclick = () => this.handlers.handleSelectPreset(preset.name);

            const deleteButton = document.createElement('button');
            deleteButton.className = 'text-text-muted hover:text-color-danger p-1 opacity-0 group-hover:opacity-100 transition-opacity';
            deleteButton.innerHTML = '<i data-lucide="x-circle" class="w-4 h-4 pointer-events-none"></i>';
            deleteButton.dataset.presetName = preset.name;
            deleteButton.title = `Hapus preset "${preset.name}"`;
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                this.handlers.handleDeletePreset(preset.name);
            };

            item.appendChild(nameButton);
            item.appendChild(deleteButton);
            container.appendChild(item);
        });
        lucide.createIcons();
    },
    
    handleSelectPreset(presetName) {
        const preset = this.state.filterPresets.find(p => p.name === presetName);
        if (preset) {
            this.dom.filterSearch.value = preset.values.search || "";
            this.dom.filterStartDate.value = preset.values.startDate || "";
            this.dom.filterEndDate.value = preset.values.endDate || "";
            this.dom.filterType.value = preset.values.type || "all";
            
            document.getElementById('preset-dropdown-label').textContent = presetName;
            
            const menu = document.getElementById('preset-dropdown-menu');
            const toggleBtn = document.getElementById('preset-dropdown-toggle');
            menu.classList.add('hidden');
            toggleBtn.querySelector('[data-lucide="chevron-down"]').classList.remove('rotate-180');

            this.ui.renderFilteredContent(); 
        }
    },

    async handleSavePreset() {
        const newNameInput = document.getElementById('new-preset-name-input');
        const presetName = newNameInput.value.trim();

        if (!presetName) return;

        if (this.state.filterPresets.some(p => p.name.toLowerCase() === presetName.toLowerCase())) {
            this.ui.showModal("Error", `Preset dengan nama "${presetName}" sudah ada.`);
            return;
        }

        const newPreset = {
            name: presetName,
            values: {
                search: this.dom.filterSearch.value,
                startDate: this.dom.filterStartDate.value,
                endDate: this.dom.filterEndDate.value,
                type: this.dom.filterType.value,
            }
        };

        this.state.filterPresets.push(newPreset);
        
        this.ui.showLoader("Menyimpan preset...");
        try {
            await this.api.updateUserFilterPresets(this.state.currentUser.id, this.state.filterPresets);
            this.handlers.populatePresetDropdown();
            newNameInput.value = '';
            document.getElementById('preset-dropdown-label').textContent = presetName;
        } catch (error) {
            this.ui.showModal("Error", `Gagal menyimpan preset: ${error.message}`);
            this.state.filterPresets = this.state.filterPresets.filter(p => p.name !== presetName);
            this.handlers.populatePresetDropdown();
        } finally {
            this.ui.hideLoader();
        }
    },

    async handleDeletePreset(presetName) {
        this.handlers.showConfirmationModal({
            title: "Hapus Preset",
            message: `Anda yakin ingin menghapus preset "${presetName}"?`,
            confirmPhrase: "HAPUS",
            onConfirm: async () => {
                this.state.filterPresets = this.state.filterPresets.filter(p => p.name !== presetName);
                
                this.ui.showLoader("Menghapus preset...");
                try {
                    await this.api.updateUserFilterPresets(this.state.currentUser.id, this.state.filterPresets);
                    
                    const currentLabel = document.getElementById('preset-dropdown-label');
                    if (currentLabel.textContent === presetName) {
                        currentLabel.textContent = "Preset";
                    }
                    this.handlers.populatePresetDropdown();
                } catch (error) {
                    this.ui.showModal("Error", `Gagal menghapus preset: ${error.message}`);
                    const profile = await this.api.getProfile(this.state.currentUser.id);
                    this.state.filterPresets = Array.isArray(profile.filter_presets) ? profile.filter_presets : [];
                    this.handlers.populatePresetDropdown();
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    handleFilterReset() {
        this.dom.filterSearch.value = '';
        this.handlers.setDefaultDateFilters();
        this.dom.filterType.value = 'all';

        const presetLabel = document.getElementById('preset-dropdown-label');
        if (presetLabel) {
            presetLabel.textContent = 'Preset';
        }

        if (this.state.activeView === 'analysis') {
            this.state.analysisColumnFilters = {};
            const columnFilters = document.querySelectorAll('#analysis-grid-header input[data-filter-col]');
            columnFilters.forEach(input => input.value = '');
        }
        
        this.ui.renderFilteredContent();
    },

    handleAnalysisTableChange(e) {
        const target = e.target;
        const isCheckbox = target.matches('.analysis-row-checkbox, .audit-pair-checkbox, #select-all-checkbox, #select-all-audit-checkbox');

        if (!isCheckbox) return;

        const isChecked = target.checked;

        if (this.state.isAuditMode) {
            if (target.id === 'select-all-audit-checkbox') {
                const allPairIds = this.state.currentAuditPairs.flatMap(p => [p.reversal.id, p.original.id]);
                if (isChecked) {
                    this.state.analysisSelectedIds = new Set(allPairIds);
                } else {
                    this.state.analysisSelectedIds.clear();
                }
            } else {
                const pairIds = target.dataset.pairId.split(',').map(id => parseInt(id, 10));
                if (isChecked) {
                    pairIds.forEach(id => this.state.analysisSelectedIds.add(id));
                } else {
                    pairIds.forEach(id => this.state.analysisSelectedIds.delete(id));
                }
            }

            const allCheckboxes = document.querySelectorAll('.audit-pair-checkbox');
            allCheckboxes.forEach(cb => {
                const pairIds = cb.dataset.pairId.split(',').map(id => parseInt(id, 10));
                cb.checked = pairIds.every(id => this.state.analysisSelectedIds.has(id));
            });

            const selectAllAuditCheckbox = document.getElementById('select-all-audit-checkbox');
            if (selectAllAuditCheckbox) {
                const totalPairs = this.state.currentAuditPairs.length;
                const selectedPairs = this.state.analysisSelectedIds.size / 2;

                if (selectedPairs > 0 && selectedPairs < totalPairs) {
                    selectAllAuditCheckbox.indeterminate = true;
                    selectAllAuditCheckbox.checked = false;
                } else {
                    selectAllAuditCheckbox.indeterminate = false;
                    selectAllAuditCheckbox.checked = selectedPairs > 0 && selectedPairs === totalPairs;
                }
            }

        } else {
            if (target.id === 'select-all-checkbox') {
                const allFilteredIds = this.state.virtualScrollInstances.analysis.fullData.map(item => item.id);
                if (isChecked) {
                    this.state.analysisSelectedIds = new Set(allFilteredIds);
                } else {
                    this.state.analysisSelectedIds.clear();
                }
            } else {
                const rowId = parseInt(target.dataset.rowId, 10);
                if (isChecked) {
                    this.state.analysisSelectedIds.add(rowId);
                } else {
                    this.state.analysisSelectedIds.delete(rowId);
                }
            }
            this.handlers.renderAnalysisTableHeader();
            if (this.state.virtualScrollInstances.analysis) {
                this.state.virtualScrollInstances.analysis.updateAndRender();
            }
        }
        
        this.handlers.updateActionButtonsState();
    },

    buildIndexes() {
        this.ui.setStatus('Mengindeks data untuk pencarian cepat...');
        const searchableText = new Map();
        
        for (const row of this.state.allData) {
            const searchTarget = [
                String(row.nama || ''),
                String(row.keterangan || ''),
                String(row.jumlah || '')
            ].join(' ').toLowerCase();
            searchableText.set(row.id, searchTarget);
        }

        this.state.dataIndexes = { searchableText };
        this.state.filterCache.clear();
        this.ui.setStatus(`Data diindeks. Total: ${this.state.allData.length} baris.`);
    },

    async fetchInitialData() {
        this.ui.setStatus('Mengambil data awal...');
        try {
            const initialData = await this.api.fetchAllData();
            const {
                nameConsolidation = {}
            } = this.state.settings;
            this.state.allData = initialData.map(row => {
                const normalizedName = this.utils.normalizeName(String(row.nama || ''));
                row.nama = nameConsolidation[normalizedName.toUpperCase()] || normalizedName;
                return row;
            });
            
            this.handlers.buildIndexes();

        } catch (error) {
            this.ui.displayError("Koneksi Gagal", `Gagal mengambil data awal.\n\nError: ${error.message}`);
            throw error;
        }
    },

    setupDataListeners() {
        if (this.state.dataChannel) {
            this.state.dataChannel = null;
        }
    },

    handleRealtimeUpdate(payload) {
        const {
            eventType,
            new: newRecord,
            old: oldRecord
        } = payload;
        let dataChanged = false;

        if (eventType === 'INSERT') {
            this.state.allData.unshift(newRecord);
            dataChanged = true;
        } else if (eventType === 'UPDATE') {
            const i = this.state.allData.findIndex(item => item.id === newRecord.id);
            if (i > -1) {
                this.state.allData[i] = newRecord;
                dataChanged = true;
            }
        } else if (eventType === 'DELETE') {
            const initialLength = this.state.allData.length;
            this.state.allData = this.state.allData.filter(item => item.id !== oldRecord.id);
            if (this.state.allData.length !== initialLength) {
                dataChanged = true;
            }
        }

        if (dataChanged) {
            this.handlers.buildIndexes();
        }

        if (this.state.isInitialRenderComplete) {
            this.ui.renderFilteredContent();
        }
        
        this.ui.setStatus(`Data diperbarui. Total: ${this.state.allData.length} baris.`);
    },

    setupClearButtons(container = document) {
        const inputs = container.querySelectorAll('input[type="text"], input[type="password"], input[type="email"], input[type="date"], input[type="number"], textarea');
        inputs.forEach(input => {
            const wrapper = input.parentElement;
            if (!wrapper.classList.contains('relative')) return;

            const clearBtn = wrapper.querySelector('.clear-btn');
            if (!clearBtn) return;

            const toggleClearBtn = () => {
                clearBtn.classList.toggle('hidden', !input.value);
            };

            input.addEventListener('input', toggleClearBtn);
            input.addEventListener('focus', toggleClearBtn);
            input.addEventListener('blur', () => setTimeout(toggleClearBtn, 150));

            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                input.value = '';
                toggleClearBtn();
                input.focus();
                input.dispatchEvent(new Event('input'));
            });

            toggleClearBtn();
        });
    },

    handleFeeCalculation() {
        const amountInput = document.getElementById('calc-amount-input');
        const typeContainer = document.getElementById('calc-type-segmented-control');
        const resultEl = document.getElementById('calc-result');

        if (!amountInput || !typeContainer || !resultEl) return;

        const activeButton = typeContainer.querySelector('.active');
        if (!activeButton) {
            resultEl.textContent = this.utils.formatCurrency(0);
            return;
        }

        const amount = this.utils.parseFormattedNumber(amountInput.value);
        const selectedKeyword = activeButton.dataset.keyword;

        const mockRow = {
            jumlah: amount,
            keterangan: selectedKeyword,
            tipe_sheet: selectedKeyword === 'TIKET DEPOSIT' ? 'TIKET' : 'MANUAL'
        };

        const calculatedFee = this.utils.calculateAdminFee(mockRow, this.state.settings);
        resultEl.textContent = this.utils.formatCurrency(calculatedFee);
    },

    openWidgetConfigModal() {
        const widgetConfig = this.state.settings.dashboardWidgets || [];
        const contentHTML = `
            <ul id="widget-settings-list" class="space-y-2 text-left">
                ${widgetConfig.map(widget => `
                    <li data-id="${widget.id}" class="flex items-center justify-between p-2 bg-black/20 rounded">
                        <div class="flex items-center gap-3">
                            <i data-lucide="grip-vertical" class="w-5 h-5 text-text-muted cursor-grab"></i>
                            <label for="widget-toggle-${widget.id}" class="font-bold">${widget.label}</label>
                        </div>
                        <div class="flex items-center gap-4">
                            <select id="widget-size-${widget.id}" class="form-select form-input bg-black/30 text-xs p-1 w-32">
                                <option value="small" ${widget.size === 'small' ? 'selected' : ''}>Kecil (1/3)</option>
                                <option value="half" ${widget.size === 'half' ? 'selected' : ''}>Setengah (1/2)</option>
                                <option value="full" ${widget.size === 'full' ? 'selected' : ''}>Penuh (1/1)</option>
                            </select>
                            <input type="checkbox" id="widget-toggle-${widget.id}" class="form-input h-5 w-5" ${widget.visible ? 'checked' : ''}>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;

        const footerHTML = `
            <div class="grid grid-cols-2 gap-2 mt-6">
                <button id="save-widget-config-btn" class="btn btn-primary w-full">Simpan</button>
                <button id="reset-widget-config-btn" class="btn btn-danger w-full">Reset</button>
            </div>
        `;

        this.ui.showModal(
            'Atur Widget Dashboard Pribadi',
            'Seret untuk mengurutkan, centang untuk menampilkan, dan pilih ukuran. Pengaturan ini hanya untuk Anda.',
            contentHTML, {
                size: 'large',
                footerHTML: footerHTML,
            }
        );

        lucide.createIcons();

        const list = document.getElementById('widget-settings-list');
        new Sortable(list, {
            animation: 150,
            ghostClass: 'bg-cyan-500/30',
            handle: '[data-lucide="grip-vertical"]'
        });

        document.getElementById('save-widget-config-btn').onclick = this.handlers.saveWidgetConfig;
        document.getElementById('reset-widget-config-btn').onclick = this.handlers.resetWidgetConfig;
    },

    async saveWidgetConfig() {
        const list = document.getElementById('widget-settings-list');
        if (!list || !this.state.currentUser) return;

        const newOrder = Array.from(list.children).map(li => li.dataset.id);
        const newConfig = newOrder.map(id => {
            const oldConfig = this.state.defaultConfig.publicDashboardLayout.find(w => w.id === id);
            const checkbox = list.querySelector(`li[data-id="${id}"] input[type="checkbox"]`);
            const sizeSelect = list.querySelector(`li[data-id="${id}"] select`);
            return { ...oldConfig,
                visible: checkbox.checked,
                size: sizeSelect.value
            };
        });

        this.ui.showLoader('Menyimpan konfigurasi...');
        try {
            await this.api.updateUserDashboardConfig(this.state.currentUser.id, newConfig);
            this.state.currentUser.dashboardConfig = newConfig;
            this.state.settings.dashboardWidgets = newConfig;
            this.ui.hideModal();
            this.ui.renderDashboardWidgets();
            this.api.logAction('UPDATE_WIDGET_CONFIG');
        } catch (e) {
            this.ui.showModal('Error', `Gagal menyimpan konfigurasi: ${e.message}`);
        } finally {
            this.ui.hideLoader();
        }
    },

    async resetWidgetConfig() {
        if (!this.state.currentUser) return;
        this.handlers.showConfirmationModal({
            title: 'Reset Konfigurasi Widget',
            message: 'Anda yakin ingin mengembalikan tata letak widget ke default?',
            confirmPhrase: 'RESET',
            onConfirm: async () => {
                this.ui.showLoader('Mereset konfigurasi...');
                try {
                    await this.api.updateUserDashboardConfig(this.state.currentUser.id, null);
                    this.state.currentUser.dashboardConfig = null;
                    await this.settings.load();
                    this.ui.renderDashboardWidgets();
                    this.api.logAction('RESET_WIDGET_CONFIG');
                } catch (e) {
                    this.ui.showModal('Error', `Gagal mereset: ${e.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    collectSettingsFromUI() {
        const getRoutingKeywords = () => ({
            manual: Array.from(document.querySelectorAll('#routing-manual-list span')).map(tag => tag.firstChild.textContent.trim()),
            tiket: Array.from(document.querySelectorAll('#routing-tiket-list span')).map(tag => tag.firstChild.textContent.trim())
        });

        const getAdminRules = () => Array.from(document.querySelectorAll('#admin-rules-list .rule-row-wrapper')).map(wrapper => {
            const inputs = wrapper.querySelectorAll('input, select');
            if (inputs.length > 1) {
                return {
                    keyword: inputs[0].value,
                    amount: parseFloat(inputs[1].value) || 0,
                    feeType: inputs[2].value,
                    feeValue: parseFloat(inputs[3].value) || 0
                };
            } else {
                const spans = wrapper.querySelectorAll('span');
                const feeText = spans[2].textContent.trim();
                const feeType = feeText.includes('%') ? 'percentage' : 'flat';
                let feeValue;
                if (feeType === 'percentage') {
                    feeValue = parseFloat(feeText.replace('%', '')) || 0;
                } else {
                    feeValue = this.utils.parseFormattedNumber(feeText);
                }
                return {
                    keyword: spans[0].textContent.trim(),
                    amount: this.utils.parseFormattedNumber(spans[1].textContent),
                    feeType,
                    feeValue
                };
            }
        }).sort((a, b) => a.amount - b.amount);

        const getNameConsolidation = () => Object.fromEntries(Array.from(document.querySelectorAll('#name-consolidation-list .rule-row-wrapper')).map(wrapper => {
            const inputs = wrapper.querySelectorAll('input');
            if (inputs.length > 1) {
                return [inputs[0].value.toUpperCase(), inputs[1].value];
            } else {
                const spans = wrapper.querySelectorAll('span');
                return [spans[0].textContent.trim().toUpperCase(), spans[1].textContent.trim()];
            }
        }));

        const getAuditRules = () => Array.from(document.querySelectorAll('#audit-rules-list .rule-row-wrapper')).map(wrapper => {
            const inputs = wrapper.querySelectorAll('input');
            if (inputs.length > 1) {
                return {
                    keyword1: inputs[0].value,
                    keyword2: inputs[1].value
                };
            } else {
                const spans = wrapper.querySelectorAll('span');
                return {
                    keyword1: spans[0].textContent.trim(),
                    keyword2: spans[1].textContent.trim()
                };
            }
        });

        const publicList = document.getElementById('public-widget-settings-list');
        const publicLayoutOrder = publicList ? Array.from(publicList.children).map(li => li.dataset.id) : [];
        const publicDashboardLayout = publicLayoutOrder.map(id => {
            const allDefaultWidgets = this.state.defaultConfig?.publicDashboardLayout || [];
            const oldConfig = allDefaultWidgets.find(w => w.id === id);
            
            const checkbox = publicList.querySelector(`li[data-id="${id}"] input[type="checkbox"]`);
            const sizeSelect = publicList.querySelector(`li[data-id="${id}"] select`);

            const isVisible = checkbox ? checkbox.checked : false;
            const size = sizeSelect ? sizeSelect.value : 'half';

            return {
                ...(oldConfig || { id: id, label: 'Unknown Widget' }),
                visible: isVisible,
                size: size
            };
        });

        const dataParsingSettings = {
            pasteDelimiter: document.getElementById('setting-paste-delimiter').value,
            csvDelimiter: document.getElementById('setting-csv-delimiter').value,
            columnOrder: Array.from(document.querySelectorAll('#parsing-column-destination .parsing-column-tag')).map(tag => tag.dataset.id),
            dateFormats: Array.from(document.querySelectorAll('#parsing-date-formats-list li')).map(li => {
                const id = li.dataset.id;
                const defaultConfigFormats = this.state.defaultConfig?.dataParsingSettings?.dateFormats || [];
                const settingsFormats = this.state.settings?.dataParsingSettings?.dateFormats || [];
                const allPossibleFormats = [...settingsFormats, ...defaultConfigFormats];
                const uniqueFormats = Array.from(new Map(allPossibleFormats.map(item => [item.id, item])).values());
                const originalFormat = uniqueFormats.find(f => f.id === id);
                return {
                    ...(originalFormat || { id: id }),
                    active: li.querySelector('input[type="checkbox"]').checked
                };
            })
        };

        const getWhatsappContacts = () => Array.from(document.querySelectorAll('#whatsapp-contacts-list .whatsapp-contact-item')).map(item => {
            const name = item.querySelector('span.font-bold').textContent;
            const number = item.querySelector('span.font-mono').textContent;
            return { name, number };
        });

        const {
            dashboardWidgets,
            ...currentSettings
        } = this.state.settings;

        this.state.settings = {
            ...currentSettings,
            dashboardWidgets,
            publicDashboardLayout,
            logoText: document.getElementById('setting-logo-text').value.trim(),
            logoDescription: document.getElementById('setting-logo-description').value.trim(),
            dataParsingSettings,
            backgroundUrl: document.getElementById('setting-bg-url').value.trim(),
            panelBlur: parseFloat(document.getElementById('setting-blur').value) || 0,
            isFlatTheme: document.getElementById('setting-flat-theme').checked, // BARU: Membaca nilai dari saklar
            outletCommissionPercentage: parseFloat(document.getElementById('setting-outlet-commission').value) || 0,
            csCommissionPercentage: parseFloat(document.getElementById('setting-cs-commission').value) || 0,
            targetCommission: parseFloat(document.getElementById('setting-target-commission').value) || 0,
            chartDataLimit: parseInt(document.getElementById('setting-chart-limit').value, 10) || 50,
            monthStartDay: parseInt(document.getElementById('setting-month-start-day').value, 10) || 29,
            monthEndDay: parseInt(document.getElementById('setting-month-end-day').value, 10) || 28,
            announcementText: document.getElementById('setting-announcement-text').value.trim(),
            announcementStyle: {
                fontSize: document.getElementById('setting-announcement-font-size').value,
                fontWeight: document.getElementById('setting-announcement-font-weight').value,
                color: document.getElementById('setting-announcement-color').value,
                animation: document.getElementById('setting-announcement-animation').value,
            },
            exceptionKeywords: document.getElementById('setting-exceptions').value.split(',').map(s => s.trim()).filter(Boolean),
            routingKeywords: getRoutingKeywords(),
            adminRules: getAdminRules(),
            nameConsolidation: getNameConsolidation(),
            auditRules: getAuditRules(),
            auditPanelEnabled: document.getElementById('setting-audit-panel-enabled').checked,
            adminBankFeePercent: parseFloat(document.getElementById('setting-admin-bank-fee').value) || 0,
            adminBankKeywords: document.getElementById('setting-admin-bank-keywords').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
            ticketFeeDestination: document.getElementById('setting-ticket-fee-destination').value,
            whatsappContacts: getWhatsappContacts()
        };
    },

    async listenToLogChanges() {
        if (this.state.logChannel) {
            this.state.logChannel = null;
        }
    
        const hiddenPublicActions = ['LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGIN_FAIL_INACTIVE', 'LOGOUT'];
    
        const renderLogs = (logs) => {
            const logList = document.getElementById('public-log-list');
            if (logList && logs) {
                const logsToDisplay = !this.state.currentUser
                    ? logs.filter(log => !hiddenPublicActions.includes(log.action))
                    : logs;
    
                logList.innerHTML = logsToDisplay.map(log => `
                    <div class="p-1 rounded bg-black/20 text-xs">
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-color-primary">${log.action}</span>
                            <span class="text-text-muted">${new Date(log.created_at).toLocaleTimeString('id-ID')}</span>
                        </div>
                        <p class="text-text-secondary truncate">oleh: ${this.utils.censorEmail(log.actor)}</p>
                    </div>
                `).join('');
            }
        };
    
        try {
            const logs = await this.api.req('/logs/recent?limit=10');
            renderLogs(logs.slice(0, 3));
        } catch (e) {
            console.error("Gagal mengambil log awal:", e);
        }
    },

    async showFullLogModal() {
        this.ui.showLoader('Memuat semua log...');
        try {
            const logs = await this.api.req('/logs?limit=500');

            const tableContent = `
                <div class="border border-border-color rounded-lg overflow-hidden">
                    <table class="w-full text-left text-xs table-fixed">
                        <thead class="bg-bg-panel backdrop-blur-sm">
                            <tr>
                                <th class="p-2 w-40">Waktu</th>
                                <th class="p-2 w-48">Pengguna</th>
                                <th class="p-2 w-40">Aksi</th>
                                <th class="p-2">Detail</th>
                            </tr>
                        </thead>
                    </table>
                    <div id="log-modal-scroll-container" class="overflow-auto h-[50vh] relative">
                         <div id="log-modal-scroller" class="relative w-full">
                            <table class="w-full text-left text-xs absolute top-0 left-0 table-fixed">
                                <tbody id="log-modal-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            
            this.ui.showModal(
                'Log Aktivitas Sistem',
                `Menampilkan ${logs.length} log terakhir.`,
                tableContent, {
                    size: 'large',
                    onClose: () => {
                        if (this.state.virtualScrollInstances.logModal) {
                            this.state.virtualScrollInstances.logModal.destroy();
                            delete this.state.virtualScrollInstances.logModal;
                        }
                    }
                }
            );

            const renderLogModalRow = (log) => {
                return `
                    <tr class="h-[48px]">
                        <td class="p-2 w-40 text-text-muted whitespace-nowrap">${new Date(log.created_at).toLocaleString('id-ID', {dateStyle:'short', timeStyle:'medium'})}</td>
                        <td class="p-2 w-48 truncate">${log.actor}</td>
                        <td class="p-2 w-40 font-mono text-color-primary truncate">${log.action}</td>
                        <td class="p-2 text-text-muted break-all">${this.utils.formatLogDetails(log.details)}</td>
                    </tr>
                `;
            };

            const vsInstance = VirtualScrollManager.create({
                containerEl: document.getElementById('log-modal-scroll-container'),
                scrollerEl: document.getElementById('log-modal-scroller'),
                contentEl: document.getElementById('log-modal-tbody'),
                fullData: logs,
                renderRowFunction: renderLogModalRow,
                rowHeight: 48,
            });
            this.state.virtualScrollInstances.logModal = vsInstance;
            vsInstance.initialize();

        } catch (err) {
            this.ui.showModal('Error', `Gagal memuat log: ${err.message}`);
        } finally {
            this.ui.hideLoader();
        }
    },

    getFilteredData() {
        const searchTerm = this.dom.filterSearch.value.toLowerCase();
        const startDateVal = this.dom.filterStartDate.value;
        const endDateVal = this.dom.filterEndDate.value;
        const typeFilter = this.dom.filterType.value;

        const cacheKey = `${searchTerm}|${startDateVal}|${endDateVal}|${typeFilter}`;
        if (this.state.filterCache.has(cacheKey)) {
            return this.state.filterCache.get(cacheKey);
        }

        const { searchableText } = this.state.dataIndexes;
        const searchWords = searchTerm.split(' ').filter(w => w);
        const startDate = startDateVal ? new Date(startDateVal) : null;
        if (startDate) startDate.setHours(0, 0, 0, 0);
        const endDate = endDateVal ? new Date(endDateVal) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);
        
        const filteredResult = [];
        for (const row of this.state.allData) {
            if (typeFilter !== 'all' && row.tipe_sheet !== typeFilter) {
                continue;
            }

            const rowDate = new Date(row.tanggal);
            if ((startDate && rowDate < startDate) || (endDate && rowDate > endDate)) {
                continue;
            }

            if (searchWords.length > 0) {
                const textToSearch = searchableText.get(row.id);
                if (!textToSearch || !searchWords.every(word => textToSearch.includes(word))) {
                    continue;
                }
            }
            
            filteredResult.push(row);
        }
        
        this.state.analysisSelectedIds.clear();
        this.state.filterCache.set(cacheKey, filteredResult);
        
        return filteredResult;
    },


    getAuditFilteredData() {
        const baseData = this.state.allData;
        const startDate = this.dom.filterStartDate.value ? new Date(this.dom.filterStartDate.value) : null;
        if (startDate) startDate.setHours(0, 0, 0, 0);
        const endDate = this.dom.filterEndDate.value ? new Date(this.dom.filterEndDate.value) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);
        
        this.state.analysisSelectedIds.clear();

        return baseData.filter(row => {
            const rowDate = new Date(row.tanggal);
            const dateMatch = (!startDate || rowDate >= startDate) && (!endDate || rowDate <= endDate);
            return dateMatch;
        });
    },

    aggregateData(data) {
        const summary = {
            byType: {
                'MANUAL': { count: 0, totalAdminFee: 0, totalCommissionOutlet: 0 },
                'TIKET': { count: 0, totalAdminFee: 0, totalCommissionOutlet: 0 }
            },
            byUser: {}
        };
        const { outletCommissionPercentage, csCommissionPercentage, ticketFeeDestination } = this.state.settings;

        const userAggregates = {};
        data.forEach(row => {
            const { nama: user, jumlah, tipe_sheet: type } = row;
            if (!user) return;

            const adminFeeForRow = this.utils.calculateAdminFee(row, this.state.settings);

            if (summary.byType[type]) {
                summary.byType[type].count++;
                summary.byType[type].totalAdminFee += adminFeeForRow;
            }
            if (!userAggregates[user]) {
                userAggregates[user] = {
                    manualFee: 0,
                    tiketFee: 0,
                    tiketUnik: 0,
                    count: 0,
                    total: 0
                };
            }
            
            const value = parseFloat(jumlah) || 0;

            userAggregates[user].count++;
            userAggregates[user].total += value;

            if (type === 'MANUAL') {
                userAggregates[user].manualFee += adminFeeForRow;
            } else if (type === 'TIKET') {
                const feeFromTicketNominal = parseInt(String(Math.abs(value)).split('.')[0].slice(-3)) || 0;
                const feeFromRules = adminFeeForRow - feeFromTicketNominal;
                userAggregates[user].tiketFee += feeFromRules;
                userAggregates[user].tiketUnik += feeFromTicketNominal;
            }
        });

        for (const user in userAggregates) {
            const adminData = userAggregates[user];
            
            let commissionBase = adminData.manualFee + adminData.tiketFee;
            if (ticketFeeDestination === 'adminFee') {
                commissionBase += adminData.tiketUnik;
            }

            let initialCommissionOutlet = commissionBase * (outletCommissionPercentage / 100);
            if (ticketFeeDestination === 'outletCommission') {
                initialCommissionOutlet += adminData.tiketUnik;
            }

            const calculatedCommissionCS = initialCommissionOutlet * (csCommissionPercentage / 100);
            const netCommissionOutlet = initialCommissionOutlet - calculatedCommissionCS;

            let initialCommissionManual = adminData.manualFee * (outletCommissionPercentage / 100);
            let initialCommissionTiket = adminData.tiketFee * (outletCommissionPercentage / 100);
            if (ticketFeeDestination === 'adminFee') {
                if (commissionBase > 0) {
                    const nominalUnikCommission = adminData.tiketUnik * (outletCommissionPercentage / 100);
                    initialCommissionTiket += nominalUnikCommission;
                }
            } else {
                initialCommissionTiket += adminData.tiketUnik;
            }
            const totalInitialCommissionForSplit = initialCommissionManual + initialCommissionTiket;

            let netCommissionFromManual = 0;
            let netCommissionFromTiket = 0;
            if (totalInitialCommissionForSplit > 0) {
                netCommissionFromManual = (initialCommissionManual / totalInitialCommissionForSplit) * netCommissionOutlet;
                netCommissionFromTiket = (initialCommissionTiket / totalInitialCommissionForSplit) * netCommissionOutlet;
            }

            let totalAdminFee = adminData.manualFee + adminData.tiketFee + adminData.tiketUnik;

            summary.byUser[user] = {
                count: adminData.count,
                total: adminData.total,
                manualFee: adminData.manualFee,
                tiketFee: adminData.tiketFee,
                tiketUnik: adminData.tiketUnik,
                totalAdminFee: totalAdminFee,
                avgAdminFee: adminData.count > 0 ? Math.round(totalAdminFee / adminData.count) : 0,
                commission: totalAdminFee,
                commissionOutlet: Math.round(netCommissionOutlet),
                commissionCS: Math.round(calculatedCommissionCS),
                commissionFromManual: netCommissionFromManual,
                commissionFromTiket: netCommissionFromTiket,
            };
        }

        for (const userData of Object.values(summary.byUser)) {
            summary.byType['MANUAL'].totalCommissionOutlet += userData.commissionFromManual;
            summary.byType['TIKET'].totalCommissionOutlet += userData.commissionFromTiket;
        }

        return summary;
    },

    // --- FUNGSI BARU UNTUK MENGURUTKAN RINGKASAN ---
    handleSummarySort(sortBy) {
        const { summarySort } = this.state;
        if (summarySort.column === sortBy) {
            summarySort.direction = summarySort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            summarySort.column = sortBy;
            summarySort.direction = 'desc'; // Default ke menurun saat kolom baru dipilih
        }
        this.handlers.renderSummaryView(); // Render ulang dengan pengurutan baru
    },
    // --- AKHIR FUNGSI BARU ---

    setupSummaryView() {
        const vsInstance = VirtualScrollManager.create({
            containerEl: document.getElementById('summary-table-body-wrapper'),
            scrollerEl: document.getElementById('summary-scroller'),
            contentEl: document.getElementById('summary-table-body'),
            fullData: [],
            renderRowFunction: this.handlers.createSummaryTableRow.bind(this),
            rowHeight: 41,
        });
        this.state.virtualScrollInstances.summary = vsInstance;
        vsInstance.initialize();
        
        // --- PEMBARUAN: Tambahkan event listener ke header ---
        const headerDiv = document.getElementById('summary-table-header');
        if (headerDiv) {
            headerDiv.addEventListener('click', (e) => {
                const headerCell = e.target.closest('.sortable-summary-header');
                if (headerCell) {
                    this.handlers.handleSummarySort(headerCell.dataset.sortBy);
                }
            });
        }
        // --- AKHIR PEMBARUAN ---

        this.handlers.renderSummaryView();
        
        this.handlers._setupExportDropdown('summary-export-dropdown-container');

        const getSummaryExportData = () => {
            const headers = this.state.settings.publicSummaryColumns
                .filter(c => this.state.currentUser ? true : c.visible);
            const data = this.state.lastSummaryData;
            const footer = {};
            footer[headers[0].id] = 'TOTAL';
            headers.slice(1).forEach(col => {
                if (col.isCurrency || col.id === 'count') {
                    footer[col.id] = data.reduce((sum, row) => sum + (row[col.id] || 0), 0);
                }
            });
            return { headers, data, footer };
        };

        document.getElementById('export-summary-csv').onclick = () => {
            const { headers, data, footer } = getSummaryExportData();
            this.utils.exportToCSV('ringkasan_outlet.csv', headers, data, footer);
        };
        document.getElementById('export-summary-xlsx').onclick = () => {
            const { headers, data, footer } = getSummaryExportData();
            this.utils.exportToXLSX('ringkasan_outlet.xlsx', headers, data, footer);
        };
        document.getElementById('export-summary-json').onclick = () => {
            const { data } = getSummaryExportData();
            this.utils.exportToJSON('ringkasan_outlet.json', data);
        };
        document.getElementById('export-summary-pdf').onclick = () => {
            const { headers, data, footer } = getSummaryExportData();
            this.utils.exportToPDF('Ringkasan Outlet', headers, data, footer);
        };
        document.getElementById('export-summary-copy').onclick = () => {
            const { headers, data } = getSummaryExportData();
            this.utils.copyToClipboard(headers, data);
        };

        const settingsPanel = document.getElementById('column-settings-panel');
        const toggleBtn = document.getElementById('toggle-column-settings');
        const role = this.state.currentUser?.role;

        if (role === 'Master' || role === 'Admin') {
            toggleBtn.style.display = 'flex';
            toggleBtn.onclick = () => {
                if (settingsPanel.classList.contains('hidden')) {
                    this.ui.renderColumnSettingsPanel();
                    settingsPanel.classList.remove('hidden');
                } else {
                    settingsPanel.classList.add('hidden');
                }
            };
            document.getElementById('cancel-column-settings').onclick = () => {
                settingsPanel.classList.add('hidden');
            };
            document.getElementById('save-column-settings').onclick = () => {
                const list = document.getElementById('column-settings-list');
                const newOrder = Array.from(list.children).map(li => li.dataset.id);
                const newConfig = newOrder.map(id => {
                    const oldConfig = this.state.settings.publicSummaryColumns.find(c => c.id === id);
                    const checkbox = list.querySelector(`li[data-id="${id}"] input[type="checkbox"]`);
                    return { ...oldConfig,
                        visible: checkbox.checked
                    };
                });
                this.state.settings.publicSummaryColumns = newConfig;
                this.settings.saveGlobal();
                this.handlers.renderSummaryView();
                settingsPanel.classList.add('hidden');
            };
        } else {
            toggleBtn.style.display = 'none';
        }

        const tableBody = document.getElementById('summary-table-body');
        if (tableBody) {
            tableBody.addEventListener('click', this.handlers.handleSummaryRowClick);
        }
    },

    createSummaryTableRow(row) {
        let visibleColumns;
        const isUserLoggedIn = !!this.state.currentUser;
        if (isUserLoggedIn) {
            visibleColumns = this.state.settings.publicSummaryColumns;
        } else {
            visibleColumns = this.state.settings.publicSummaryColumns.filter(c => c.visible);
        }
    
        const cellsHTML = visibleColumns.map(col => {
            const value = row[col.id];
            const formattedValue = col.isCurrency ? this.utils.formatCurrency(value) : (value.toLocaleString ? value.toLocaleString('id-ID') : value);
            return `<div class="p-2 truncate ${col.align}">${formattedValue}</div>`;
        }).join('');
    
        return `
            <div class="h-[41px] summary-grid-layout items-center border-t border-border-color/50 hover:bg-color-primary/10 summary-row-clickable" data-username="${row.namaPengguna}">
                ${cellsHTML}
            </div>
        `;
    },

    // --- FUNGSI BARU UNTUK MERENDER HEADER TABEL RINGKASAN ---
    renderSummaryTableHeader() {
        const headerDiv = document.getElementById('summary-table-header');
        if (!headerDiv) return;

        const { column, direction } = this.state.summarySort;

        let visibleColumns;
        const isUserLoggedIn = !!this.state.currentUser;
        if (isUserLoggedIn) {
            visibleColumns = this.state.settings.publicSummaryColumns;
        } else {
            visibleColumns = this.state.settings.publicSummaryColumns.filter(c => c.visible);
        }

        const headerCellsHTML = visibleColumns.map(col => {
            const isSortable = col.id !== 'actions'; // Semua kolom bisa diurutkan kecuali aksi
            const sortIcon = col.id === column 
                ? (direction === 'asc' ? '<i data-lucide="arrow-up" class="w-4 h-4 ml-2"></i>' : '<i data-lucide="arrow-down" class="w-4 h-4 ml-2"></i>')
                : '<i data-lucide="arrow-up-down" class="w-4 h-4 ml-2 text-text-muted"></i>';

            if (isSortable) {
                return `
                    <div class="p-2 ${col.align} sortable-summary-header cursor-pointer hover:bg-color-primary/10 flex items-center ${col.align === 'text-right' ? 'justify-end' : ''}" data-sort-by="${col.id}">
                        ${col.label} ${sortIcon}
                    </div>
                `;
            }
            return `<div class="p-2 ${col.align}">${col.label}</div>`;
        }).join('');

        headerDiv.innerHTML = `
            <div class="summary-grid-layout font-bold text-text-secondary text-xs uppercase border-b border-border-color">
                ${headerCellsHTML}
            </div>
        `;
        lucide.createIcons();
    },
    // --- AKHIR FUNGSI BARU ---

    renderSummaryView() {
        const filteredData = this.handlers.getFilteredData();
        const aggregatedData = this.handlers.aggregateData(filteredData);

        const manualData = aggregatedData.byType['MANUAL'] || { count: 0, totalAdminFee: 0 };
        const tiketData = aggregatedData.byType['TIKET'] || { count: 0, totalAdminFee: 0 };
        document.getElementById('summary-info-manual-total').textContent = this.utils.formatCurrency(manualData.totalAdminFee);
        document.getElementById('summary-info-manual-count').textContent = `${manualData.count.toLocaleString('id-ID')} Transaksi`;
        document.getElementById('summary-info-tiket-total').textContent = this.utils.formatCurrency(tiketData.totalAdminFee);
        document.getElementById('summary-info-tiket-count').textContent = `${tiketData.count.toLocaleString('id-ID')} Transaksi`;
        document.getElementById('summary-info-filtered-count').textContent = filteredData.length.toLocaleString('id-ID');
        document.getElementById('summary-info-total-count').textContent = `dari ${this.state.allData.length.toLocaleString('id-ID')} total data`;

        const combinedData = Object.keys(aggregatedData.byUser).map(user => {
            const userData = aggregatedData.byUser[user];
            return {
                namaPengguna: user,
                count: userData.count || 0,
                commission: userData.commission || 0,
                commissionOutlet: userData.commissionOutlet || 0,
                commissionCS: userData.commissionCS || 0,
                totalAdminFee: userData.totalAdminFee || 0,
                manualFee: (userData.manualFee || 0) + (userData.tiketFee || 0),
                tiketFee: userData.tiketUnik || 0,
                avgAdminFee: userData.avgAdminFee || 0,
            };
        });

        // --- PEMBARUAN: Logika pengurutan ditambahkan di sini ---
        const { column, direction } = this.state.summarySort;
        combinedData.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            // Jika kolom adalah nama, urutkan sebagai string (case-insensitive)
            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        // --- AKHIR PEMBARUAN ---

        this.state.lastSummaryData = combinedData;

        // --- PEMBARUAN: Panggil fungsi render header ---
        this.handlers.renderSummaryTableHeader();
        // --- AKHIR PEMBARUAN ---
        
        const footerDiv = document.getElementById('summary-table-footer');

        let visibleColumns;
        const isUserLoggedIn = !!this.state.currentUser;
        if (isUserLoggedIn) {
            visibleColumns = this.state.settings.publicSummaryColumns;
        } else {
            visibleColumns = this.state.settings.publicSummaryColumns.filter(c => c.visible);
        }

        if (this.state.virtualScrollInstances.summary) {
            this.state.virtualScrollInstances.summary.updateData(combinedData);
        }

        let footerRowHTML = `<div class="summary-grid-layout font-bold">`;
        let isFirstCol = true;
        visibleColumns.forEach(col => {
            if (isFirstCol) {
                footerRowHTML += `<div class="p-2">TOTAL</div>`;
                isFirstCol = false;
            } else {
                let total = 0;
                if (col.isCurrency || col.id === 'count') {
                    total = combinedData.reduce((sum, row) => sum + (row[col.id] || 0), 0);
                }
                const formattedTotal = col.isCurrency ? this.utils.formatCurrency(total) : (total.toLocaleString ? total.toLocaleString('id-ID') : '');
                footerRowHTML += `<div class="p-2 ${col.align}">${formattedTotal}</div>`;
            }
        });
        footerRowHTML += '</div>';
        footerDiv.innerHTML = footerRowHTML;
    },

    renderChartsView() {
        const appNameEl = document.getElementById('charts-app-name');
        const dateRangeEl = document.getElementById('charts-date-range');

        if (appNameEl) {
            appNameEl.textContent = this.state.settings.logoText || 'Grafik & Diagram';
        }

        if (dateRangeEl) {
            const startDate = this.dom.filterStartDate.value;
            const endDate = this.dom.filterEndDate.value;
            if (startDate && endDate) {
                dateRangeEl.textContent = `Periode Data: ${startDate} hingga ${endDate}`;
            } else {
                dateRangeEl.textContent = 'Menampilkan semua data';
            }
        }

        const filteredData = this.handlers.getFilteredData();
        const aggregatedData = this.handlers.aggregateData(filteredData);
        this.ui.renderDataCharts(aggregatedData);
        
        this.handlers._setupExportDropdown('charts-export-dropdown-container');
        document.getElementById('download-charts-png').onclick = () => this.utils.downloadChartReport('png');
        document.getElementById('download-charts-jpeg').onclick = () => this.utils.downloadChartReport('jpeg');
        document.getElementById('download-charts-pdf').onclick = () => this.utils.downloadChartReport('pdf');
    },

    _createAnalysisVirtualScroll() {
        if (this.state.virtualScrollInstances.analysis) {
            this.state.virtualScrollInstances.analysis.destroy();
        }
        const vsInstance = VirtualScrollManager.create({
            containerEl: document.getElementById('analysis-table-container'),
            scrollerEl: document.getElementById('analysis-scroller'),
            contentEl: document.getElementById('analysis-grid-body'),
            fullData: [],
            renderRowFunction: this.handlers.createAnalysisTableRow.bind(this),
            rowHeight: 40,
            // PERUBAHAN: Menghapus onRenderCallback untuk menerapkan event delegation
            onRenderCallback: () => {
                lucide.createIcons();
            }
        });
        this.state.virtualScrollInstances.analysis = vsInstance;
        vsInstance.initialize();
    },

    setupAnalysisView() {
        const role = this.state.currentUser?.role;
        const { auditPanelEnabled } = this.state.settings;
        const auditToggleBtn = document.getElementById('audit-mode-toggle-btn');
        const allDataToggleBtn = document.getElementById('all-data-mode-toggle-btn');
        const deleteBtn = document.getElementById('delete-selected-btn');
        const bulkActionBtn = document.getElementById('bulk-action-btn');
        
        if (auditToggleBtn) auditToggleBtn.style.display = (auditPanelEnabled && ['Auditor', 'Master', 'Admin'].includes(role)) ? 'flex' : 'none';
        if (bulkActionBtn) bulkActionBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';

        if (auditToggleBtn) auditToggleBtn.onclick = () => this.handlers.handleAnalysisModeChange('audit', !this.state.isAuditMode);
        if (allDataToggleBtn) allDataToggleBtn.onclick = () => this.handlers.handleAnalysisModeChange('allData', !this.state.isAllDataMode);
        
        if (deleteBtn) deleteBtn.onclick = this.handlers.handleDeleteSelectedAnalysis;
        if (bulkActionBtn) bulkActionBtn.onclick = this.handlers.handleBulkActionClick;

        this.handlers._setupExportDropdown('analysis-export-dropdown-container');

        const getAnalysisExportData = () => {
            const headers = [
                { id: 'tanggal', label: 'Tanggal', isCurrency: false },
                { id: 'nama', label: 'Nama', isCurrency: false },
                { id: 'jumlah', label: 'Jumlah', isCurrency: true },
                { id: 'keterangan', label: 'Keterangan', isCurrency: false },
                { id: 'tipe_sheet', label: 'Tipe', isCurrency: false }
            ];
            const data = this.handlers.getAnalysisData().map(row => ({
                ...row,
                tanggal: new Date(row.tanggal).toLocaleString('id-ID')
            }));
            return { headers, data };
        };

        document.getElementById('export-analysis-csv').onclick = () => {
            const { headers, data } = getAnalysisExportData();
            this.utils.exportToCSV('analisis_data.csv', headers, data);
        };
        document.getElementById('export-analysis-xlsx').onclick = () => {
            const { headers, data } = getAnalysisExportData();
            this.utils.exportToXLSX('analisis_data.xlsx', headers, data);
        };
        document.getElementById('export-analysis-json').onclick = () => {
            const { data } = getAnalysisExportData();
            this.utils.exportToJSON('analisis_data.json', data);
        };

        // PERUBAHAN: Menambahkan event listener tunggal untuk delegasi
        const analysisGridBody = document.getElementById('analysis-grid-body');
        if (analysisGridBody) {
            analysisGridBody.addEventListener('click', (e) => {
                const detailBtn = e.target.closest('.action-btn-detail');
                if (detailBtn) {
                    this.handlers.handleDetailClick(detailBtn.dataset.rowId);
                }
            });
        }

        this.handlers.handleAnalysisModeChange('initial', false); 
    },

    handleAnalysisModeChange(mode, isChecked) {
        if (mode === 'audit') {
            this.state.isAuditMode = isChecked;
            if (isChecked) this.state.isAllDataMode = false;
        } else if (mode === 'allData') {
            this.state.isAllDataMode = isChecked;
            if (isChecked) this.state.isAuditMode = false;
        } else if (mode === 'initial') {
            this.state.isAuditMode = false;
            this.state.isAllDataMode = false;
        }

        if (this.state.isAuditMode) {
            if (this.state.virtualScrollInstances.analysis) {
                this.state.virtualScrollInstances.analysis.destroy();
                this.state.virtualScrollInstances.analysis = null;
            }
        } else {
            if (!this.state.virtualScrollInstances.analysis) {
                this.handlers._createAnalysisVirtualScroll();
            }
        }

        this.state.analysisSelectedIds.clear();

        const auditToggleBtn = document.getElementById('audit-mode-toggle-btn');
        if (auditToggleBtn) {
            auditToggleBtn.classList.toggle('btn-primary', this.state.isAuditMode);
            auditToggleBtn.classList.toggle('btn-secondary', !this.state.isAuditMode);
        }

        const allDataToggleBtn = document.getElementById('all-data-mode-toggle-btn');
        if(allDataToggleBtn) {
            allDataToggleBtn.classList.toggle('btn-primary', this.state.isAllDataMode);
            allDataToggleBtn.classList.toggle('btn-secondary', !this.state.isAllDataMode);
        }
        
        const isAudit = this.state.isAuditMode;
        this.dom.filterSearch.disabled = isAudit;
        this.dom.filterType.disabled = isAudit;
        this.dom.filterSearch.classList.toggle('opacity-50', isAudit);
        this.dom.filterType.classList.toggle('opacity-50', isAudit);

        this.dom.filterPanel.style.pointerEvents = this.state.isAllDataMode ? 'none' : 'auto';
        this.dom.filterPanel.style.opacity = this.state.isAllDataMode ? '0.5' : '1';

        this.handlers.renderAnalysisView();
    },

    renderAnalysisView() {
        const titleEl = document.getElementById('analysis-title');
        const descriptionEl = document.getElementById('analysis-description');
        const statsPanel = document.getElementById('analysis-stats-panel');
        const gridHeader = document.getElementById('analysis-grid-header');
        
        const virtualScrollWrapper = document.getElementById('analysis-virtual-scroll-wrapper');
        const auditWrapper = document.getElementById('analysis-audit-wrapper');
        
        this.state.analysisSelectedIds.clear();

        if (this.state.isAuditMode) {
            titleEl.textContent = 'Audit Reversal Otomatis';
            descriptionEl.textContent = 'Menampilkan pasangan data reversal yang cocok berdasarkan aturan.';
            statsPanel.style.display = 'none';
            virtualScrollWrapper.classList.add('hidden');
            auditWrapper.classList.remove('hidden');
            auditWrapper.classList.add('flex');
            this.handlers.renderAuditTable();
        } else {
            titleEl.textContent = 'Pencarian & Analisis Data Lanjutan';
            descriptionEl.textContent = this.state.isAllDataMode ? 'Menampilkan semua data, filter diabaikan.' : 'Gunakan filter global atau per kolom untuk menyaring data.';
            statsPanel.style.display = 'grid';
            auditWrapper.classList.add('hidden');
            auditWrapper.classList.remove('flex');
            virtualScrollWrapper.classList.remove('hidden');
            virtualScrollWrapper.classList.add('flex');

            if (gridHeader && gridHeader.children.length === 0) {
                 this.handlers.renderAnalysisTableHeader(); 
            }

            const filteredData = this.handlers.getAnalysisData();
            
            if (this.state.virtualScrollInstances.analysis) {
                this.state.virtualScrollInstances.analysis.updateData(filteredData);
            }
            this.handlers.updateAnalysisStats(filteredData);
        }
        this.handlers.updateActionButtonsState();
    },

    renderAuditTable() {
        const auditWrapper = document.getElementById('analysis-audit-wrapper').querySelector('.glass-panel');
        if (!auditWrapper) return;

        const tableHTML = this.handlers.getAutoAuditResultsHTML();
        
        auditWrapper.innerHTML = `
            <div class="overflow-auto h-full">
                ${tableHTML}
            </div>
        `;

        this.handlers.updateActionButtonsState();
    },

    renderAnalysisTableHeader() {
        const gridHeader = document.getElementById('analysis-grid-header');
        if (!gridHeader) return;
        const { column, direction } = this.state.analysisSort;
        
        const totalFiltered = this.state.virtualScrollInstances.analysis?.fullData.length || 0;
        const totalSelected = this.state.analysisSelectedIds.size;
        
        const columns = [
            { id: 'select', label: `<input type="checkbox" id="select-all-checkbox" name="select-all" class="form-input">`, sortable: false },
            { id: 'tanggal', label: 'Tanggal', sortable: true },
            { id: 'nama', label: 'Nama', sortable: true },
            { id: 'jumlah', label: 'Jumlah', class: 'text-right', sortable: true },
            { id: 'keterangan', label: 'Keterangan', sortable: true },
            { id: 'tipe_sheet', label: 'Tipe', sortable: true },
            { id: 'actions', label: 'Detail', class: 'text-center', sortable: false },
        ];

        const headerRow = columns.map(col => {
            const alignClass = col.class || '';
            if (!col.sortable) return `<div class="p-2 ${alignClass}">${col.label}</div>`;
            const icon = col.id === column ? (direction === 'asc' ? '<i data-lucide="arrow-up" class="w-4 h-4 ml-2"></i>' : '<i data-lucide="arrow-down" class="w-4 h-4 ml-2"></i>') : '<i data-lucide="arrow-up-down" class="w-4 h-4 ml-2 text-text-muted"></i>';
            return `<div class="p-2 cursor-pointer hover:bg-color-primary/10 sortable-header ${alignClass}" data-sort-by="${col.id}"><div class="flex items-center ${alignClass.includes('text-right') ? 'justify-end' : ''}">${col.label} ${icon}</div></div>`;
        }).join('');

        const filterRow = columns.map(col => {
            if (!col.sortable) return `<div></div>`;
            const filterValue = this.state.analysisColumnFilters[col.id] || '';
            return `<div class="p-1"><input type="text" id="filter-input-${col.id}" name="filter-${col.id}" data-filter-col="${col.id}" class="form-input form-input-sm w-full" placeholder="Filter..." value="${filterValue}"></div>`;
        }).join('');

        gridHeader.innerHTML = `
            <div class="analysis-grid-layout font-bold text-text-secondary text-xs uppercase">${headerRow}</div>
            <div class="analysis-grid-layout bg-black/10">${filterRow}</div>
        `;
        lucide.createIcons();
        
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        if (selectAllCheckbox) {
            if (totalSelected > 0 && totalSelected < totalFiltered) {
                selectAllCheckbox.indeterminate = true;
                selectAllCheckbox.checked = false;
            } else {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = totalSelected > 0 && totalSelected === totalFiltered;
            }
        }

        document.querySelectorAll('.sortable-header').forEach(th => th.onclick = (e) => this.handlers.handleSort(e.currentTarget.dataset.sortBy));
        document.querySelectorAll('input[data-filter-col]').forEach(input => {
            input.onkeyup = this.handlers.handleColumnFilter;
        });
    },

    createAnalysisTableRow(row) {
        const isChecked = this.state.analysisSelectedIds.has(row.id);

        return `
            <div class="h-[40px] analysis-grid-layout border-b border-border-color/50 hover:bg-color-primary/10">
                <div class="p-2 text-center"><input type="checkbox" id="select-row-${row.id}" name="row-selection" class="form-input analysis-row-checkbox" data-row-id="${row.id}" ${isChecked ? 'checked' : ''}></div>
                <div class="p-2 truncate">${new Date(row.tanggal).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short'})}</div>
                <div class="p-2 truncate">${row.nama}</div>
                <div class="p-2 text-right">${this.utils.formatCurrency(row.jumlah)}</div>
                <div class="p-2 truncate" title="${row.keterangan}">${row.keterangan}</div>
                <div class="p-2 truncate">${row.tipe_sheet}</div>
                <div class="p-2 text-center">
                    <button class="btn btn-secondary p-1 action-btn-detail" data-row-id="${row.id}" title="Lihat/Edit Detail">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
    },

    getAnalysisData() {
        const dataSource = this.state.isAllDataMode ? this.state.allData : this.handlers.getFilteredData();
        let data = [...dataSource];
        const { column, direction } = this.state.analysisSort;
        const filters = this.state.analysisColumnFilters;

        const filterKeys = Object.keys(filters).filter(key => filters[key]);
        if (filterKeys.length > 0) {
            this.state.analysisSelectedIds.clear();
            data = data.filter(row => {
                return filterKeys.every(key => {
                    const rowValue = String(row[key] || '').toLowerCase();
                    const filterValue = filters[key].toLowerCase();
                    return rowValue.includes(filterValue);
                });
            });
        }

        data.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            if (column === 'tanggal') {
                valA = new Date(valA);
                valB = new Date(valB);
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        return data;
    },
    
    updateAnalysisStats(data) {
        const totalCount = this.state.allData.length;
        const displayedCount = data.length;
        const totalValue = data.reduce((sum, row) => sum + (parseFloat(row.jumlah) || 0), 0);
        const avgValue = displayedCount > 0 ? totalValue / displayedCount : 0;
        const manualCount = data.filter(r => String(r.tipe_sheet || '').toUpperCase() === 'MANUAL').length;
        const tiketCount = data.filter(r => String(r.tipe_sheet || '').toUpperCase() === 'TIKET').length;

        document.getElementById('stats-displayed-count').textContent = `${displayedCount.toLocaleString('id-ID')} / ${totalCount.toLocaleString('id-ID')}`;
        document.getElementById('stats-total-value').textContent = this.utils.formatCurrency(totalValue);
        document.getElementById('stats-avg-value').textContent = this.utils.formatCurrency(avgValue);
        document.getElementById('stats-type-composition').textContent = `Manual: ${manualCount} | Tiket: ${tiketCount}`;
    },

    handleSort(sortBy) {
        const {
            analysisSort
        } = this.state;
        if (analysisSort.column === sortBy) {
            analysisSort.direction = analysisSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            analysisSort.column = sortBy;
            analysisSort.direction = 'desc';
        }
        
        this.handlers.renderAnalysisTableHeader();
        
        const sortedData = this.handlers.getAnalysisData();
        if (this.state.virtualScrollInstances.analysis) {
            this.state.virtualScrollInstances.analysis.updateData(sortedData);
        }
    },

    handleColumnFilter: (() => {
        let timeoutId;
        return function(e) {
            clearTimeout(timeoutId);
            const input = e.target;
            const col = input.dataset.filterCol;
            const value = input.value;
    
            this.state.analysisColumnFilters[col] = value;
            
            timeoutId = setTimeout(() => {
                const filteredData = this.handlers.getAnalysisData();
                if (this.state.virtualScrollInstances.analysis) {
                    this.state.virtualScrollInstances.analysis.updateData(filteredData);
                }
                this.handlers.updateAnalysisStats(filteredData);
            }, 300);
        }
    })(),

    handleDetailClick(rowId) {
        const rowData = this.state.allData.find(r => r.id == rowId);
        if (!rowData) {
            this.ui.showModal('Error', 'Data tidak ditemukan.');
            return;
        }

        const canEdit = ['Master', 'Admin'].includes(this.state.currentUser?.role);

        let contentHTML = '<div class="space-y-4 text-sm">';
        const fields = ['id', 'tanggal', 'nama', 'jumlah', 'keterangan', 'tipe_sheet', 'created_at'];

        fields.forEach(field => {
            const value = rowData[field];
            const isEditable = canEdit && ['nama', 'jumlah', 'keterangan', 'tipe_sheet'].includes(field);

            contentHTML += `
                <div class="grid grid-cols-3 gap-4 items-center">
                    <label for="detail-${field}" class="font-bold text-text-secondary col-span-1">${field.replace('_', ' ').toUpperCase()}</label>
                    <div class="col-span-2">
            `;
            if (isEditable) {
                if (field === 'tipe_sheet') {
                    contentHTML += `<select id="detail-${field}" class="form-input w-full">
                        <option value="MANUAL" ${value === 'MANUAL' ? 'selected' : ''}>MANUAL</option>
                        <option value="TIKET" ${value === 'TIKET' ? 'selected' : ''}>TIKET</option>
                    </select>`;
                } else {
                    contentHTML += `<input type="${field === 'jumlah' ? 'number' : 'text'}" id="detail-${field}" class="form-input w-full" value="${value}">`;
                }
            } else {
                contentHTML += `<p class="p-2 bg-black/20 rounded">${value}</p>`;
            }
            contentHTML += `</div></div>`;
        });
        contentHTML += '</div>';

        const footerHTML = canEdit ?
            `<div class="grid grid-cols-2 gap-2 mt-6">
                   <button id="generic-modal-close-btn" class="btn btn-secondary w-full">Batal</button>
                   <button id="save-detail-btn" class="btn btn-primary w-full">Simpan Perubahan</button>
               </div>` :
            `<button id="generic-modal-close-btn" class="btn btn-primary w-full mt-6">Tutup</button>`;

        this.ui.showModal(`Detail Data #${rowData.id}`, '', contentHTML, {
            size: 'large',
            footerHTML
        });

        if (canEdit) {
            document.getElementById('save-detail-btn').onclick = () => this.handlers.handleSaveDetail(rowData.id);
        }
    },

    async handleSaveDetail(rowId) {
        const updateObject = {
            nama: document.getElementById('detail-nama').value,
            jumlah: parseFloat(document.getElementById('detail-jumlah').value),
            keterangan: document.getElementById('detail-keterangan').value,
            tipe_sheet: document.getElementById('detail-tipe_sheet').value,
        };

        this.ui.showLoader('Menyimpan perubahan...');
        try {
            await this.api.updateData(rowId, updateObject);
            await this.api.logAction('UPDATE_DATA_MODAL', {
                id: rowId,
                changes: updateObject
            });
            this.ui.hideModal();
            this.ui.showModal('Sukses', 'Data berhasil diperbarui.');
            this.handlers.handleFullRefresh();
        } catch (e) {
            this.ui.showModal('Error', `Gagal menyimpan: ${e.message}`);
        } finally {
            this.ui.hideLoader();
        }
    },

    getAutoAuditResultsHTML() {
        const getDescSuffix = (description, keyword) => {
            const descUpper = String(description || '').toUpperCase();
            const keywordUpper = String(keyword || '').toUpperCase();
            const index = descUpper.indexOf(keywordUpper);
            if (index === 0) {
                return description.substring(keyword.length).trim();
            }
            return null;
        };

        const filteredData = this.handlers.getAuditFilteredData();
        const matchedPairs = [];
        const usedIds = new Set();

        this.state.settings.auditRules.forEach(rule => {
            const k1_reversal = rule.keyword1;
            const k2_original = rule.keyword2;

            const potentialReversals = filteredData.filter(r => 
                !usedIds.has(r.id) && 
                String(r.keterangan || '').toUpperCase().startsWith(k1_reversal.toUpperCase())
            );
            const potentialOriginals = filteredData.filter(r => 
                !usedIds.has(r.id) && 
                String(r.keterangan || '').toUpperCase().startsWith(k2_original.toUpperCase())
            );

            potentialReversals.forEach(rev => {
                const revAmount = Math.abs(parseFloat(rev.jumlah));
                const revSuffix = getDescSuffix(rev.keterangan, k1_reversal);

                const foundOriginal = potentialOriginals.find(orig => {
                    if (usedIds.has(orig.id)) return false;

                    const origAmount = Math.abs(parseFloat(orig.jumlah));
                    const origSuffix = getDescSuffix(orig.keterangan, k2_original);
                    
                    const suffixMatch = (revSuffix !== null && origSuffix !== null) && 
                                      (revSuffix.startsWith(origSuffix) || origSuffix.startsWith(revSuffix));

                    return orig.nama === rev.nama && 
                           origAmount === revAmount && 
                           suffixMatch;
                });

                if (foundOriginal) {
                    matchedPairs.push({
                        reversal: rev,
                        original: foundOriginal
                    });
                    usedIds.add(rev.id);
                    usedIds.add(foundOriginal.id);
                }
            });
        });

        if (matchedPairs.length === 0) {
            return '<div class="p-4 text-center">Tidak ada pasangan data reversal ditemukan sesuai filter.</div>';
        }

        this.state.currentAuditPairs = matchedPairs;
        matchedPairs.sort((a, b) => new Date(b.reversal.tanggal) - new Date(a.reversal.tanggal));
        
        const allPairIdsOnScreen = new Set(matchedPairs.flatMap(p => [p.reversal.id, p.original.id]));
        const allVisibleSelected = allPairIdsOnScreen.size > 0 && [...allPairIdsOnScreen].every(id => this.state.analysisSelectedIds.has(id));

        const header = `
            <div class="grid grid-cols-[auto_1fr_1fr_2fr_1fr] gap-x-4 items-center border-b border-border-color p-2 font-bold text-text-secondary text-xs uppercase sticky top-0 bg-bg-panel backdrop-blur-sm">
                <div><input type="checkbox" id="select-all-audit-checkbox" name="select-all-audit" class="form-input" ${allVisibleSelected ? 'checked' : ''}></div>
                <div>Tanggal</div>
                <div>Nama</div>
                <div>Keterangan</div>
                <div class="text-right">Jumlah</div>
            </div>
        `;

        const rows = matchedPairs.map(p => {
            const pairId = `${p.reversal.id},${p.original.id}`;
            const isChecked = this.state.analysisSelectedIds.has(p.reversal.id) && this.state.analysisSelectedIds.has(p.original.id);
            
            return `
                <div class="border-b-2 border-gray-500/50">
                    <div class="grid grid-cols-[auto_1fr_1fr_2fr_1fr] gap-x-4 items-center p-2 bg-red-900/20"> 
                        <div><input type="checkbox" class="form-input audit-pair-checkbox" data-pair-id="${pairId}" ${isChecked ? 'checked' : ''}></div>
                        <div>${new Date(p.reversal.tanggal).toLocaleString('id-ID')}</div> 
                        <div>${p.reversal.nama}</div> 
                        <div>${p.reversal.keterangan}</div> 
                        <div class="text-right text-color-danger">${this.utils.formatCurrency(p.reversal.jumlah)}</div> 
                    </div> 
                    <div class="grid grid-cols-[auto_1fr_1fr_2fr_1fr] gap-x-4 items-center p-2 bg-green-900/20"> 
                        <div></div>
                        <div>${new Date(p.original.tanggal).toLocaleString('id-ID')}</div> 
                        <div>${p.original.nama}</div> 
                        <div>${p.original.keterangan}</div> 
                        <div class="text-right text-color-success">${this.utils.formatCurrency(p.original.jumlah)}</div> 
                    </div>
                </div>
            `;
        }).join('');

        return header + rows;
    },


    updateActionButtonsState() {
        const deleteBtn = document.getElementById('delete-selected-btn');
        const bulkActionBtn = document.getElementById('bulk-action-btn');
        if (!deleteBtn || !bulkActionBtn) return;

        const itemsSelected = this.state.analysisSelectedIds.size;
        const canPerformActions = ['Master', 'Admin'].includes(this.state.currentUser?.role);

        if (canPerformActions && itemsSelected > 0) {
            deleteBtn.style.display = 'flex';
            bulkActionBtn.style.display = this.state.isAuditMode ? 'none' : 'flex';
        } else {
            deleteBtn.style.display = 'none';
            bulkActionBtn.style.display = 'none';
        }

        if (itemsSelected > 0) {
            const itemType = this.state.isAuditMode ? 'Pasangan' : 'Item';
            const count = this.state.isAuditMode ? itemsSelected / 2 : itemsSelected;
            bulkActionBtn.querySelector('#bulk-action-btn-text').textContent = `Ubah ${count} ${itemType}`;
            deleteBtn.querySelector('#delete-btn-text').textContent = `Hapus ${count} ${itemType}`;
        } else {
            bulkActionBtn.querySelector('#bulk-action-btn-text').textContent = 'Ubah Data';
            deleteBtn.querySelector('#delete-btn-text').textContent = 'Hapus Data';
        }
    },

    async handleDeleteSelectedAnalysis() {
        const rowIdsToDelete = Array.from(this.state.analysisSelectedIds);

        if (rowIdsToDelete.length === 0) {
            this.ui.showModal('Info', 'Tidak ada data yang dipilih untuk dihapus.');
            return;
        }

        const itemType = this.state.isAuditMode ? `${rowIdsToDelete.length / 2} pasangan data` : `${rowIdsToDelete.length} item data`;

        this.handlers.showConfirmationModal({
            title: 'Konfirmasi Penghapusan',
            message: `Anda yakin ingin menghapus ${itemType} yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
            confirmPhrase: 'HAPUS',
            onConfirm: async () => {
                this.ui.showLoader('Menghapus data...');
                try {
                    const count = await this.api.deleteDataBatch(rowIdsToDelete);
                    await this.api.logAction('DELETE_DATA_ANALYSIS', {
                        deleted_ids: rowIdsToDelete,
                        count_reported_by_db: count
                    });
                    
                    this.state.analysisSelectedIds.clear();
                    await this.handlers.handleFullRefresh();
                    this.ui.showModal('Sukses', `Berhasil menghapus ${count || 0} baris data.`);

                } catch (e) {
                    console.error("Gagal menghapus data:", e);
                    this.ui.showModal('Error Penghapusan', `Gagal menghapus data dari database. Error: ${e.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            },
        });
    },

    handleBulkActionClick() {
        const selectedCount = this.state.analysisSelectedIds.size;
        if (selectedCount === 0) return;

        const contentHTML = `
            <div class="space-y-4">
                <div>
                    <label for="bulk-action-select" class="font-bold text-sm text-text-secondary">Pilih Aksi</label>
                    <select id="bulk-action-select" class="form-select w-full mt-1">
                        <option value="">-- Pilih Aksi --</option>
                        <option value="change_name">Ubah Nama</option>
                    </select>
                </div>
                <div id="bulk-action-input-container" class="hidden">
                </div>
            </div>
        `;

        const footerHTML = `
            <div class="grid grid-cols-2 gap-2 mt-6">
                <button id="generic-modal-close-btn" class="btn btn-secondary w-full">Batal</button>
                <button id="apply-bulk-action-btn" class="btn btn-primary w-full" disabled>Terapkan</button>
            </div>
        `;

        this.ui.showModal(`Aksi Massal untuk ${selectedCount} Item`, '', contentHTML, {
            footerHTML
        });

        const actionSelect = document.getElementById('bulk-action-select');
        const inputContainer = document.getElementById('bulk-action-input-container');
        const applyBtn = document.getElementById('apply-bulk-action-btn');

        actionSelect.onchange = () => {
            const action = actionSelect.value;
            inputContainer.innerHTML = '';
            inputContainer.classList.add('hidden');
            applyBtn.disabled = true;

            if (action === 'change_name') {
                inputContainer.innerHTML = `
                    <label for="bulk-action-new-name" class="font-bold text-sm text-text-secondary">Nama Baru</label>
                    <input type="text" id="bulk-action-new-name" class="form-input w-full mt-1" placeholder="Masukkan nama baru...">
                `;
                inputContainer.classList.remove('hidden');
                applyBtn.disabled = false;
            }
        };

        applyBtn.onclick = () => this.handlers.handleApplyBulkAction();
    },

    async handleApplyBulkAction() {
        const selectedIds = Array.from(this.state.analysisSelectedIds);
        const action = document.getElementById('bulk-action-select').value;

        if (selectedIds.length === 0 || !action) return;

        let updates = [];
        let updateObject = {};
        let logDetails = {};

        if (action === 'change_name') {
            const newName = document.getElementById('bulk-action-new-name').value.trim();
            if (!newName) {
                this.ui.showModal('Error', 'Nama baru tidak boleh kosong.');
                return;
            }
            updateObject = {
                nama: newName
            };
            updates = selectedIds.map(id => ({
                id,
                updateObject
            }));
            logDetails = {
                action: 'change_name',
                newName,
                count: selectedIds.length
            };
        }

        if (updates.length === 0) return;

        this.ui.showLoader(`Menerapkan aksi massal...`);
        try {
            const count = await this.api.updateDataBatch(updates);
            await this.api.logAction('BULK_ACTION_SUCCESS', logDetails);
            
            this.state.analysisSelectedIds.clear();

            this.ui.hideModal();
            this.ui.showModal('Sukses', `${count} data berhasil diperbarui.`);
            this.handlers.handleFullRefresh();
        } catch (e) {
            this.ui.showModal('Error', `Gagal menerapkan aksi massal: ${e.message}`);
        } finally {
            this.ui.hideLoader();
        }
    },

    setupInputView() {
        document.getElementById('process-data-btn').onclick = () => this.handlers.processAndStageData();
        document.getElementById('single-entry-form').onsubmit = this.handlers.handleSingleEntrySubmit;
        document.getElementById('download-template-btn').onclick = this.handlers.downloadInputTemplate;
        document.getElementById('cancel-staging-btn').onclick = this.handlers.resetInputView;
        document.getElementById('upload-csv-btn').onclick = () => document.getElementById('csv-file-input').click();
        document.getElementById('csv-file-input').onchange = this.handlers.handleCsvFileUpload;
        
        document.getElementById('submit-valid-data-btn').onclick = this.handlers.submitStagedData;
        const deleteAllErrorsBtn = document.getElementById('delete-all-errors-btn');
        if (deleteAllErrorsBtn) {
            deleteAllErrorsBtn.onclick = this.handlers.handleDeleteAllErrors;
        }
        
        const stagingTableBody = document.getElementById('staging-table-body');
        stagingTableBody.addEventListener('click', (e) => {
            if (e.target.closest('.revalidate-btn')) {
                const index = e.target.closest('.revalidate-btn').dataset.index;
                this.handlers.revalidateStagingRow(index);
            } else if (e.target.closest('.delete-staging-row-btn')) {
                const index = e.target.closest('.delete-staging-row-btn').dataset.index;
                this.handlers.deleteStagingRow(index);
            }
        });
        
        const filterControls = document.getElementById('staging-filter-controls');
        filterControls.addEventListener('click', (e) => {
            if (e.target.classList.contains('staging-filter-btn')) {
                const status = e.target.dataset.statusFilter;
                this.state.activeStagingFilter = status;
                filterControls.querySelectorAll('.staging-filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.handlers.filterAndRenderStagingTable();
            }
        });

        const { pasteDelimiter, csvDelimiter } = this.state.settings.dataParsingSettings;
        const pasteDelimiterName = pasteDelimiter === '\\t' ? 'Tab' : `"${pasteDelimiter}"`;
        const csvDelimiterName = csvDelimiter === '\\t' ? 'Tab' : `"${csvDelimiter}"`;

        document.getElementById('paste-instructions').textContent = `1. Format Data: Paste dari spreadsheet (Pemisah: ${pasteDelimiterName}).\n2. Urutan Kolom: Tanggal, Nama, Jumlah, Keterangan`;
        document.getElementById('csv-instructions').textContent = `Pilih file .csv yang menggunakan ${csvDelimiterName} sebagai pemisah. Format kolom harus sama dengan template.`;
        
        const undoBtn = document.getElementById('undo-last-import-btn');
        undoBtn.onclick = this.handlers.handleUndoLastImport;
        if (this.state.lastImportBatchId) {
            undoBtn.classList.remove('hidden');
        } else {
            undoBtn.classList.add('hidden');
        }
        
        this.handlers.resetInputView();
    },

    handleDeleteAllErrors() {
        const errorCount = this.state.stagingData.filter(item => item.status === 'error').length;
        if (errorCount === 0) return;

        this.handlers.showConfirmationModal({
            title: "Hapus Semua Data Error",
            message: `Anda yakin ingin menghapus ${errorCount} baris data yang terdeteksi sebagai error?`,
            confirmPhrase: "HAPUS ERROR",
            onConfirm: () => {
                this.state.stagingData = this.state.stagingData.filter(item => item.status !== 'error');
                this.handlers.filterAndRenderStagingTable();
                this.ui.updateStagingStatsAndSubmitBtn();
            }
        });
    },

    resetInputView() {
        const stagingArea = document.getElementById('staging-area');
        const contentWrapper = document.getElementById('input-content-wrapper');

        stagingArea.classList.add('hidden');
        
        contentWrapper.classList.remove('lg:grid-cols-3');
        contentWrapper.classList.add('lg:grid-cols-1');

        document.getElementById('data-input-area').value = '';
        const csvInput = document.getElementById('csv-file-input');
        if(csvInput) csvInput.value = '';
        document.getElementById('csv-file-name').textContent = '';

        this.state.stagingData = [];
        this.state.activeStagingFilter = 'all';
        if (this.state.virtualScrollInstances.staging) {
            this.state.virtualScrollInstances.staging.updateData([]);
        }
        this.ui.updateStagingStatsAndSubmitBtn();
    },
    
    handleCsvFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        document.getElementById('csv-file-name').textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            const rawData = e.target.result;
            const { csvDelimiter } = this.state.settings.dataParsingSettings;
            this.handlers.processAndStageData(rawData, csvDelimiter);
        };
        reader.readAsText(file);
    },

    async processAndStageData(rawData = null, delimiter = null) {
        if (this.state.virtualScrollInstances.staging) {
            this.state.virtualScrollInstances.staging.destroy();
            delete this.state.virtualScrollInstances.staging;
        }

        const vsInstance = VirtualScrollManager.create({
            containerEl: document.getElementById('staging-table-body-wrapper'),
            scrollerEl: document.getElementById('staging-scroller'),
            contentEl: document.getElementById('staging-table-body'),
            fullData: [],
            renderRowFunction: this.ui.createStagingTableRow.bind(this.ui),
            rowHeight: 60,
        });
        this.state.virtualScrollInstances.staging = vsInstance;
        vsInstance.initialize();
        
        const dataToProcess = rawData !== null ? rawData : document.getElementById('data-input-area').value;
        
        if (!dataToProcess.trim()) {
            this.ui.showModal('Info', 'Area input data kosong.');
            return;
        }
        
        this.ui.showLoader('Menganalisis dan memvalidasi data...');
        
        const finalDelimiter = delimiter !== null ? delimiter : this.state.settings.dataParsingSettings.pasteDelimiter;
        const parsedItems = this.handlers.parseRawDataInput(dataToProcess, finalDelimiter);
        const { finalStagedData } = await this.handlers.checkForDuplicates(parsedItems);
        
        this.state.stagingData = finalStagedData;
        this.state.activeStagingFilter = 'all';
        document.querySelectorAll('.staging-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.statusFilter === 'all'));

        this.handlers.filterAndRenderStagingTable();
        this.ui.updateStagingStatsAndSubmitBtn();
        
        const stagingArea = document.getElementById('staging-area');
        const contentWrapper = document.getElementById('input-content-wrapper');

        contentWrapper.classList.remove('lg:grid-cols-1');
        contentWrapper.classList.add('lg:grid-cols-3');
        
        stagingArea.classList.remove('hidden');
        
        this.ui.hideLoader();
    },

    filterAndRenderStagingTable() {
        const status = this.state.activeStagingFilter;
        let filteredData = this.state.stagingData;

        if (status !== 'all') {
            if (status === 'duplicate') {
                filteredData = this.state.stagingData.filter(item => item.status.startsWith('duplicate'));
            } else {
                filteredData = this.state.stagingData.filter(item => item.status === status);
            }
        }
        
        if (this.state.virtualScrollInstances.staging) {
            this.state.virtualScrollInstances.staging.updateData(filteredData);
        }
    },

    deleteStagingRow(originalIndex) {
        this.state.stagingData = this.state.stagingData.filter(item => item.originalIndex != originalIndex);
        this.handlers.filterAndRenderStagingTable();
        this.ui.updateStagingStatsAndSubmitBtn();
    },

    parseRawDataInput(rawData, delimiter) {
        const lines = rawData.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 0 && /tanggal/i.test(lines[0]) && /keterangan/i.test(lines[0])) {
            lines.shift();
        }

        const {
            exceptionKeywords,
            nameConsolidation,
            routingKeywords,
            dataParsingSettings
        } = this.state.settings;
        const {
            columnOrder,
            dateFormats
        } = dataParsingSettings;

        const processedItems = [];
        const processedHashes = new Set();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const originalIndex = i;
            let item = {
                originalIndex,
                originalLine: line,
                status: 'error',
                errorReason: '',
                data: {}
            };

            try {
                const finalDelimiter = delimiter === '\\t' ? '\t' : delimiter;
                const parts = line.split(finalDelimiter);
                if (parts.length < columnOrder.length) {
                    item.errorReason = 'Jumlah kolom tidak sesuai format';
                    processedItems.push(item);
                    continue;
                }

                const rowObject = {};
                columnOrder.forEach((colName, index) => {
                    rowObject[colName] = parts[index] ? parts[index].trim() : '';
                });

                item.data = { ...rowObject
                };

                const lowerKeterangan = (rowObject.keterangan || '').toLowerCase();
                if (exceptionKeywords.some(kw => lowerKeterangan.includes(kw.toLowerCase()))) {
                    continue;
                }

                const cleanJumlahStr = (rowObject.jumlah || '').replace(/\./g, '').replace(',', '.');
                const jumlah = parseFloat(cleanJumlahStr);
                if (isNaN(jumlah)) {
                    item.errorReason = 'Format jumlah salah';
                    processedItems.push(item);
                    continue;
                }

                const tanggal = this.utils.parseDateWithPriority(rowObject.tanggal, dateFormats);
                if (!tanggal) {
                    item.errorReason = 'Format tanggal tidak dikenali';
                    processedItems.push(item);
                    continue;
                }

                let nama = rowObject.nama;
                const normalizedName = this.utils.normalizeName(nama);
                nama = nameConsolidation[normalizedName.toUpperCase()] || normalizedName;

                let routeTo = null;
                if (routingKeywords.tiket.some(kw => lowerKeterangan.includes(kw.toLowerCase()))) routeTo = 'TIKET';
                else if (routingKeywords.manual.some(kw => lowerKeterangan.includes(kw.toLowerCase()))) routeTo = 'MANUAL';

                if (!routeTo) {
                    item.errorReason = 'Tidak ada routing cocok';
                    processedItems.push(item);
                    continue;
                }

                const rowHash = `${tanggal.toISOString().split('T')[0]}|${nama}|${jumlah}|${rowObject.keterangan}`;
                if (processedHashes.has(rowHash)) {
                    item.status = 'duplicate_input';
                    item.errorReason = 'Duplikat di input';
                    processedItems.push(item);
                    continue;
                }
                processedHashes.add(rowHash);

                item.status = 'valid';
                item.errorReason = '';
                item.data = {
                    tanggal: tanggal.toISOString(),
                    nama,
                    jumlah,
                    keterangan: rowObject.keterangan,
                    tipe_sheet: routeTo,
                    hash: rowHash
                };
                processedItems.push(item);

            } catch (e) {
                item.errorReason = `Error internal: ${e.message}`;
                processedItems.push(item);
            }
        }
        return processedItems;
    },

    async checkForDuplicates(parsedItems) {
        const itemsToCheck = parsedItems.filter(item => item.status === 'valid').map(item => ({
            hash: item.data.hash,
            tanggal: item.data.tanggal,
            nama: item.data.nama,
            jumlah: item.data.jumlah,
            keterangan: item.data.keterangan
        }));

        let duplicateHashes = [];
        if (itemsToCheck.length > 0) {
            try {
                const res = await this.api.req('/transactions/check-duplicates', {
                    method: 'POST',
                    body: JSON.stringify({ items: itemsToCheck })
                });
                duplicateHashes = res.duplicates || [];
            } catch (e) {
                console.error("Gagal mengecek duplikat di DB:", e);
            }
        }

        const finalStagedData = parsedItems.map(item => {
            if (item.status === 'valid') {
                if (duplicateHashes.includes(item.data.hash)) {
                    item.status = 'duplicate_db';
                    item.errorReason = 'Duplikat di Database';
                }
            }
            return item;
        });

        return {
            finalStagedData
        };
    },

    async submitStagedData() {
        const validDataToSubmit = this.state.stagingData
            .filter(item => item.status === 'valid')
            .map(item => {
                const {
                    hash,
                    ...dbObject
                } = item.data;
                return dbObject;
            });

        if (validDataToSubmit.length === 0) {
            this.ui.showModal('Info', 'Tidak ada data valid untuk dikirim.');
            return;
        }

        this.ui.showLoader(`Mengirim ${validDataToSubmit.length} data baru...`);
        const batchId = crypto.randomUUID();
        validDataToSubmit.forEach(d => d.batch_id = batchId);

        try {
            await this.api.addDataBatch(validDataToSubmit);
            this.state.lastImportBatchId = batchId;
            localStorage.setItem('fkof_lastImportBatchId', batchId);

            await this.api.logAction('SUBMIT_DATA_SUCCESS', {
                submitted: validDataToSubmit.length,
                batch_id: batchId
            });

            this.ui.hideLoader();
            this.ui.showModal('Sukses', `${validDataToSubmit.length} baris data baru telah ditambahkan.`, '', {
                onClose: () => {
                    this.handlers.resetInputView();
                    this.handlers.handleFullRefresh();
                }
            });
        } catch (e) {
            this.ui.hideLoader();
            this.ui.showModal('Error Pengiriman', `Gagal mengirim data: ${e.message}`);
            this.api.logAction('SUBMIT_DATA_FAIL', {
                error: e.message
            });
        }
    },

    async handleSingleEntrySubmit(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            tanggal: form.querySelector('#single-entry-date').value,
            nama: form.querySelector('#single-entry-name').value.trim(),
            jumlah: parseFloat(form.querySelector('#single-entry-amount').value),
            keterangan: form.querySelector('#single-entry-desc').value.trim(),
        };

        if (!data.tanggal || !data.nama || isNaN(data.jumlah) || !data.keterangan) {
            this.ui.showModal('Error', 'Semua field harus diisi dengan benar.');
            return;
        }

        const lowerKeterangan = data.keterangan.toLowerCase();
        const {
            routingKeywords
        } = this.state.settings;
        let routeTo = null;
        if (routingKeywords.tiket.some(kw => lowerKeterangan.includes(kw))) routeTo = 'TIKET';
        else if (routingKeywords.manual.some(kw => lowerKeterangan.includes(kw))) routeTo = 'MANUAL';

        if (!routeTo) {
            this.ui.showModal('Error', 'Keterangan tidak cocok dengan aturan routing (MANUAL/TIKET).');
            return;
        }
        data.tipe_sheet = routeTo;
        data.batch_id = `single-${crypto.randomUUID()}`;

        this.ui.showLoader('Menyimpan transaksi tunggal...');
        try {
            await this.api.addDataBatch([data]);
            await this.api.logAction('SUBMIT_SINGLE_SUCCESS', {
                data
            });
            this.ui.hideLoader();
            this.ui.showModal('Sukses', 'Transaksi tunggal berhasil ditambahkan.');
            form.reset();
            this.handlers.handleFullRefresh();
        } catch (error) {
            this.ui.showModal('Error', `Gagal menyimpan: ${error.message}`);
        }
    },

    downloadInputTemplate() {
        const delimiter = this.state.settings.dataParsingSettings.csvDelimiter === '\\t' ? '\t' : this.state.settings.dataParsingSettings.csvDelimiter;
        const header = ["Tanggal", "Nama", "Jumlah", "Keterangan"].join(delimiter);

        const today = new Date();
        const exampleDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const exampleRow = [exampleDate, "PLC CONTOH", 500000, "QR TARTUN"].join(delimiter);

        const csvContent = `${header}\n${exampleRow}`;

        const blob = new Blob([csvContent], {
            type: 'text/csv;charset=utf-8;'
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);

        link.setAttribute("download", "template_input_fkof.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.api.logAction('DOWNLOAD_TEMPLATE');
    },

    async handleUndoLastImport() {
        const batchId = this.state.lastImportBatchId;
        if (!batchId) {
            this.ui.showModal('Info', 'Tidak ada riwayat impor terakhir yang bisa dibatalkan.');
            return;
        }

        this.handlers.showConfirmationModal({
            title: 'Konfirmasi Pembatalan Impor',
            message: `Anda yakin ingin membatalkan impor terakhir (Batch ID: ...${batchId.slice(-12)})? Semua data dari impor ini akan dihapus permanen.`,
            confirmPhrase: 'BATALKAN',
            onConfirm: async () => {
                this.ui.showLoader('Membatalkan impor terakhir...');
                try {
                    const count = await this.api.deleteDataByBatchId(batchId);
                    localStorage.removeItem('fkof_lastImportBatchId');
                    this.state.lastImportBatchId = null;
                    document.getElementById('undo-last-import-btn').classList.add('hidden');

                    await this.api.logAction('UNDO_IMPORT_SUCCESS', {
                        batch_id: batchId,
                        count
                    });
                    this.ui.showModal('Sukses', `${count} data dari impor terakhir berhasil dihapus. Memuat ulang aplikasi...`, '', {
                        onClose: () => this.handlers.handleFullRefresh()
                    });
                } catch (e) {
                    this.ui.showModal('Error', `Gagal membatalkan impor: ${e.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    revalidateStagingRow(index) {
        const rowElement = document.querySelector(`#staging-table-body tr[data-index="${index}"]`);
        if (!rowElement) return;

        const inputs = rowElement.querySelectorAll('input');
        const delimiter = this.state.settings.dataParsingSettings.pasteDelimiter === '\\t' ? '\t' : this.state.settings.dataParsingSettings.pasteDelimiter;
        const line = Array.from(inputs).map(input => input.value).join(delimiter);

        const [revalidatedItem] = this.handlers.parseRawDataInput(line, delimiter);

        if (revalidatedItem.status === 'valid') {
            const existingHashes = new Set(this.state.allData.map(row => row.data.hash));
            if (existingHashes.has(revalidatedItem.data.hash)) {
                revalidatedItem.status = 'duplicate_db';
                revalidatedItem.errorReason = 'Duplikat di Database';
            }
        }

        this.state.stagingData[index] = revalidatedItem;
        const newRowHTML = this.ui.createStagingTableRow(revalidatedItem);
        rowElement.outerHTML = newRowHTML;
        lucide.createIcons();

        this.ui.updateStagingStatsAndSubmitBtn();
    },

    _getUserAvatar(user) {
        if (user.avatar_url) {
            return `<img src="${user.avatar_url}" alt="Avatar" class="user-avatar object-cover">`;
        }
        const email = user.email || '';
        const initial = email[0] ? email[0].toUpperCase() : '?';
        const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];
        const colorIndex = (initial.charCodeAt(0) - 65) % colors.length;
        const bgColor = colors[colorIndex];
        return `<div class="user-avatar" style="background-color: ${bgColor};">${initial}</div>`;
    },

    async setupUserManagementView() {
        const role = this.state.currentUser?.role;
        const isAdminOrMaster = ['Master', 'Admin'].includes(role);
    
        const addUserBtn = document.getElementById('add-user-btn');
        const myProfileBtn = document.getElementById('my-profile-btn');
    
        if (addUserBtn) addUserBtn.style.display = isAdminOrMaster ? 'flex' : 'none';
        if (myProfileBtn) myProfileBtn.style.display = 'flex';
    
        document.getElementById('logout-btn').onclick = this.auth.logout;
        if (addUserBtn) addUserBtn.onclick = () => this.handlers.showUserActionModal('create');
        if (myProfileBtn) myProfileBtn.onclick = async () => {
            const profile = await this.api.getProfile(this.state.currentUser.id);
            this.handlers.showUserActionModal('profile', profile);
        };
    
        if (isAdminOrMaster) {
            this.ui.showLoader('Memuat data pengguna...');
            try {
                const allUsers = await this.api.getAllProfiles();
                
                const totalUsers = allUsers.length;
                const activeUsers = allUsers.filter(u => u.is_active).length;
                const inactiveUsers = totalUsers - activeUsers;
                const roleCounts = allUsers.reduce((acc, user) => {
                    acc[user.role] = (acc[user.role] || 0) + 1;
                    return acc;
                }, {});

                document.getElementById('stats-total-users').textContent = totalUsers;
                document.getElementById('stats-active-users').textContent = activeUsers;
                document.getElementById('stats-inactive-users').textContent = inactiveUsers;
                
                this.ui.renderUserRoleChart(roleCounts);

                if (!this.state.virtualScrollInstances.userManagement) {
                    const vsInstance = VirtualScrollManager.create({
                        containerEl: document.getElementById('user-management-scroll-container'),
                        scrollerEl: document.getElementById('user-management-scroller'),
                        contentEl: document.getElementById('user-management-table-body'),
                        fullData: [],
                        renderRowFunction: this.handlers.createUserTableRow.bind(this),
                        rowHeight: 57,
                        // PERUBAHAN: Menghapus onRenderCallback untuk menerapkan event delegation
                        onRenderCallback: () => {
                            lucide.createIcons();
                        }
                    });
                    this.state.virtualScrollInstances.userManagement = vsInstance;
                    vsInstance.initialize();
                }

                // PERUBAHAN: Menambahkan event listener tunggal untuk delegasi
                const userManagementTableBody = document.getElementById('user-management-table-body');
                if (userManagementTableBody && !userManagementTableBody.dataset.listenerAttached) {
                    userManagementTableBody.addEventListener('click', (e) => {
                        const target = e.target;
                        const editBtn = target.closest('.edit-user-btn');
                        if (editBtn) {
                            this.handlers.showUserActionModal('edit', editBtn.dataset);
                            return;
                        }

                        const toggleBtn = target.closest('.toggle-status-btn');
                        if (toggleBtn) {
                            this.handlers.handleToggleUserStatus({ currentTarget: toggleBtn });
                            return;
                        }
                        
                        const viewLogBtn = target.closest('.view-log-btn');
                        if (viewLogBtn) {
                            this.handlers.handleViewUserLogs({ currentTarget: viewLogBtn });
                            return;
                        }

                        const deleteBtn = target.closest('.delete-user-btn');
                        if (deleteBtn) {
                            this.handlers.handleDeleteUser({ currentTarget: deleteBtn });
                            return;
                        }
                    });
                    userManagementTableBody.dataset.listenerAttached = 'true';
                }
                
                this.handlers.renderUserTableHeader();
                this.state.virtualScrollInstances.userManagement.updateData(allUsers);
    
                document.getElementById('user-search-input').addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    const filteredUsers = allUsers.filter(user =>
                        user.email.toLowerCase().includes(searchTerm) ||
                        user.role.toLowerCase().includes(searchTerm)
                    );
                    this.state.virtualScrollInstances.userManagement.updateData(filteredUsers);
                });
    
            } catch (e) {
                this.ui.showModal('Error', `Gagal memuat pengguna: ${e.message}`);
            } finally {
                this.ui.hideLoader();
            }
        } else {
            const userManagementContent = document.querySelector('#user-management-template > div');
            if (userManagementContent) {
                const panelsToHide = userManagementContent.querySelectorAll('#user-stats-panel, .glass-panel');
                panelsToHide.forEach(panel => panel.style.display = 'none');
            }
        }
    },
    
    renderUserTableHeader() {
        const headerContainer = document.getElementById('user-management-table-header');
        if (!headerContainer) return;
    
        headerContainer.innerHTML = `
            <div class="user-management-grid-layout border-b border-border-color font-bold text-text-secondary text-xs uppercase">
                <div class="p-2">Avatar</div>
                <div class="p-2">Email (Username)</div>
                <div class="p-2">Role</div>
                <div class="p-2">Bergabung</div>
                <div class="p-2">Terakhir Aktif</div>
                <div class="p-2 text-center">Status</div>
                <div class="p-2 text-center">Aksi</div>
            </div>
        `;
    },

    createUserTableRow(user) {
        const rowClasses = `h-[57px] user-management-grid-layout border-b border-border-color/50 hover:bg-color-primary/10 transition-opacity ${!user.is_active ? 'opacity-50 bg-red-900/20' : ''}`;
    
        const statusBadge = user.is_active 
            ? `<span class="inline-flex items-center px-2 py-1 text-xs font-bold leading-none text-green-100 bg-green-600 rounded-full">Aktif</span>` 
            : `<span class="inline-flex items-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">Non-Aktif</span>`;
    
        const toggleStatusButton = user.is_active 
            ? `<button class="toggle-status-btn btn btn-warning btn-sm p-1" data-id="${user.id}" data-active="true" title="Nonaktifkan Pengguna"><i data-lucide="user-x" class="w-4 h-4 pointer-events-none"></i></button>` 
            : `<button class="toggle-status-btn btn btn-success btn-sm p-1" data-id="${user.id}" data-active="false" title="Aktifkan Pengguna"><i data-lucide="user-check" class="w-4 h-4 pointer-events-none"></i></button>`;
        
        const createdAt = user.created_at ? new Date(user.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        const lastActive = user.last_active_at ? new Date(user.last_active_at).toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Belum Pernah';
    
        return `
            <div class="${rowClasses}">
                <div class="p-2">${this.handlers._getUserAvatar(user)}</div>
                <div class="p-2 font-mono truncate">${user.email}</div>
                <div class="p-2 truncate">${user.role}</div>
                <div class="p-2 text-sm text-text-secondary truncate">${createdAt}</div>
                <div class="p-2 text-sm text-text-secondary truncate">${lastActive}</div>
                <div class="p-2 text-center">${statusBadge}</div>
                <div class="p-2 text-center space-x-1">
                    <button class="edit-user-btn btn btn-secondary btn-sm p-1" data-id="${user.id}" data-email="${user.email}" data-role="${user.role}" title="Edit Role"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>
                    ${toggleStatusButton}
                    <button class="view-log-btn btn btn-secondary btn-sm p-1" data-email="${user.email}" title="Lihat Log Aktivitas"><i data-lucide="history" class="w-4 h-4 pointer-events-none"></i></button>
                    <button class="delete-user-btn btn btn-danger btn-sm p-1" data-id="${user.id}" data-email="${user.email}" title="Hapus Pengguna"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
                </div>
            </div>
        `;
    },

    async showUserActionModal(mode, userData = null) {
        let title = '',
            message = '',
            contentHTML = '',
            footerHTML = '';
        const currentUser = this.state.currentUser;
        const allowedRoles = currentUser.role === 'Master' ? ['Master', 'Admin', 'OED', 'Auditor'] : ['Admin', 'OED', 'Auditor'];
        const rolesOptionsHTML = allowedRoles.map(r => `<option value="${r}" ${userData?.role === r ? 'selected' : ''}>${r}</option>`).join('');

        switch (mode) {
            case 'create':
                title = 'Buat Pengguna Baru';
                message = 'Buat akun baru. Pengguna akan diminta untuk mengubah password sementara saat pertama kali login.';
                contentHTML = `
                            <div class="space-y-4">
                                <div><label for="modal-user-email" class="text-xs font-bold text-text-secondary">Email</label><input type="email" id="modal-user-email" class="form-input w-full mt-1"></div>
                                <div><label for="modal-user-password" class="text-xs font-bold text-text-secondary">Password Sementara</label><input type="password" id="modal-user-password" class="form-input w-full mt-1"></div>
                                <div><label for="modal-user-role" class="text-xs font-bold text-text-secondary">Role</label><select id="modal-user-role" class="form-select w-full mt-1">${rolesOptionsHTML}</select></div>
                            </div>`;
                footerHTML = `<div class="flex gap-2 mt-6"><button id="generic-modal-close-btn" class="btn btn-secondary w-full">Batal</button><button id="modal-action-btn" class="btn btn-primary w-full">Buat Pengguna</button></div>`;
                break;

            case 'edit':
                title = 'Edit Pengguna';
                message = `Mengubah peran untuk pengguna: ${userData.email}`;
                contentHTML = `
                            <div class="space-y-4">
                                <div><label class="text-xs font-bold text-text-secondary">Email</label><input type="email" class="form-input w-full mt-1 bg-black/20" value="${userData.email}" disabled></div>
                                <div><label for="modal-user-role" class="text-xs font-bold text-text-secondary">Role</label><select id="modal-user-role" class="form-select w-full mt-1">${rolesOptionsHTML}</select></div>
                                <hr class="border-border-color my-4">
                                <div>
                                    <label class="text-xs font-bold text-text-secondary">Reset Password</label>
                                    <p class="text-xs text-text-muted mt-1">Mengirim email instruksi reset password ke pengguna.</p>
                                    <button id="reset-password-btn" class="btn btn-warning w-full mt-2">Kirim Email Reset Password</button>
                                </div>
                            </div>`;
                footerHTML = `<div class="flex gap-2 mt-6"><button id="generic-modal-close-btn" class="btn btn-secondary w-full">Batal</button><button id="modal-action-btn" class="btn btn-primary w-full">Simpan Perubahan</button></div>`;
                break;

            case 'profile':
                title = 'Profil Saya';
                message = `Ubah password atau foto profil untuk akun Anda: ${userData.email}`;
                const avatarDisplay = userData.avatar_url 
                    ? `<img src="${userData.avatar_url}" alt="Avatar" class="w-24 h-24 rounded-full mx-auto object-cover border-2 border-color-primary">`
                    : `<div class="w-24 h-24 rounded-full mx-auto bg-gray-600 flex items-center justify-center text-4xl font-bold">${userData.email[0].toUpperCase()}</div>`;

                contentHTML = `
                     <div class="space-y-4">
                        <div class="text-center">
                            ${avatarDisplay}
                            <input type="file" id="avatar-upload-input" class="hidden" accept="image/png, image/jpeg">
                            <button id="avatar-upload-btn" class="btn btn-secondary btn-sm mt-2">Ganti Foto</button>
                        </div>
                        <hr class="border-border-color">
                        <div><label for="modal-new-password" class="text-xs font-bold text-text-secondary">Password Baru (opsional)</label><input type="password" id="modal-new-password" class="form-input w-full mt-1"></div>
                        <div><label for="modal-confirm-password" class="text-xs font-bold text-text-secondary">Konfirmasi Password Baru</label><input type="password" id="modal-confirm-password" class="form-input w-full mt-1"></div>
                    </div>`;
                footerHTML = `<div class="flex gap-2 mt-6"><button id="generic-modal-close-btn" class="btn btn-secondary w-full">Batal</button><button id="modal-action-btn" class="btn btn-primary w-full">Simpan Perubahan</button></div>`;
                break;
        }

        this.ui.showModal(title, message, contentHTML, {
            footerHTML
        });

        if (mode === 'profile') {
            document.getElementById('avatar-upload-btn').onclick = () => document.getElementById('avatar-upload-input').click();
            document.getElementById('avatar-upload-input').onchange = (e) => this.handlers.handleAvatarUpload(e);
        }

        if (mode === 'edit') {
            const resetBtn = document.getElementById('reset-password-btn');
            if(resetBtn) {
                resetBtn.onclick = () => this.handlers.handleSendPasswordReset(userData.id, userData.email);
            }
        }

        const actionBtn = document.getElementById('modal-action-btn');
        if (actionBtn) {
            actionBtn.onclick = () => {
                if (mode === 'create') this.handlers.handleCreateUser();
                else if (mode === 'edit') this.handlers.handleSaveUser(userData.id);
                else if (mode === 'profile') this.handlers.handleChangeMyPassword();
            };
        }
    },

    async handleSendPasswordReset(userId, email) {
        const newPassword = prompt(`Masukkan password baru untuk user ${email} (min 6 karakter):`);
        if (!newPassword) return;
        if (newPassword.length < 6) {
            alert('Password harus minimal 6 karakter!');
            return;
        }
        this.ui.showLoader(`Mengubah password untuk ${email}...`);
        try {
            await this.api.req(`/users/${userId}/password`, {
                method: 'PUT',
                body: JSON.stringify({ password: newPassword })
            });
            this.ui.hideLoader();
            this.ui.showModal('Sukses', `Password untuk ${email} berhasil diubah.`);
        } catch (e) {
            this.ui.hideLoader();
            this.ui.showModal('Error', `Gagal mengubah password: ${e.message}`);
        }
    },

    async handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            this.ui.showModal('Error', 'Format file tidak didukung. Gunakan JPG atau PNG.');
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB
            this.ui.showModal('Error', 'Ukuran file terlalu besar. Maksimal 2MB.');
            return;
        }
        
        this.ui.showLoader('Mengunggah foto profil...');
        try {
            const userId = this.state.currentUser.id;
            const avatarUrl = await this.api.uploadAvatar(userId, file);
            await this.api.updateProfileAvatar(userId, avatarUrl);
            
            const profile = await this.api.getProfile(userId);
            this.state.currentUser.avatar_url = profile.avatar_url; 
            
            this.ui.hideLoader();
            this.ui.hideModal();
            this.ui.showModal('Sukses', 'Foto profil berhasil diperbarui.', '', {
                onClose: () => this.handlers.setupUserManagementView()
            });

        } catch (error) {
            this.ui.hideLoader();
            this.ui.showModal('Error', `Gagal mengunggah foto: ${error.message}`);
        }
    },

    async handleSaveUser(userId) {
        const role = document.getElementById('modal-user-role').value;
        if (!userId || !role) return;
        this.ui.showLoader('Memperbarui peran...');
        try {
            await this.api.updateUserRole(userId, role);
            await this.api.logAction('UPDATE_USER_ROLE', {
                targetId: userId,
                newRole: role
            });
            this.ui.hideModal();
            this.ui.showModal('Sukses', `Peran pengguna berhasil diperbarui.`);
            await this.handlers.setupUserManagementView();
        } catch (e) {
            this.ui.showModal('Error', `Gagal memperbarui peran: ${e.message}`);
        } finally {
            this.ui.hideLoader();
        }
    },

    async handleChangeMyPassword() {
        const newPassword = document.getElementById('modal-new-password').value;
        const confirmPassword = document.getElementById('modal-confirm-password').value;

        if (newPassword && newPassword.length < 6) {
            this.ui.showModal('Error', 'Password baru minimal 6 karakter.');
            return;
        }
        if (newPassword !== confirmPassword) {
            this.ui.showModal('Error', 'Password tidak cocok.');
            return;
        }
        
        if (!newPassword) {
             this.ui.hideModal();
             this.ui.showModal('Info', 'Tidak ada perubahan disimpan.');
             return;
        }

        this.ui.showLoader('Mengubah password...');
        try {
            await this.api.req('/users/me/password', {
                method: 'PUT',
                body: JSON.stringify({ password: newPassword })
            });
            await this.api.logAction('CHANGE_OWN_PASSWORD_SUCCESS');
            this.ui.hideModal();
            this.ui.showModal('Sukses', 'Password Anda telah diubah.');
        } catch (error) {
            await this.api.logAction('CHANGE_OWN_PASSWORD_FAIL', {
                error: error.message
            });
            this.ui.showModal('Error', `Gagal mengubah password: ${error.message}.`);
        } finally {
            this.ui.hideLoader();
        }
    },

    async handleCreateUser() {
        const email = document.getElementById('modal-user-email').value.trim();
        const password = document.getElementById('modal-user-password').value;
        const role = document.getElementById('modal-user-role').value;

        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            this.ui.showModal('Error', 'Format email tidak valid.');
            return;
        }
        if (password.length < 6) {
            this.ui.showModal('Error', 'Password sementara minimal 6 karakter.');
            return;
        }
        if (!role) {
            this.ui.showModal('Error', 'Silakan pilih role untuk pengguna baru.');
            return;
        }

        this.ui.showLoader('Membuat pengguna baru...');
        try {
            await this.api.req('/users', {
                method: 'POST',
                body: JSON.stringify({ email, password, role })
            });

            this.ui.hideModal();
            this.ui.showModal('Sukses', `Pengguna ${email} berhasil dibuat.`);
            await this.api.logAction('CREATE_USER_SUCCESS', {
                email,
                role
            });
            await this.handlers.setupUserManagementView();
        } catch (e) {
            this.ui.showModal('Error', `Gagal membuat pengguna: ${e.message}`);
            await this.api.logAction('CREATE_USER_FAIL', {
                email,
                error: e.message
            });
        } finally {
            this.ui.hideLoader();
        }
    },

    async handleToggleUserStatus(e) {
        const {
            id,
            active
        } = e.currentTarget.dataset;
        const isActive = active === 'true';
        const actionText = isActive ? 'menonaktifkan' : 'mengaktifkan';
        const email = e.currentTarget.closest('div[class*="grid"]').querySelector('.font-mono').textContent;

        this.handlers.showConfirmationModal({
            title: `Konfirmasi Status Pengguna`,
            message: `Anda yakin ingin ${actionText} pengguna dengan email ${email}?`,
            confirmPhrase: actionText.toUpperCase(),
            onConfirm: async () => {
                this.ui.showLoader('Memperbarui status pengguna...');
                try {
                    await this.api.updateUserStatus(id, !isActive);
                    await this.api.logAction('TOGGLE_USER_STATUS', {
                        targetId: id,
                        newStatus: !isActive
                    });
                    await this.handlers.setupUserManagementView();
                } catch (err) {
                    this.ui.showModal('Error', `Gagal memperbarui status: ${err.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    async handleDeleteUser(e) {
        const {
            id,
            email
        } = e.currentTarget.dataset;
        this.handlers.showConfirmationModal({
            title: `Konfirmasi Hapus Pengguna`,
            message: `Anda benar-benar yakin ingin menghapus pengguna ${email}? Tindakan ini akan menghapus data login dan profil secara permanen dan tidak dapat dibatalkan.`,
            confirmPhrase: email,
            onConfirm: async () => {
                this.ui.showLoader(`Menghapus ${email}...`);
                try {
                    await this.api.req(`/users/${id}`, {
                        method: 'DELETE'
                    });

                    await this.api.logAction('DELETE_USER_SUCCESS', {
                        targetId: id,
                        targetEmail: email
                    });
                    this.ui.showModal('Sukses', `Pengguna ${email} berhasil dihapus.`);
                    await this.handlers.setupUserManagementView();
                } catch (err) {
                    this.ui.showModal('Error', `Gagal menghapus pengguna: ${err.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    async handleViewUserLogs(e) {
        const { email } = e.currentTarget.dataset;
        this.ui.showLoader(`Memuat log untuk ${email}...`);
        try {
            const logs = await this.api.req(`/logs?limit=500&actor=${encodeURIComponent(email)}`);

            const tableContent = `
                <div class="border border-border-color rounded-lg overflow-hidden">
                    <table class="w-full text-left text-xs table-fixed">
                        <thead class="bg-bg-panel backdrop-blur-sm">
                            <tr>
                                <th class="p-2 w-40">Waktu</th>
                                <th class="p-2 w-48">Pengguna</th>
                                <th class="p-2 w-40">Aksi</th>
                                <th class="p-2">Detail</th>
                            </tr>
                        </thead>
                    </table>
                    <div id="user-log-modal-scroll-container" class="overflow-auto h-[50vh] relative">
                         <div id="user-log-modal-scroller" class="relative w-full">
                            <table class="w-full text-left text-xs absolute top-0 left-0 table-fixed">
                                <tbody id="user-log-modal-tbody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            
            this.ui.showModal(
                `Log Aktivitas untuk ${email}`,
                `Menampilkan ${logs.length} log terakhir.`,
                tableContent, {
                    size: 'large',
                    onClose: () => {
                        if (this.state.virtualScrollInstances.userLogModal) {
                            this.state.virtualScrollInstances.userLogModal.destroy();
                            delete this.state.virtualScrollInstances.userLogModal;
                        }
                    }
                }
            );

            const renderUserLogModalRow = (log) => {
                return `
                    <tr class="h-[48px]">
                        <td class="p-2 w-40 text-text-muted whitespace-nowrap">${new Date(log.created_at).toLocaleString('id-ID', {dateStyle:'short', timeStyle:'medium'})}</td>
                        <td class="p-2 w-48 truncate">${log.actor}</td>
                        <td class="p-2 w-40 font-mono text-color-primary truncate">${log.action}</td>
                        <td class="p-2 text-text-muted break-all">${this.utils.formatLogDetails(log.details)}</td>
                    </tr>
                `;
            };

            const vsInstance = VirtualScrollManager.create({
                containerEl: document.getElementById('user-log-modal-scroll-container'),
                scrollerEl: document.getElementById('user-log-modal-scroller'),
                contentEl: document.getElementById('user-log-modal-tbody'),
                fullData: logs,
                renderRowFunction: renderUserLogModalRow,
                rowHeight: 48,
            });
            this.state.virtualScrollInstances.userLogModal = vsInstance;
            vsInstance.initialize();

        } catch (err) {
            this.ui.showModal('Error', `Gagal memuat log: ${err.message}`);
        } finally {
            this.ui.hideLoader();
        }
    },

    setupSettingsView() {
        const s = this.state.settings;

        document.getElementById('setting-logo-text').value = s.logoText || '';
        document.getElementById('setting-logo-description').value = s.logoDescription || '';

        const blurInput = document.getElementById('setting-blur'),
            blurValue = document.getElementById('setting-blur-value');
        if (blurInput) {
            blurInput.value = s.panelBlur;
            blurValue.textContent = `${s.panelBlur}px`;
            blurInput.oninput = () => {
                blurValue.textContent = `${blurInput.value}px`;
                document.documentElement.style.setProperty('--panel-blur', `${blurInput.value}px`);
            };
        }
        
        const flatThemeToggle = document.getElementById('setting-flat-theme');
        if (flatThemeToggle) {
            flatThemeToggle.checked = s.isFlatTheme || false;
        }

        document.getElementById('setting-bg-url').value = s.backgroundUrl || '';
        document.getElementById('setting-announcement-text').value = s.announcementText || '';

        const publicList = document.getElementById('public-widget-settings-list');
        if (publicList) {
            const allDefaultWidgets = (this.state.defaultConfig && Array.isArray(this.state.defaultConfig.publicDashboardLayout)) 
                                  ? this.state.defaultConfig.publicDashboardLayout 
                                  : [];
            
            let currentPublicLayoutSettings = [];
            if (s.publicDashboardLayout && Array.isArray(s.publicDashboardLayout)) {
                currentPublicLayoutSettings = s.publicDashboardLayout;
            } else if (this.state.defaultConfig && Array.isArray(this.state.defaultConfig.publicDashboardLayout)) {
                currentPublicLayoutSettings = this.state.defaultConfig.publicDashboardLayout;
            }

            const savedLayoutMap = new Map(currentPublicLayoutSettings.map(w => [w.id, w]));

            const finalLayoutForRender = allDefaultWidgets.map(defaultWidget => {
                const savedWidget = savedLayoutMap.get(defaultWidget.id);
                return savedWidget ? { ...defaultWidget,
                    visible: savedWidget.visible,
                    size: savedWidget.size
                } : { ...defaultWidget,
                    visible: false
                };
            }).sort((a, b) => {
                const indexA = currentPublicLayoutSettings.findIndex(w => w.id === a.id);
                const indexB = currentPublicLayoutSettings.findIndex(w => w.id === b.id);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });

            publicList.innerHTML = finalLayoutForRender.map(widget => `
                        <li data-id="${widget.id}" class="flex items-center justify-between p-2 bg-black/20 rounded">
                            <div class="flex items-center gap-3"><i data-lucide="grip-vertical" class="w-5 h-5 text-text-muted cursor-grab"></i><label for="public-widget-toggle-${widget.id}" class="font-bold">${widget.label}</label></div>
                            <div class="flex items-center gap-4">
                                <select id="public-widget-size-${widget.id}" class="form-select form-input bg-black/30 text-xs p-1 w-32">
                                    <option value="small" ${widget.size === 'small' ? 'selected' : ''}>Kecil (1/3)</option>
                                    <option value="half" ${widget.size === 'half' ? 'selected' : ''}>Setengah (1/2)</option>
                                    <option value="full" ${widget.size === 'full' ? 'selected' : ''}>Penuh (1/1)</option>
                                </select>
                                <input type="checkbox" id="public-widget-toggle-${widget.id}" class="form-input h-5 w-5" ${widget.visible ? 'checked' : ''}>
                            </div>
                        </li>`).join('');
            lucide.createIcons();
            new Sortable(publicList, {
                animation: 150,
                ghostClass: 'bg-purple-500/30',
                handle: '[data-lucide="grip-vertical"]'
            });
        }

        const announcementStyle = s.announcementStyle || this.state.defaultConfig.announcementStyle;
        document.getElementById('setting-announcement-font-size').value = announcementStyle.fontSize;
        document.getElementById('setting-announcement-font-weight').value = announcementStyle.fontWeight;
        document.getElementById('setting-announcement-color').value = announcementStyle.color;
        document.getElementById('setting-announcement-animation').value = announcementStyle.animation;

        const parsingSettings = (s.dataParsingSettings && typeof s.dataParsingSettings === 'object') ? s.dataParsingSettings : (this.state.defaultConfig.dataParsingSettings || {});
        
        document.getElementById('setting-paste-delimiter').value = parsingSettings.pasteDelimiter || '\\t';
        document.getElementById('setting-csv-delimiter').value = parsingSettings.csvDelimiter || ';';

        const columnSourceEl = document.getElementById('parsing-column-source');
        const columnDestEl = document.getElementById('parsing-column-destination');
        const allColumns = {
            tanggal: 'Tanggal',
            nama: 'Nama',
            jumlah: 'Jumlah',
            keterangan: 'Keterangan'
        };

        columnSourceEl.innerHTML = '';
        columnDestEl.innerHTML = '';

        const currentColumnOrder = Array.isArray(parsingSettings.columnOrder) ? parsingSettings.columnOrder : [];
        const currentOrderSet = new Set(currentColumnOrder);

        Object.entries(allColumns).forEach(([id, label]) => {
            if (!currentOrderSet.has(id)) {
                columnSourceEl.innerHTML += `<div class="parsing-column-tag" data-id="${id}">${label}</div>`;
            }
        });

        currentColumnOrder.forEach(id => {
            columnDestEl.innerHTML += `<div class="parsing-column-tag" data-id="${id}">${allColumns[id]}</div>`;
        });

        new Sortable(columnSourceEl, {
            group: 'columns',
            animation: 150
        });
        new Sortable(columnDestEl, {
            group: 'columns',
            animation: 150
        });

        const dateFormatsList = document.getElementById('parsing-date-formats-list');
        const currentDateFormats = Array.isArray(parsingSettings.dateFormats) ? parsingSettings.dateFormats : [];
        dateFormatsList.innerHTML = currentDateFormats.map(df => `
                    <li data-id="${df.id}" class="flex items-center justify-between p-2 bg-black/20 rounded cursor-grab">
                        <div class="flex items-center gap-3">
                            <i data-lucide="grip-vertical" class="w-5 h-5 text-text-muted"></i>
                            <div>
                                <label for="date-format-toggle-${df.id}" class="font-bold">${df.label}</label>
                                <p class="text-xs text-text-muted font-mono">Contoh: ${df.example}</p>
                            </div>
                        </div>
                        <input type="checkbox" id="date-format-toggle-${df.id}" class="form-input h-5 w-5" ${df.active ? 'checked' : ''}>
                    </li>
                `).join('');
        new Sortable(dateFormatsList, {
            animation: 150,
            handle: '[data-lucide="grip-vertical"]'
        });

        document.getElementById('setting-outlet-commission').value = s.outletCommissionPercentage || 0;
        document.getElementById('setting-cs-commission').value = s.csCommissionPercentage || 0;
        document.getElementById('setting-target-commission').value = s.targetCommission || 15000000;
        document.getElementById('setting-chart-limit').value = s.chartDataLimit || 50;
        document.getElementById('setting-month-start-day').value = s.monthStartDay || 29;
        document.getElementById('setting-month-end-day').value = s.monthEndDay || 28;
        document.getElementById('setting-admin-bank-fee').value = s.adminBankFeePercent || 0;
        document.getElementById('setting-admin-bank-keywords').value = (s.adminBankKeywords || []).join(', ');
        document.getElementById('setting-ticket-fee-destination').value = s.ticketFeeDestination || 'adminFee';

        document.getElementById('setting-exceptions').value = (s.exceptionKeywords || []).join(', ');
        document.getElementById('setting-audit-panel-enabled').checked = s.auditPanelEnabled;

        const routingKeywords = s.routingKeywords || {};
        const adminRules = s.adminRules || [];
        const nameConsolidation = s.nameConsolidation || {};
        const auditRules = s.auditRules || [];


        ['routing-manual-list', 'routing-tiket-list', 'admin-rules-list', 'name-consolidation-list', 'audit-rules-list'].forEach(id => document.getElementById(id).innerHTML = '');
        (routingKeywords.manual || []).forEach(kw => this.ui.addSettingTag('routing-manual-list', kw));
        (routingKeywords.tiket || []).forEach(kw => this.ui.addSettingTag('routing-tiket-list', kw));
        (adminRules || []).forEach(rule => this.ui.addAdminRuleRow(rule));
        Object.entries(nameConsolidation || {}).forEach(([from, to]) => this.ui.addNameMapRow(from, to));
        (auditRules || []).forEach(rule => this.ui.addAuditRuleRow(rule));

        document.getElementById('add-routing-manual-btn').onclick = () => {
            const i = document.getElementById('routing-manual-input');
            if (i.value) this.ui.addSettingTag('routing-manual-list', i.value.trim());
            i.value = '';
        };
        document.getElementById('add-routing-tiket-btn').onclick = () => {
            const i = document.getElementById('routing-tiket-input');
            if (i.value) this.ui.addSettingTag('routing-tiket-list', i.value.trim());
            i.value = '';
        };
        document.getElementById('add-admin-rule-btn').onclick = () => {
            const k = document.getElementById('admin-rule-keyword');
            const a = document.getElementById('admin-rule-amount');
            const ft = document.getElementById('admin-rule-fee-type');
            const fv = document.getElementById('admin-rule-fee-value');
            if (k.value && a.value && fv.value) {
                const newRule = {
                    keyword: k.value,
                    amount: parseFloat(a.value),
                    feeType: ft.value,
                    feeValue: parseFloat(fv.value)
                };
                this.ui.addAdminRuleRow(newRule);
                k.value = a.value = fv.value = '';
            }
        };
        document.getElementById('add-name-consolidation-btn').onclick = () => {
            const f = document.getElementById('name-consolidation-from'),
                t = document.getElementById('name-consolidation-to');
            if (f.value && t.value) {
                this.ui.addNameMapRow(f.value.toUpperCase(), t.value);
                f.value = t.value = '';
            }
        };
        document.getElementById('add-audit-rule-btn').onclick = () => {
            const k1 = document.getElementById('audit-rule-keyword1'),
                k2 = document.getElementById('audit-rule-keyword2');
            if (k1.value && k2.value) {
                this.ui.addAuditRuleRow({
                    keyword1: k1.value.trim(),
                    keyword2: k2.value.trim()
                });
                k1.value = k2.value = '';
            }
        };

        this.ui.renderWhatsappContactsList();
        document.getElementById('add-whatsapp-contact-btn').onclick = () => {
            const nameInput = document.getElementById('whatsapp-contact-name');
            const numberInput = document.getElementById('whatsapp-contact-number');
            const name = nameInput.value.trim();
            const number = numberInput.value.trim();

            if (name && number && number.startsWith('62')) {
                const newContact = { name, number };
                if (!this.state.settings.whatsappContacts) {
                    this.state.settings.whatsappContacts = [];
                }
                this.state.settings.whatsappContacts.push(newContact);
                this.ui.addWhatsappContactRow(newContact);
                nameInput.value = '';
                numberInput.value = '';
            } else {
                this.ui.showModal('Error', 'Nama harus diisi dan nomor harus diawali dengan 62.');
            }
        };

        document.getElementById('save-settings-btn').onclick = () => {
            this.handlers.collectSettingsFromUI();
            this.settings.saveGlobal();
        };

        document.getElementById('backup-settings-btn').onclick = this.settings.backup;
        document.getElementById('restore-settings-btn').onclick = () => document.getElementById('restore-file-input').click();
        document.getElementById('restore-file-input').onchange = this.settings.restore;
        document.getElementById('reset-settings-btn').onclick = this.handlers.handleResetSettings;

        const deletePanel = document.getElementById('delete-data-panel');
        if (deletePanel) {
            deletePanel.style.display = this.state.currentUser?.role === 'Master' ? 'block' : 'none';
            const {
                minDate,
                maxDate
            } = this.handlers._findDateRange();
            document.getElementById('delete-start-date').value = this.utils.formatDateForInput(minDate);
            document.getElementById('delete-end-date').value = this.utils.formatDateForInput(maxDate);
            document.getElementById('delete-data-btn').onclick = this.handlers.handleDeleteDataByDateRange;
        }

        lucide.createIcons();

        const accordionBtns = document.querySelectorAll('.accordion-button');
        accordionBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                this.classList.toggle('active');
                const content = this.nextElementSibling;
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                    content.style.paddingTop = '0';
                } else {
                    content.style.paddingTop = '1.5rem';
                    content.style.maxHeight = content.scrollHeight + "px";
                }
            });
        });

        // Logika untuk interaksi tema flat
        const bgUrlWrapper = document.getElementById('setting-bg-url-wrapper');
        const blurSlider = document.getElementById('setting-blur');
        const blurWrapper = blurSlider ? blurSlider.parentElement : null;

        const handleFlatThemeChange = () => {
            if (!flatThemeToggle) return;
            const isFlat = flatThemeToggle.checked;
            if (bgUrlWrapper) {
                bgUrlWrapper.classList.toggle('hidden', isFlat);
            }
            if (blurSlider && blurWrapper) {
                blurSlider.disabled = isFlat;
                blurWrapper.classList.toggle('opacity-50', isFlat);
                blurWrapper.classList.toggle('pointer-events-none', isFlat);
            }
        };

        if (flatThemeToggle) {
            flatThemeToggle.addEventListener('change', handleFlatThemeChange);
            // Panggil sekali saat inisialisasi untuk mengatur state awal
            handleFlatThemeChange();
        }
    },

    _findDateRange() {
        if (this.state.allData.length === 0) return {
            minDate: new Date(),
            maxDate: new Date()
        };
        let minTs = Infinity;
        let maxTs = -Infinity;
        for (const d of this.state.allData) {
            const t = new Date(d.tanggal).getTime();
            if (t < minTs) minTs = t;
            if (t > maxTs) maxTs = t;
        }
        return {
            minDate: new Date(minTs),
            maxDate: new Date(maxTs)
        };
    },

    async handleDeleteDataByDateRange() {
        const startDateValue = document.getElementById('delete-start-date').value;
        const endDateValue = document.getElementById('delete-end-date').value;

        if (!startDateValue || !endDateValue) {
            this.ui.showModal('Error', 'Silakan pilih rentang tanggal yang valid.');
            return;
        }

        const startDate = new Date(startDateValue);
        const endDate = new Date(endDateValue);
        endDate.setHours(23, 59, 59, 999);

        this.handlers.showConfirmationModal({
            title: 'Konfirmasi Hapus Data',
            message: `ANDA YAKIN ingin menghapus SEMUA data dari ${startDateValue} hingga ${endDateValue}?`,
            confirmPhrase: 'HAPUS DATA',
            onConfirm: async () => {
                this.ui.showLoader('Menghapus data transaksi...');
                try {
                    const count = await this.api.deleteDataByDateRange(startDate, endDate);
                    await this.api.logAction('DELETE_DATA_RANGE', {
                        startDate: startDateValue,
                        endDate: endDateValue,
                        count
                    });
                    this.ui.showModal('Sukses', `${count} baris data berhasil dihapus. Memuat ulang aplikasi...`, '', {
                        onClose: () => this.handlers.handleFullRefresh()
                    });
                } catch (e) {
                    this.ui.showModal('Error', `Gagal menghapus data: ${e.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    setDefaultDateFilters() {
        const settings = this.state.settings || this.state.defaultConfig || {};
        const startDay = settings.monthStartDay || 29;
        const endDay = settings.monthEndDay || 28;
        const today = new Date();
        
        let startYear = today.getFullYear();
        let startMonth = today.getMonth();
        
        if (today.getDate() < startDay) {
            startMonth -= 1;
            if (startMonth < 0) {
                startMonth = 11;
                startYear -= 1;
            }
        }
        
        const startDate = new Date(startYear, startMonth, startDay);
        
        let endYear = startYear;
        let endMonth = startMonth + 1;
        if (endMonth > 11) {
            endMonth = 0;
            endYear += 1;
        }
        const endDate = new Date(endYear, endMonth, endDay);
        
        this.dom.filterStartDate.value = this.utils.formatDateForInput(startDate);
        this.dom.filterEndDate.value = this.utils.formatDateForInput(endDate);
    },

    async handleFullRefresh() {
        this.ui.showLoader('Menyegarkan semua data...');
        await this.settings.load();
        await this.handlers.fetchInitialData();
        
        const container = document.getElementById('analysis-table-container');
        if (container) container.scrollTop = 0;
        
        if(this.state.analysisScrollTop) this.state.analysisScrollTop = 0;

        this.ui.applySettings(true);
        this.ui.hideLoader();
        this.ui.setStatus('Siap.');
    },

    async handleResetSettings() {
        this.handlers.showConfirmationModal({
            title: 'Konfirmasi Reset Pengaturan',
            message: 'Anda yakin ingin mengembalikan semua pengaturan ke default? Semua perubahan akan hilang.',
            confirmPhrase: 'RESET SEMUA',
            onConfirm: async () => {
                this.ui.showLoader('Mengembalikan ke default...');
                try {
                    const defaultSettings = this.state.defaultConfig;
                    const {
                        dashboardWidgets,
                        ...globalDefaults
                    } = defaultSettings;

                    await this.api.req('/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ settings: globalDefaults })
                    });

                    await this.api.logAction('RESET_SETTINGS');
                    this.ui.showModal('Sukses', 'Pengaturan telah dikembalikan ke default. Halaman akan dimuat ulang.', () => location.reload());
                } catch (e) {
                    console.error("Gagal mereset pengaturan:", e);
                    this.ui.showModal('Error', `Gagal mengembalikan pengaturan: ${e.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },showConfirmationModal({
        title,
        message,
        confirmPhrase,
        onConfirm,
        onCancel
    }) {
        const contentHTML = `
            <p class="text-sm text-color-warning mb-4">
                Tindakan ini tidak dapat dibatalkan. Untuk melanjutkan, ketik frasa berikut di bawah ini:
                <br>
                <strong class="font-mono user-select-all">${confirmPhrase}</strong>
            </p>
            <input type="text" id="confirmation-input" class="form-input w-full" autocomplete="off">
        `;
        const footerHTML = `
            <div class="grid grid-cols-2 gap-2 mt-6">
                <button id="generic-modal-cancel-btn" class="btn btn-secondary w-full">Batal</button>
                <button id="confirm-action-btn" class="btn btn-danger w-full" disabled>Konfirmasi</button>
            </div>
        `;
        this.ui.showModal(title, message, contentHTML, {
            footerHTML,
            onClose: onCancel
        });

        const confirmInput = document.getElementById('confirmation-input');
        const confirmBtn = document.getElementById('confirm-action-btn');
        const cancelBtn = document.getElementById('generic-modal-cancel-btn');

        confirmInput.addEventListener('input', () => {
            confirmBtn.disabled = confirmInput.value !== confirmPhrase;
        });
        confirmInput.addEventListener('paste', (e) => e.preventDefault());

        confirmBtn.onclick = () => {
            this.ui.hideModal();
            if (onConfirm) onConfirm();
        };

        cancelBtn.onclick = () => {
            this.ui.hideModal();
            if (onCancel) onCancel();
        };
    },

    handleSummaryRowClick(event) {
        const row = event.target.closest('.summary-row-clickable');
        if (!row) return;

        const userName = row.dataset.username;
        const filteredData = this.handlers.getFilteredData().filter(d => d.nama === userName);
        const isUserLoggedIn = !!this.state.currentUser;

        this.ui.showTransactionDetailModal(userName, filteredData, isUserLoggedIn);
        
        const modalContent = document.getElementById('generic-modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', this.handlers.handleTransactionModalClick);
        }
    },

    updateModalActionButtonsState() {
        const selectedCount = this.state.modalSelectedIds.size;
        const deleteBtn = document.getElementById('delete-modal-btn');
        const bulkEditBtn = document.getElementById('bulk-edit-modal-btn');

        if (!deleteBtn || !bulkEditBtn) return;

        if (selectedCount > 0) {
            deleteBtn.classList.remove('hidden');
            bulkEditBtn.classList.remove('hidden');
            deleteBtn.querySelector('span').textContent = `Hapus (${selectedCount})`;
            bulkEditBtn.querySelector('span').textContent = `Ubah (${selectedCount})`;
        } else {
            deleteBtn.classList.add('hidden');
            bulkEditBtn.classList.add('hidden');
        }
    },

    handleModalCheckboxChange(event, allDataInModal) {
        const target = event.target;
        if (!target.matches('input[type="checkbox"]')) return;

        if (target.id === 'select-all-modal-checkbox') {
            if (target.checked) {
                allDataInModal.forEach(row => this.state.modalSelectedIds.add(row.id));
            } else {
                this.state.modalSelectedIds.clear();
            }
        } else {
            const rowId = parseInt(target.dataset.rowId, 10);
            if (target.checked) {
                this.state.modalSelectedIds.add(rowId);
            } else {
                this.state.modalSelectedIds.delete(rowId);
            }
        }

        if (this.state.virtualScrollInstances.transactionDetailModal) {
            this.state.virtualScrollInstances.transactionDetailModal.updateAndRender();
        }

        const selectAllCheckbox = document.getElementById('select-all-modal-checkbox');
        if (selectAllCheckbox) {
            const selectedCount = this.state.modalSelectedIds.size;
            const totalCount = allDataInModal.length;
            if (selectedCount > 0 && selectedCount < totalCount) {
                selectAllCheckbox.indeterminate = true;
                selectAllCheckbox.checked = false;
            } else {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalCount;
            }
        }

        this.handlers.updateModalActionButtonsState();
    },

    async handleDeleteSelectedInModal() {
        const idsToDelete = Array.from(this.state.modalSelectedIds);
        if (idsToDelete.length === 0) return;

        this.handlers.showConfirmationModal({
            title: 'Konfirmasi Penghapusan',
            message: `Anda yakin ingin menghapus ${idsToDelete.length} transaksi yang dipilih?`,
            confirmPhrase: 'HAPUS',
            onConfirm: async () => {
                this.ui.showLoader('Menghapus transaksi...');
                try {
                    const count = await this.api.deleteDataBatch(idsToDelete);
                    await this.api.logAction('DELETE_DATA_MODAL', {
                        deleted_ids: idsToDelete,
                        count_reported_by_db: count
                    });

                    this.state.modalSelectedIds.clear();
                    this.ui.hideModal();
                    this.ui.showModal('Sukses', `${count} transaksi berhasil dihapus.`);
                    await this.handlers.handleFullRefresh();
                } catch (e) {
                    this.ui.showModal('Error', `Gagal menghapus: ${e.message}`);
                } finally {
                    this.ui.hideLoader();
                }
            }
        });
    },

    handleTransactionModalClick(event) {
        const target = event.target;
        const reportBtn = target.closest('.report-btn');
        const editBtn = target.closest('.edit-modal-btn');

        if (reportBtn) {
            const rowId = reportBtn.dataset.rowId;
            this.handlers.handleReportAction(rowId);
        } else if (editBtn) {
            const rowId = editBtn.dataset.rowId;
            this.handlers.handleDetailClick(rowId);
        }
    },

    handleReportAction(rowId) {
        const rowData = this.state.allData.find(r => r.id == rowId);
        if (!rowData) return;

        const { whatsappContacts = [] } = this.state.settings;

        const message = `
Tanggal: ${new Date(rowData.tanggal).toLocaleString('id-ID')}
Nama: ${rowData.nama}
Jumlah: ${this.utils.formatCurrency(rowData.jumlah)}
Keterangan: ${rowData.keterangan}
Laporan: CS, bantu cek data tartun ini
        `.trim();

        const encodedMessage = encodeURIComponent(message);

        const openWhatsApp = (number) => {
            const url = `https://wa.me/${number}?text=${encodedMessage}`;
            window.open(url, '_blank');
        };

        if (whatsappContacts.length === 0) {
            this.ui.showModal('Info', 'Tidak ada kontak WhatsApp yang diatur di Pengaturan.');
        } else if (whatsappContacts.length === 1) {
            openWhatsApp(whatsappContacts[0].number);
        } else {
            this.ui.showContactSelectionModal(whatsappContacts, (selectedNumber) => {
                openWhatsApp(selectedNumber);
                this.ui.hideModal();
            });
        }
    },

    handleBulkEditInModal() {
        const selectedCount = this.state.modalSelectedIds.size;
        if (selectedCount === 0) return;

        const contentHTML = `
            <div class="space-y-4">
                <div>
                    <label for="bulk-edit-modal-action-select" class="font-bold text-sm text-text-secondary">Pilih Aksi</label>
                    <select id="bulk-edit-modal-action-select" class="form-select w-full mt-1">
                        <option value="">-- Pilih Aksi --</option>
                        <option value="change_name">Ubah Nama</option>
                    </select>
                </div>
                <div id="bulk-edit-modal-input-container" class="hidden"></div>
            </div>
        `;

        const footerHTML = `
            <div class="grid grid-cols-2 gap-2 mt-6">
                <button id="generic-modal-cancel-btn" class="btn btn-secondary w-full">Batal</button>
                <button id="apply-bulk-edit-modal-btn" class="btn btn-primary w-full" disabled>Terapkan</button>
            </div>
        `;

        this.ui.showModal(`Aksi Massal untuk ${selectedCount} Transaksi`, '', contentHTML, {
            footerHTML,
            size: 'md'
        });

        const actionSelect = document.getElementById('bulk-edit-modal-action-select');
        const inputContainer = document.getElementById('bulk-edit-modal-input-container');
        const applyBtn = document.getElementById('apply-bulk-edit-modal-btn');

        actionSelect.onchange = () => {
            const action = actionSelect.value;
            inputContainer.innerHTML = '';
            inputContainer.classList.add('hidden');
            applyBtn.disabled = true;

            if (action === 'change_name') {
                inputContainer.innerHTML = `
                    <label for="bulk-edit-modal-new-name" class="font-bold text-sm text-text-secondary">Nama Baru</label>
                    <input type="text" id="bulk-edit-modal-new-name" class="form-input w-full mt-1" placeholder="Masukkan nama baru...">
                `;
                inputContainer.classList.remove('hidden');
                applyBtn.disabled = false;
            }
        };

        document.getElementById('generic-modal-cancel-btn').onclick = () => this.ui.hideModal();
        applyBtn.onclick = () => this.handlers.handleApplyBulkEditInModal();
    },

    async handleApplyBulkEditInModal() {
        const selectedIds = Array.from(this.state.modalSelectedIds);
        const action = document.getElementById('bulk-edit-modal-action-select').value;

        if (selectedIds.length === 0 || !action) return;

        let updates = [];
        let updateObject = {};
        let logDetails = {};

        if (action === 'change_name') {
            const newName = document.getElementById('bulk-edit-modal-new-name').value.trim();
            if (!newName) {
                this.ui.showModal('Error', 'Nama baru tidak boleh kosong.');
                return;
            }
            updateObject = { nama: newName };
            updates = selectedIds.map(id => ({ id, updateObject }));
            logDetails = { action: 'change_name_modal', newName, count: selectedIds.length, ids: selectedIds };
        }

        if (updates.length === 0) return;

        this.ui.showLoader(`Menerapkan perubahan pada ${selectedIds.length} data...`);
        try {
            const count = await this.api.updateDataBatch(updates);
            await this.api.logAction('BULK_ACTION_MODAL_SUCCESS', logDetails);
            
            this.state.modalSelectedIds.clear();
            this.ui.hideModal(); 
            this.ui.showModal('Sukses', `${count} data berhasil diperbarui.`);
            await this.handlers.handleFullRefresh();
        } catch (e) {
            this.ui.showModal('Error', `Gagal menerapkan aksi massal: ${e.message}`);
        } finally {
            this.ui.hideLoader();
        }
    }
};

