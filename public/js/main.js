document.addEventListener('DOMContentLoaded', () => {

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(script);

    Chart.register(ChartDataLabels);

    const App = {
        state: AppState,
        dom: {},
        utils: AppUtils,
        api: AppAPI,
        auth: AppAuth,
        ui: AppUI,
        handlers: AppHandlers,
        settings: {
            async load() {
                try {
                    const globalSettings = await this.api.req('/settings');
                    const defaultSettings = this.state.defaultConfig;
                    const mergedSettings = { ...defaultSettings, ...globalSettings };

                    if (this.state.currentUser) {
                        const userConfig = this.state.currentUser.dashboardConfig;
                        mergedSettings.dashboardWidgets = userConfig || defaultSettings.dashboardWidgets;
                    } else {
                        mergedSettings.dashboardWidgets = globalSettings.publicDashboardLayout || defaultSettings.publicDashboardLayout;
                    }

                    this.state.settings = mergedSettings;
                } catch (e) {
                    console.error("Gagal memuat pengaturan global:", e);
                    this.state.settings = this.state.defaultConfig;
                }
            },
            async saveGlobal() {
                try {
                    const { dashboardWidgets, ...globalSettingsToSave } = this.state.settings;
                    await this.api.req('/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ settings: globalSettingsToSave })
                    });
                    this.ui.applySettings();
                    this.ui.showSaveConfirmation();
                    this.api.logAction('SAVE_GLOBAL_SETTINGS');
                } catch (e) {
                    this.ui.showModal('Error', `Gagal menyimpan pengaturan global: ${e.message}`);
                }
            },
            backup() {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.settings, null, 2));
                const el = document.createElement('a');
                el.setAttribute("href", dataStr);
                el.setAttribute("download", `fkof-settings-backup-${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(el);
                el.click();
                el.remove();
                this.api.logAction('BACKUP_SETTINGS');
            },
            restore(event) {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const restored = JSON.parse(e.target.result);
                        if (restored.hasOwnProperty('backgroundUrl')) {
                            this.state.settings = restored;
                            await this.settings.saveGlobal();
                            this.api.logAction('RESTORE_SETTINGS');
                            this.ui.showModal('Sukses', 'Pengaturan dipulihkan.', () => this.ui.applySettings());
                        } else {
                            throw new Error('File tidak valid.');
                        }
                    } catch (err) {
                        this.ui.showModal('Error', `Gagal memulihkan: ${err.message}`);
                    }
                };
                reader.readAsText(file);
            }
        },
        
        /**
         * --- FUNGSI BARU UNTUK SESI TUNGGAL ---
         * Memulai pemeriksa sesi berkala untuk memastikan pengguna hanya memiliki satu sesi aktif.
         */
        startSessionChecker() {
            // Hentikan pemeriksa sesi sebelumnya jika ada untuk menghindari duplikat
            if (this.state.sessionCheckInterval) {
                clearInterval(this.state.sessionCheckInterval);
            }

            // Mulai pemeriksa sesi baru yang berjalan setiap 30 detik
            this.state.sessionCheckInterval = setInterval(async () => {
                const user = this.state.currentUser;
                const localSessionId = localStorage.getItem('fkof_session_id');

                // Hanya jalankan jika pengguna sedang login dan memiliki sesi di browser
                if (user && localSessionId) {
                    try {
                        const profile = await this.api.getProfile(user.id);
                        // Jika sesi di database tidak cocok dengan sesi di browser, logout paksa
                        if (profile && profile.session_id !== localSessionId) {
                            clearInterval(this.state.sessionCheckInterval);
                            this.state.sessionCheckInterval = null;
                            
                            localStorage.removeItem('fkof_token');
                            localStorage.removeItem('fkof_session_id');
                            
                            this.ui.showModal(
                                "Sesi Berakhir",
                                "Anda telah dikeluarkan karena akun ini login di perangkat lain.",
                                '',
                                { onClose: () => location.reload() }
                            );
                        }
                    } catch (error) {
                        console.error("Error saat memeriksa sesi:", error);
                        // Koneksi mungkin terputus, interval akan mencoba lagi nanti.
                    }
                }
            }, 30000); // Interval pemeriksaan: 30 detik
        },
        // --- AKHIR FUNGSI BARU ---

        setupFilterTypeDisplay() {
            const filterTypeSelect = this.dom.filterType;
            if (!filterTypeSelect) return;

            const originalTexts = new Map();
            Array.from(filterTypeSelect.options).forEach(option => {
                originalTexts.set(option, option.textContent);
            });

            const updateDisplay = () => {
                originalTexts.forEach((text, option) => {
                    option.textContent = text;
                });

                const selectedOption = filterTypeSelect.options[filterTypeSelect.selectedIndex];
                if (selectedOption && selectedOption.dataset.shortText) {
                    selectedOption.textContent = selectedOption.dataset.shortText;
                }
            };

            filterTypeSelect.addEventListener('focus', () => {
                originalTexts.forEach((text, option) => {
                    option.textContent = text;
                });
            });

            filterTypeSelect.addEventListener('change', updateDisplay);
            filterTypeSelect.addEventListener('blur', updateDisplay);

            updateDisplay();
        },

        init() {
            ['utils', 'api', 'auth', 'ui', 'handlers', 'settings'].forEach(moduleName => {
                const module = this[moduleName];
                for (const key in module) {
                    if (typeof module[key] === 'function') {
                        module[key] = module[key].bind(this);
                    }
                }
            });

            this.dom = {
                contentView: document.getElementById('content-view'),
                navButtons: document.querySelectorAll('.btn-nav'),
                filterPanel: document.getElementById('filter-panel'),
                filterSearch: document.getElementById('filter-search'),
                filterStartDate: document.getElementById('filter-start-date'),
                filterEndDate: document.getElementById('filter-end-date'),
                filterType: document.getElementById('filter-type'),
                resetBtn: document.getElementById('reset-btn'),
                businessMonthBtn: document.getElementById('business-month-btn'),
                statusDisplay: document.getElementById('status-display'),
                themeToggle: document.getElementById('theme-toggle'),
                themeToggleIcon: document.getElementById('theme-toggle-icon'),
                imageBgContainer: document.getElementById('image-bg-container'),
                protectedMenuContainer: document.getElementById('protected-menu-container'),
                loginModal: document.getElementById('login-modal'),
                loginUsername: document.getElementById('login-username'),
                loginPassword: document.getElementById('login-password'),
                loginBtn: document.getElementById('login-btn'),
                loginError: document.getElementById('login-error'),
                footerLoginBtn: document.getElementById('footer-login-btn'),
                footerUserMgmtBtn: document.getElementById('footer-user-mgmt-btn'),
                closeLoginModalBtn: document.getElementById('close-login-modal-btn'),
                mainNav: document.getElementById('main-nav'),
                filterToggleHandle: document.getElementById('filter-toggle-handle'),
                appContainer: document.getElementById('app-container'),
                publicLogPanel: document.getElementById('public-log-panel'),
            };

            Chart.register({
                id: 'customCanvasBackgroundColor',
                beforeDraw: (chart, args, options) => {
                    if (options.color) {
                        const { ctx } = chart;
                        ctx.save();
                        ctx.globalCompositeOperation = 'destination-over';
                        ctx.fillStyle = options.color;
                        ctx.fillRect(0, 0, chart.width, chart.height);
                        ctx.restore();
                    }
                }
            });

            this.dom.navButtons.forEach(button => button.addEventListener('click', () => {
                this.ui.switchView(button.dataset.view);
            }));

            this.dom.footerLoginBtn.addEventListener('click', () => {
                this.ui.showLoginModal();
            });
            this.dom.footerUserMgmtBtn.addEventListener('click', () => {
                this.ui.switchView('user-management');
            });
            this.dom.themeToggle.addEventListener('click', () => {
                const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
                localStorage.setItem('fkof_theme', newTheme);
                this.ui.applySettings();
            });

            this.dom.loginBtn.addEventListener('click', () => this.auth.login(this.dom.loginUsername.value.trim(), this.dom.loginPassword.value));
            this.dom.loginPassword.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') this.dom.loginBtn.click();
            });
            
            let filterTimeout;
            const debouncedFilter = () => {
                clearTimeout(filterTimeout);
                filterTimeout = setTimeout(() => {
                    this.ui.renderFilteredContent();
                }, 300);
            };

            this.dom.filterSearch.addEventListener('input', debouncedFilter);
            this.dom.filterStartDate.addEventListener('change', () => this.ui.renderFilteredContent());
            this.dom.filterEndDate.addEventListener('change', () => this.ui.renderFilteredContent());
            this.dom.filterType.addEventListener('change', () => this.ui.renderFilteredContent());
            
            this.dom.resetBtn.addEventListener('click', this.handlers.handleFilterReset);
            this.dom.businessMonthBtn.addEventListener('click', this.handlers.setToCurrentBusinessMonth);

            this.dom.closeLoginModalBtn.addEventListener('click', this.ui.hideLoginModal);
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !this.dom.loginModal.classList.contains('hidden')) {
                    this.ui.hideLoginModal();
                }
            });

            this.dom.filterToggleHandle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.ui.toggleFilterPanel();
            });

            this.dom.contentView.addEventListener('change', (e) => {
                if (this.state.activeView === 'analysis') {
                    this.handlers.handleAnalysisTableChange(e);
                }
            });

            window.addEventListener('click', (e) => {
                if (this.state.isFilterPanelVisible) {
                    const isClickInsideFilterPanel = this.dom.filterPanel.contains(e.target);
                    const isClickOnFilterHandle = this.dom.filterToggleHandle.contains(e.target);
                    
                    const presetActionsToggle = document.getElementById('preset-actions-toggle');
                    const presetActionsMenu = document.getElementById('preset-actions-menu');
                    const isClickOnPresetToggle = presetActionsToggle ? presetActionsToggle.contains(e.target) : false;
                    const isClickInsidePresetMenu = presetActionsMenu ? presetActionsMenu.contains(e.target) : false;

                    if (!isClickInsideFilterPanel && !isClickOnFilterHandle && !isClickOnPresetToggle && !isClickInsidePresetMenu) {
                        this.ui.toggleFilterPanel();
                    }
                }
            });

            this.ui.showLoader('Inisialisasi Sistem...');
            
            (async () => {
                try {
                    this.handlers.setDefaultDateFilters();
                    
                    const loggedInUser = await this.auth.check();
                    if (loggedInUser) {
                        await this.auth.handleAuthStateChange('SIGNED_IN', { user: loggedInUser });
                    } else {
                        await this.auth.handleAuthStateChange('SIGNED_OUT', null);
                    }
                    
                    // --- PEMANGGILAN PEMERIKSA SESI ---
                    // Memulai pemeriksa sesi setelah aplikasi diinisialisasi.
                    // Ini akan berjalan di latar belakang untuk menjaga keamanan sesi.
                    this.startSessionChecker();
                    // --- AKHIR PEMANGGILAN ---
                    
                    lucide.createIcons();
                    this.handlers.setupClearButtons();
                    this.handlers.setupFilterPresets();
                    this.setupFilterTypeDisplay();
                    
                    this.ui.setStatus('Siap.');
                } catch (error) {
                    console.error("Initialization failed:", error);
                    this.ui.hideLoader();
                }
            })();
        }
    };

    App.init();
});