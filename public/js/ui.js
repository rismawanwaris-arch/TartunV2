const AppUI = {
    // --- FUNGSI BARU UNTUK MENDAPATKAN OPSI GRAFIK TERPUSAT ---
    getChartOptions(type, isDarkMode) {
        const textColor = isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1e293b';
        const gridColor = isDarkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.7)';
        const legendColor = isDarkMode ? '#e2e8f0' : '#1e293b';
        const tooltipBgColor = isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(241, 245, 249, 0.9)';

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: legendColor,
                        font: { family: "'Inter', sans-serif" },
                        // --- PERBAIKAN: Sembunyikan 'Total Komisi' dari legenda ---
                        filter: function(legendItem, chartData) {
                            return legendItem.text !== 'Total Komisi';
                        }
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBgColor,
                    titleColor: textColor,
                    bodyColor: textColor,
                    titleFont: { family: "'Inter', sans-serif", weight: 'bold' },
                    bodyFont: { family: "'Inter', sans-serif" },
                    callbacks: {
                        label: (c) => {
                            // --- PERBAIKAN: Jangan tampilkan tooltip untuk dataset 'Total Komisi' ---
                            if (c.dataset.label === 'Total Komisi') {
                                return null;
                            }
                            return `${c.dataset.label || ''}: ${this.utils.formatCurrency(c.raw)}`;
                        }
                    }
                },
                customCanvasBackgroundColor: { color: 'transparent' }
            },
        };

        if (type === 'bar') {
            return {
                ...baseOptions,
                indexAxis: 'y',
                scales: {
                    x: {
                        ticks: { color: textColor, font: { family: "'Inter', sans-serif" }, callback: (value) => this.utils.formatCurrency(value).replace('Rp', '').replace(',00', '') },
                        grid: { color: gridColor },
                        stacked: true,
                        afterDataLimits: (scale) => { scale.max *= 1.2; } // Beri lebih banyak ruang untuk label
                    },
                    y: {
                        ticks: { color: textColor, font: { family: "'Inter', sans-serif" } },
                        grid: { display: false },
                        stacked: true
                    }
                },
                plugins: {
                    ...baseOptions.plugins,
                    datalabels: {
                        // Diterapkan pada dataset 'Komisi Tiket' untuk muncul di ujung
                        anchor: 'end',
                        align: 'end',
                        offset: 4, // Sedikit jarak dari batang
                        color: textColor,
                        font: { size: 10, family: "'Inter', sans-serif", weight: '600' },
                        formatter: (value, context) => {
                            // --- PERBAIKAN LOGIKA FORMATTER ---
                            // Mengambil nilai dari dataset ke-3 (yang disembunyikan) yang berisi total komisi outlet
                            const totalCommission = context.chart.data.datasets[2].data[context.dataIndex] || 0;
                            return totalCommission > 0 ? new Intl.NumberFormat('id-ID', { notation: 'compact', compactDisplay: 'short' }).format(totalCommission) : '';
                        }
                    }
                }
            };
        }

        if (type === 'pie') {
            return {
                ...baseOptions,
                cutout: '60%',
                plugins: {
                    ...baseOptions.plugins,
                    legend: { display: false },
                    tooltip: {
                        ...baseOptions.plugins.tooltip,
                        callbacks: {
                            label: (c) => `${c.label}: ${c.raw.toLocaleString('id-ID')} Transaksi`
                        }
                    },
                    datalabels: {
                        formatter: (value, ctx) => {
                            let sum = 0;
                            let dataArr = ctx.chart.data.datasets[0].data;
                            dataArr.map(data => { sum += data; });
                            let percentage = (value * 100 / sum).toFixed(1) + "%";
                            return sum > 0 ? percentage : '';
                        },
                        color: '#fff',
                        font: { weight: 'bold', size: 14, family: "'Inter', sans-serif" },
                        textStrokeColor: isDarkMode ? 'black' : 'rgba(0,0,0,0.5)',
                        textStrokeWidth: 2
                    }
                }
            };
        }

        return baseOptions;
    },
    
    toggleFilterPanel() {
        const isVisible = !this.state.isFilterPanelVisible;
        this.state.isFilterPanelVisible = isVisible;

        const filterWrapper = document.getElementById('sticky-filter-wrapper');
        const filterHandle = document.getElementById('filter-toggle-handle');

        filterWrapper.classList.toggle('filter-collapsed', !isVisible);
        
        if (filterHandle) {
            filterHandle.classList.toggle('active', isVisible);
        }
    },

    updateLogoDisplay() {
        const { logoText, logoDescription } = this.state.settings;

        const desktopLogo = document.getElementById('desktop-logo-text');
        const desktopDesc = document.getElementById('desktop-logo-description');

        if (desktopDesc) {
            desktopDesc.textContent = logoDescription || '';
        }

        const createGlitchSpans = (text) => {
            return text.split('').map(char => {
                const span = document.createElement('span');
                span.setAttribute('data-text', char);
                span.textContent = char;
                return span;
            });
        };

        if (desktopLogo) {
            desktopLogo.innerHTML = '';
            desktopLogo.setAttribute('data-text', logoText || '');
            const fragment = document.createDocumentFragment();
            createGlitchSpans(logoText || '').forEach(span => fragment.appendChild(span));
            desktopLogo.appendChild(fragment);
        }
    },

    showLoader(text = 'Memproses...') {
        const l = document.getElementById('loader'),
            t = document.getElementById('loader-text');
        if (t) {
            t.textContent = text;
            t.setAttribute('data-text', text);
        }
        if (l) l.style.display = 'flex';
    },

    hideLoader() {
        const l = document.getElementById('loader');
        if (l) l.style.display = 'none';
    },

    revealApp() {
        const c = document.getElementById('app-container');
        c.style.visibility = 'visible';
        c.style.opacity = 1;
    },

    setStatus(message) {
        this.dom.statusDisplay.textContent = `Status: ${message}`;
    },

    showSaveConfirmation() {
        const b = document.getElementById('save-settings-btn');
        if (!b) return;
        const originalText = b.textContent;
        b.textContent = 'Tersimpan!';
        b.classList.replace('btn-primary', 'btn-success');
        setTimeout(() => {
            b.textContent = originalText;
            b.classList.replace('btn-success', 'btn-primary');
        }, 2500);
    },

    showLoginModal() {
        this.dom.loginModal.classList.remove('hidden');
        this.dom.loginUsername.value = '';
        this.dom.loginPassword.value = '';
        this.dom.loginUsername.focus();
        this.handlers.setupClearButtons(this.dom.loginModal);
    },

    hideLoginModal() {
        this.dom.loginModal.classList.add('hidden');
    },

    showModal(title, message, contentHTML = '', options = {}) {
        const modal = document.getElementById('generic-modal');
        const modalPanel = document.getElementById('generic-modal-panel');
        modalPanel.className = 'glass-panel p-8 rounded-lg w-full text-left relative';
        if (options.size === 'large') {
            modalPanel.classList.add('max-w-4xl');
        } else if (options.size === 'xlarge') {
            modalPanel.classList.add('max-w-6xl');
        } else {
            modalPanel.classList.add('max-w-md');
        }
        document.getElementById('generic-modal-title').textContent = title;
        document.getElementById('generic-modal-message').textContent = message;
        document.getElementById('generic-modal-content').innerHTML = contentHTML;

        const footer = document.getElementById('generic-modal-footer');
        if (options.footerHTML) {
            footer.innerHTML = options.footerHTML;
        } else {
            footer.innerHTML = `<button id="generic-modal-close-btn" class="btn btn-primary w-full mt-6">Tutup</button>`;
        }

        const defaultCloseBtn = document.getElementById('generic-modal-close-btn') || (options.footerHTML && modal.querySelector('#generic-modal-close-btn'));
        if (defaultCloseBtn) {
            defaultCloseBtn.onclick = () => {
                modal.classList.add('hidden');
                if (options.onClose) options.onClose();
            };
        }

        modal.classList.remove('hidden');
        this.handlers.setupClearButtons(document.getElementById('generic-modal-content'));
    },

    hideModal() {
        document.getElementById('generic-modal').classList.add('hidden');
    },

    async updateMenuVisibility() {
        const role = this.state.currentUser?.role;
        const isLoggedIn = !!role;
        this.dom.footerLoginBtn.style.display = isLoggedIn ? 'none' : 'inline-flex';

        const userMgmtBtn = document.getElementById('footer-user-mgmt-btn');
        if (userMgmtBtn) {
            if (isLoggedIn) {
                userMgmtBtn.style.display = 'inline-flex';
                const profile = await this.api.getProfile(this.state.currentUser.id);
                const avatarUrl = profile ? profile.avatar_url : null;
                
                if (avatarUrl) {
                    userMgmtBtn.classList.add('user-avatar-icon');
                    userMgmtBtn.innerHTML = `<img src="${avatarUrl}" alt="Profil">`;
                } else {
                    userMgmtBtn.classList.remove('user-avatar-icon');
                    userMgmtBtn.innerHTML = `<i data-lucide="users" class="w-5 h-5"></i>`;
                    lucide.createIcons();
                }
            } else {
                userMgmtBtn.style.display = 'none';
                userMgmtBtn.classList.remove('user-avatar-icon');
                userMgmtBtn.innerHTML = `<i data-lucide="users" class="w-5 h-5"></i>`;
            }
        }

        this.dom.protectedMenuContainer.classList.toggle('hidden', !isLoggedIn);
        if (isLoggedIn) {
            document.querySelectorAll('#protected-menu .btn-nav').forEach(b => {
                const r = b.dataset.role.split(',');
                b.style.display = r.includes(role) ? 'flex' : 'none';
            });
        }
        await this.ui.renderActiveView();
    },

    async switchView(viewName) {
        if (this.state.activeView === 'analysis' && this.state.virtualScrollInstances.analysis) {
            this.state.virtualScrollInstances.analysis.destroy();
            delete this.state.virtualScrollInstances.analysis;
        }
        if (this.state.activeView === 'user-management' && this.state.virtualScrollInstances.userManagement) {
            this.state.virtualScrollInstances.userManagement.destroy();
            delete this.state.virtualScrollInstances.userManagement;
        }
        if (this.state.activeView === 'summary' && this.state.virtualScrollInstances.summary) {
            this.state.virtualScrollInstances.summary.destroy();
            delete this.state.virtualScrollInstances.summary;
        }
        if (this.state.activeView === 'input' && this.state.virtualScrollInstances.staging) {
            this.state.virtualScrollInstances.staging.destroy();
            delete this.state.virtualScrollInstances.staging;
        }

        if (this.state.activeView === 'analysis') {
            if (this.state.isAuditMode || this.state.isAllDataMode) {
                this.state.isAuditMode = false;
                this.state.isAllDataMode = false;
                
                this.dom.filterSearch.disabled = false;
                this.dom.filterType.disabled = false;
                this.dom.filterSearch.classList.remove('opacity-50');
                this.dom.filterType.classList.remove('opacity-50');
                this.dom.filterPanel.style.pointerEvents = 'auto';
                this.dom.filterPanel.style.opacity = '1';
            }
        }
        
        this.dom.contentView.classList.add('content-hidden');
        this.ui.showLoader(`Memuat ${viewName}...`);

        const contentView = this.dom.contentView;
        
        this.state.activeView = viewName;
        const button = document.querySelector(`.btn-nav[data-view="${viewName}"]`);
        
        const requiredRoles = button?.dataset.role?.split(',');
        if (requiredRoles && !requiredRoles.includes(this.state.currentUser?.role)) {
            this.ui.showLoginModal();
            this.ui.hideLoader(); 
            return;
        }

        this.dom.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
        
        await this.ui.renderView(viewName);

        this.ui.hideLoader();
        this.dom.contentView.classList.remove('content-hidden');
    },

    async renderView(viewName) {
        const contentView = this.dom.contentView;
        const template = document.getElementById(`${viewName}-template`);
        contentView.innerHTML = '';

        if (template) {
            contentView.appendChild(template.content.cloneNode(true));
            lucide.createIcons();

            const setupFunction = this.ui.viewSetups[viewName];
            if (setupFunction) {
                await setupFunction.call(this);
                this.handlers.setupClearButtons(contentView);
            }
        } else {
            contentView.innerHTML = `<p>Tampilan "${viewName}" tidak ditemukan.</p>`;
        }
    },

    async renderActiveView() {
        const view = this.state.activeView;
        const button = document.querySelector(`.btn-nav[data-view="${view}"]`);
        const requiredRoles = button?.dataset.role?.split(',');
        
        if (!this.state.currentUser && requiredRoles) {
            await this.ui.switchView('dashboard');
        } else {
            await this.ui.switchView(view);
        }
    },

    displayError(title, message) {
        this.dom.contentView.innerHTML = `<div class="text-center p-8 text-color-danger"><h2 class="text-2xl font-display">${title}</h2><p>${message}</p></div>`;
    },

    applySettings(shouldRenderView = true) {
        const { settings } = this.state;
        const root = document.documentElement;
        
        // Terapkan tema terang/gelap
        const theme = localStorage.getItem('fkof_theme') || 'dark';
        root.className = theme;
        this.dom.themeToggleIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        
        // Logika untuk tema flat dan wallpaper
        if (settings.isFlatTheme) {
            root.classList.add('flat');
            // Hapus wallpaper jika tema flat aktif
            this.dom.imageBgContainer.style.backgroundImage = 'none';
        } else {
            root.classList.remove('flat');
            // Terapkan wallpaper hanya jika tema flat tidak aktif
            if (settings.backgroundUrl) {
                this.dom.imageBgContainer.style.backgroundImage = `url('${settings.backgroundUrl}')`;
            } else {
                this.dom.imageBgContainer.style.backgroundImage = 'none';
            }
        }

        root.style.setProperty('--panel-blur', `${settings.panelBlur}px`);
        
        this.ui.updateLogoDisplay();

        lucide.createIcons();
        if (shouldRenderView) {
            this.ui.renderActiveView();
        }
    },

    viewSetups: {
        async dashboard() {
            await this.ui.renderDashboardWidgets();
            const configBtn = document.getElementById('configure-widgets-btn');
            if (configBtn && this.state.currentUser) {
                configBtn.style.display = 'flex';
                configBtn.onclick = this.handlers.openWidgetConfigModal;
            }
        },
        async summary() {
            this.handlers.setupSummaryView();
        },
        async charts() {
            this.handlers.renderChartsView();
        },
        async analysis() {
            this.handlers.setupAnalysisView();
        },
        async input() {
            this.handlers.setupInputView();
        },
        async settings() {
            this.handlers.setupSettingsView();

            const tabButtons = document.querySelectorAll('.settings-tab-btn');
            const tabContents = document.querySelectorAll('.settings-tab-content');
            
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const tab = button.dataset.tab;

                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');

                    tabContents.forEach(content => {
                        content.classList.toggle('hidden', content.dataset.content !== tab);
                    });
                });
            });
        },
        async 'user-management' () {
            await this.handlers.setupUserManagementView();
        },
    },

    renderFilteredContent() {
        if (!this.state.allData) return;
        const currentView = this.state.activeView;
        if (currentView === 'dashboard') this.ui.populateDashboardData();
        else if (currentView === 'summary') this.handlers.renderSummaryView();
        else if (currentView === 'charts') this.handlers.renderChartsView();
        else if (currentView === 'analysis') {
            const container = document.getElementById('analysis-table-container');
            if (container) container.scrollTop = 0;
            this.handlers.renderAnalysisView();
        }
    },

    async populateDashboardData() {
        if (!this.state.allData || this.state.allData.length === 0) return;

        const today = new Date();
        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);

        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const yStart = new Date(yesterday); yStart.setHours(0, 0, 0, 0);
        const yEnd = new Date(yesterday); yEnd.setHours(23, 59, 59, 999);

        const { monthStartDay, monthEndDay, targetCommission } = this.state.settings;
        let mStart, mEnd;
        if (today.getDate() >= monthStartDay) {
            mStart = new Date(today.getFullYear(), today.getMonth(), monthStartDay);
            mEnd = new Date(today.getFullYear(), today.getMonth() + 1, monthEndDay, 23, 59, 59, 999);
        } else {
            mStart = new Date(today.getFullYear(), today.getMonth() - 1, monthStartDay);
            mEnd = new Date(today.getFullYear(), today.getMonth(), monthEndDay, 23, 59, 59, 999);
        }

        const todayStartTs = todayStart.getTime(), todayEndTs = todayEnd.getTime();
        const yStartTs = yStart.getTime(), yEndTs = yEnd.getTime();
        const mStartTs = mStart.getTime(), mEndTs = mEnd.getTime();

        const todayData = [], yesterdayData = [], monthData = [];
        for (const d of this.state.allData) {
            const ts = d._ts;
            if (ts >= todayStartTs && ts <= todayEndTs) todayData.push(d);
            if (ts >= yStartTs && ts <= yEndTs) yesterdayData.push(d);
            if (ts >= mStartTs && ts <= mEndTs) monthData.push(d);
        }

        const todayAggregated = this.handlers.aggregateData(todayData);
        const yesterdayAggregated = this.handlers.aggregateData(yesterdayData);
        const monthAggregated = this.handlers.aggregateData(monthData);

        const metrics = {
            todayTotalAdminFee: Object.values(todayAggregated.byUser).reduce((sum, u) => sum + u.totalAdminFee, 0),
            todayTxCount: todayData.length,
            yesterdayTotalAdminFee: Object.values(yesterdayAggregated.byUser).reduce((sum, u) => sum + u.totalAdminFee, 0),
            yesterdayTxCount: yesterdayData.length,
            monthTotalCommission: Object.values(monthAggregated.byUser).reduce((sum, u) => sum + u.commissionOutlet, 0),
            monthTotalAdminFee: Object.values(monthAggregated.byUser).reduce((sum, u) => sum + u.totalAdminFee, 0),
            monthTotalCsCommission: Object.values(monthAggregated.byUser).reduce((sum, u) => sum + u.commissionCS, 0),
            monthActiveOutlets: Object.keys(monthAggregated.byUser).length,
            monthTopOutlets: Object.entries(monthAggregated.byUser)
                .sort(([, a], [, b]) => b.commissionOutlet - a.commissionOutlet)
                .slice(0, 5),
            monthManualTxCount: monthData.filter(d => d.tipe_sheet === 'MANUAL').length,
            monthTiketTxCount: monthData.filter(d => d.tipe_sheet === 'TIKET').length,
        };

        const kpiTodayTotalEl = document.getElementById('kpi-today-total');
        if (kpiTodayTotalEl) kpiTodayTotalEl.textContent = this.utils.formatCurrency(metrics.todayTotalAdminFee);

        const kpiTodayCountEl = document.getElementById('kpi-today-count');
        if (kpiTodayCountEl) kpiTodayCountEl.textContent = metrics.todayTxCount;

        const kpiYesterdayTotalEl = document.getElementById('kpi-yesterday-total');
        if (kpiYesterdayTotalEl) kpiYesterdayTotalEl.textContent = this.utils.formatCurrency(metrics.yesterdayTotalAdminFee);
        
        const kpiYesterdayCountEl = document.getElementById('kpi-yesterday-count');
        if (kpiYesterdayCountEl) kpiYesterdayCountEl.textContent = metrics.yesterdayTxCount;

        const kpiMonthCommissionEl = document.getElementById('kpi-month-commission');
        if (kpiMonthCommissionEl) kpiMonthCommissionEl.textContent = this.utils.formatCurrency(metrics.monthTotalCommission);
        
        const commissionProgressBar = document.getElementById('commission-progress-bar');
        if (commissionProgressBar) {
            const progress = targetCommission > 0 ? Math.min((metrics.monthTotalCommission / targetCommission) * 100, 100) : 0;
            commissionProgressBar.style.width = `${progress}%`;
            document.getElementById('progress-percentage').textContent = `${progress.toFixed(1)}%`;
            document.getElementById('current-commission-label').textContent = this.utils.formatCurrency(metrics.monthTotalCommission);
            document.getElementById('target-commission-label').textContent = `dari ${this.utils.formatCurrency(targetCommission)}`;
        }

        const topOutletsTbody = document.getElementById('top-outlets-tbody');
        if (topOutletsTbody) {
            if (metrics.monthTopOutlets.length > 0) {
                topOutletsTbody.innerHTML = metrics.monthTopOutlets.map(([name, data], index) => `
                    <tr class="border-t border-border-color/50">
                        <td class="p-2 text-center">${index + 1}</td>
                        <td class="p-2">${name}</td>
                        <td class="p-2 text-right">${this.utils.formatCurrency(data.commissionOutlet)}</td>
                    </tr>
                `).join('');
            } else {
                topOutletsTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-text-muted">Tidak ada data komisi bulan ini.</td></tr>`;
            }
        }

        const recentTxTbody = document.getElementById('recent-tx-tbody');
        if (recentTxTbody) {
            const recentTx = this.state.allData.slice(0, 5);
            if (recentTx.length > 0) {
                recentTxTbody.innerHTML = recentTx.map(tx => {
                    const adminFee = this.utils.calculateAdminFee(tx, this.state.settings);
                    return `
                             <tr class="border-t border-border-color/50">
                                <td class="p-2 text-text-muted">${new Date(tx.tanggal).toLocaleTimeString('id-ID')}</td>
                                <td class="p-2">${tx.nama}</td>
                                <td class="p-2 text-right">${this.utils.formatCurrency(adminFee)}</td>
                            </tr>
                        `
                }).join('');
            } else {
                recentTxTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-text-muted">Tidak ada transaksi.</td></tr>`;
            }
        }

        const txTypeChartCtx = document.getElementById('tx-type-pie-chart');
        if (txTypeChartCtx) {
            this.ui.renderTxTypeChart(txTypeChartCtx, metrics.monthManualTxCount, metrics.monthTiketTxCount);
        }

        const calcAmountInput = document.getElementById('calc-amount-input');
        if (calcAmountInput) {
            const clearBtn = document.getElementById('clear-calc-btn-icon');
            const typeContainer = document.getElementById('calc-type-segmented-control');

            calcAmountInput.addEventListener('input', (e) => {
                const rawValue = this.utils.parseFormattedNumber(e.target.value);
                e.target.value = this.utils.formatNumberWithDots(rawValue);
                if (clearBtn) clearBtn.style.visibility = e.target.value ? 'visible' : 'hidden';
                this.handlers.handleFeeCalculation();
            });

            if (typeContainer) {
                typeContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('segmented-control-button')) {
                        typeContainer.querySelectorAll('.segmented-control-button').forEach(btn => btn.classList.remove('active'));
                        e.target.classList.add('active');
                        this.handlers.handleFeeCalculation();
                    }
                });
            }

            if (clearBtn) {
                clearBtn.style.visibility = calcAmountInput.value ? 'visible' : 'hidden';
                clearBtn.onclick = () => {
                    calcAmountInput.value = '';
                    clearBtn.style.visibility = 'hidden';
                    this.handlers.handleFeeCalculation();
                    calcAmountInput.focus();
                };
            }
        }

        const announcementEl = document.getElementById('widget-announcement-text');
        if (announcementEl) {
            const style = this.state.settings.announcementStyle || this.state.defaultConfig.announcementStyle;
            announcementEl.textContent = this.state.settings.announcementText || 'Tidak ada pengumuman.';

            const sizeClassAnno = `text-${style.fontSize}`;
            const weightClass = `font-${style.fontWeight}`;
            const colorClass = style.color === 'default' ? 'text-text-primary' : `text-color-${style.color}`;
            const animationClass = style.animation !== 'none' ? `animate-${style.animation}` : '';

            announcementEl.className = `mt-2 whitespace-pre-wrap ${sizeClassAnno} ${weightClass} ${colorClass} ${animationClass}`;
        }

        const globalCommSummaryEl = document.getElementById('widget-global-admin-fee');
        if (globalCommSummaryEl) {
            document.getElementById('widget-global-admin-fee').textContent = this.utils.formatCurrency(metrics.monthTotalAdminFee);
            document.getElementById('widget-global-commission-outlet').textContent = this.utils.formatCurrency(metrics.monthTotalCommission);
            document.getElementById('widget-global-commission-cs').textContent = this.utils.formatCurrency(metrics.monthTotalCsCommission);
        }

        const activeOutletsEl = document.getElementById('widget-active-outlets-count');
        if (activeOutletsEl) {
            activeOutletsEl.textContent = metrics.monthActiveOutlets;
        }

        this.ui.populateDashboardTrendChart();
    },

    async renderDashboardWidgets() {
        const grid = document.getElementById('dashboard-grid');
        if (!grid) return;

        grid.innerHTML = '';
        const widgetConfig = this.state.settings.dashboardWidgets || [];
        const visibleWidgets = widgetConfig.filter(w => w.visible);

        if (visibleWidgets.length === 0) {
            grid.innerHTML = '<div class="col-span-6 text-center p-8 glass-panel">Tidak ada widget yang ditampilkan. Silakan klik "Atur Widget" untuk memilih.</div>';
            return;
        }
        
        const fragment = document.createDocumentFragment();

        visibleWidgets.forEach(widget => {
            let widgetContainer = document.createElement('div');
            let widgetHTML = '';
            
            let sizeClass = '';
            switch (widget.size) {
                case 'full':
                    sizeClass = 'col-span-6';
                    break;
                case 'half':
                    sizeClass = 'col-span-3';
                    break;
                case 'small':
                    sizeClass = 'col-span-2';
                    break;
                default:
                    sizeClass = 'col-span-3';
            }
            widgetContainer.className = `glass-panel p-3 ${sizeClass}`;

            switch (widget.id) {
                case 'announcement':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-indigo-500`;
                    const style = this.state.settings.announcementStyle || this.state.defaultConfig.announcementStyle;
                    const sizeClassAnno = `text-${style.fontSize}`;
                    const weightClass = `font-${style.fontWeight}`;
                    const colorClass = style.color === 'default' ? 'text-text-primary' : `text-color-${style.color}`;
                    const animationClass = style.animation !== 'none' ? `animate-${style.animation}` : '';
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-2">
                                    <div class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400"><i data-lucide="megaphone" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">PENGUMUMAN</h3>
                                </div>
                                <p id="widget-announcement-text" class="mt-2 whitespace-pre-wrap ${sizeClassAnno} ${weightClass} ${colorClass} ${animationClass}"></p>
                            `;
                    break;
                case 'globalCommissionSummary':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-teal-500`;
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-3">
                                    <div class="p-1.5 rounded-lg bg-teal-500/10 text-teal-400"><i data-lucide="pie-chart" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">RINGKASAN GLOBAL (BULAN INI)</h3>
                                </div>
                                <div class="space-y-2 text-sm">
                                    <div class="flex justify-between py-1 border-b border-border-color/40"><span>Total Biaya Admin:</span> <span id="widget-global-admin-fee" class="font-bold text-color-primary">Rp 0</span></div>
                                    <div class="flex justify-between py-1 border-b border-border-color/40"><span>Total Komisi Outlet:</span> <span id="widget-global-commission-outlet" class="font-bold text-color-success">Rp 0</span></div>
                                    <div class="flex justify-between py-1"><span>Total Komisi CS:</span> <span id="widget-global-commission-cs" class="font-bold text-color-accent">Rp 0</span></div>
                                </div>
                            `;
                    break;
                case 'activeOutletsCount':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-sky-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">OUTLET AKTIF (BULAN INI)</h3>
                                    <div class="p-1.5 rounded-lg bg-sky-500/10 text-sky-400"><i data-lucide="store" class="w-4 h-4"></i></div>
                                </div>
                                <p id="widget-active-outlets-count" class="text-3xl font-display font-bold text-sky-400 mt-1">0</p>
                            `;
                    break;
                case 'kpiTodayTotal':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-emerald-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">TOTAL ADMIN (HARI INI)</h3>
                                    <div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i data-lucide="trending-up" class="w-4 h-4"></i></div>
                                </div>
                                <p id="kpi-today-total" class="text-2xl font-display font-bold text-emerald-400 mt-1">Rp 0</p>
                            `;
                    break;
                case 'kpiTodayCount':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-emerald-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">JUMLAH TRANSAKSI (HARI INI)</h3>
                                    <div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i data-lucide="check-circle-2" class="w-4 h-4"></i></div>
                                </div>
                                <p id="kpi-today-count" class="text-2xl font-display font-bold text-emerald-400 mt-1">0</p>
                            `;
                    break;
                case 'kpiYesterdayTotal':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-cyan-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">TOTAL ADMIN (KEMARIN)</h3>
                                    <div class="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400"><i data-lucide="calendar" class="w-4 h-4"></i></div>
                                </div>
                                <p id="kpi-yesterday-total" class="text-2xl font-display font-bold text-cyan-400 mt-1">Rp 0</p>
                            `;
                    break;
                case 'kpiYesterdayCount':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-cyan-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">JUMLAH TRANSAKSI (KEMARIN)</h3>
                                    <div class="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400"><i data-lucide="layers" class="w-4 h-4"></i></div>
                                </div>
                                <p id="kpi-yesterday-count" class="text-2xl font-display font-bold text-cyan-400 mt-1">0</p>
                            `;
                    break;
                case 'kpiMonthCommission':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-pink-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">TOTAL KOMISI OUTLET (BULAN INI)</h3>
                                    <div class="p-1.5 rounded-lg bg-pink-500/10 text-pink-400"><i data-lucide="sparkles" class="w-4 h-4"></i></div>
                                </div>
                                <p id="kpi-month-commission" class="text-2xl font-display font-bold text-pink-400 mt-1">Rp 0</p>
                            `;
                    break;
                case 'kpiMonthTopUser':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-amber-500`;
                    widgetHTML = `
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">OUTLET TERAKTIF (BULAN INI)</h3>
                                    <div class="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><i data-lucide="trophy" class="w-4 h-4"></i></div>
                                </div>
                                <p id="kpi-month-top-user" class="text-xl font-bold text-amber-400 mt-1 truncate">-</p>
                            `;
                    break;
                case 'progressCommission':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-purple-500`;
                    widgetHTML = `
                                <div class="flex justify-between items-center mb-2">
                                    <div class="flex items-center gap-2">
                                        <div class="p-1.5 rounded-lg bg-purple-500/10 text-purple-400"><i data-lucide="target" class="w-4 h-4"></i></div>
                                        <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">PROGRESS TARGET KOMISI BULANAN</h3>
                                    </div>
                                    <span id="progress-percentage" class="font-display text-lg font-bold text-purple-400">0%</span>
                                </div>
                                <div class="progress-bar-container w-full h-3 mt-3">
                                    <div id="commission-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div class="flex justify-between text-xs mt-2 text-text-muted">
                                    <span id="current-commission-label" class="font-semibold text-text-primary">Rp 0</span>
                                    <span id="target-commission-label">dari Rp 15.000.000</span>
                                </div>`;
                    break;
                case 'trendChart':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass}`;
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-4">
                                    <div class="p-1.5 rounded-lg bg-sky-500/10 text-sky-400"><i data-lucide="activity" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">TREND BIAYA ADMIN (7 HARI TERAKHIR)</h3>
                                </div>
                                <div class="relative h-64"><canvas id="dashboard-trend-chart"></canvas></div>
                            `;
                    break;
                case 'tableTopOutlets':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass}`;
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-3">
                                    <div class="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><i data-lucide="medal" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">TOP 5 OUTLET (KOMISI BULAN INI)</h3>
                                </div>
                                <div class="overflow-auto max-h-48 rounded-lg border border-border-color/50">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-black/20 text-color-primary font-bold"><tr class="border-b border-border-color/50"><th class="p-2.5">#</th><th class="p-2.5">Nama</th><th class="p-2.5 text-right">Komisi</th></tr></thead>
                                    <tbody id="top-outlets-tbody" class="divide-y divide-border-color/30"></tbody>
                                </table>
                                </div>
                             `;
                    break;
                case 'tableRecentTx':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass}`;
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-3">
                                    <div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><i data-lucide="clock" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">5 TRANSAKSI TERKINI</h3>
                                </div>
                                <div class="overflow-auto max-h-48 rounded-lg border border-border-color/50">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-black/20 text-color-primary font-bold"><tr class="border-b border-border-color/50"><th class="p-2.5">Waktu</th><th class="p-2.5">Nama</th><th class="p-2.5 text-right">Admin</th></tr></thead>
                                    <tbody id="recent-tx-tbody" class="divide-y divide-border-color/30"></tbody>
                                </table>
                                </div>
                            `;
                    break;
                case 'chartTxType':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass}`;
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-3">
                                    <div class="p-1.5 rounded-lg bg-purple-500/10 text-purple-400"><i data-lucide="pie-chart" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">KOMPOSISI TIPE TRANSAKSI (BULAN INI)</h3>
                                </div>
                                <div class="relative h-48"><canvas id="tx-type-pie-chart"></canvas></div>
                            `;
                    break;
                case 'utilAdminCalculator':
                    widgetContainer.className = `glass-panel p-4 ${sizeClass} border-l-4 border-amber-500`;
                    const uniqueKeywords = [...new Set(this.state.settings.adminRules.map(rule => rule.keyword.toUpperCase()))];
                    const optionsHTML = uniqueKeywords.map((kw, index) => {
                        const buttonText = kw.replace(/,\s*/g, ' - ');
                        return `<button data-keyword="${kw}" class="segmented-control-button ${index === 0 ? 'active' : ''}">${buttonText}</button>`;
                    }).join('');
                    widgetHTML = `
                                <div class="flex items-center gap-2 mb-3">
                                    <div class="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><i data-lucide="calculator" class="w-4 h-4"></i></div>
                                    <h3 class="text-xs font-bold uppercase tracking-wider text-text-secondary">KALKULATOR BIAYA ADMIN</h3>
                                </div>
                                <div class="space-y-3 text-sm">
                                    <div class="relative">
                                        <input type="text" inputmode="numeric" id="calc-amount-input" class="form-input w-full pr-10" placeholder="Masukkan Jumlah (e.g. 50000)">
                                        <button id="clear-calc-btn-icon" class="absolute inset-y-0 right-0 flex items-center pr-3" style="visibility: hidden;">
                                            <i data-lucide="x-circle" class="h-5 w-5 text-text-secondary hover:text-color-danger"></i>
                                        </button>
                                    </div>
                                    <div id="calc-type-segmented-control" class="segmented-control">
                                        ${optionsHTML}
                                    </div>
                                    <div class="text-center pt-2 p-3 bg-black/20 rounded-lg border border-border-color/40">
                                        <p class="text-xs uppercase tracking-wider text-text-secondary">Perkiraan Biaya Admin:</p>
                                        <p id="calc-result" class="text-3xl font-display font-bold text-amber-400 mt-1">Rp 0</p>
                                    </div>
                                </div>
                             `;
                    break;
            }

            if (widgetHTML) {
                widgetContainer.innerHTML = widgetHTML;
                fragment.appendChild(widgetContainer);
            }
        });

        grid.appendChild(fragment);
        await this.ui.populateDashboardData();
        lucide.createIcons();
    },

    renderTxTypeChart(ctx, manualCount, tiketCount) {
        const isDarkMode = document.documentElement.classList.contains('dark');
        const textColor = isDarkMode ? '#e2e8f0' : '#1e293b';
        const total = manualCount + tiketCount;

        if (this.state.chartInstances['tx-type-pie-chart']) {
            this.state.chartInstances['tx-type-pie-chart'].destroy();
        }

        this.state.chartInstances['tx-type-pie-chart'] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Manual', 'Tiket'],
                datasets: [{
                    data: [manualCount, tiketCount],
                    backgroundColor: [
                        isDarkMode ? 'rgba(14, 165, 233, 0.7)' : 'rgba(3, 105, 161, 0.8)',
                        isDarkMode ? 'rgba(168, 85, 247, 0.7)' : 'rgba(147, 51, 234, 0.8)'
                    ],
                    borderColor: isDarkMode ? '#0f172a' : '#f1f5f9',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: {
                                family: "'Inter', sans-serif"
                            }
                        }
                    },
                    datalabels: {
                        formatter: (value) => {
                            if (total === 0) return '0%';
                            const percentage = (value / total * 100).toFixed(1) + '%';
                            return percentage;
                        },
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            family: "'Inter', sans-serif"
                        }
                    }
                }
            }
        });
    },

    populateDashboardTrendChart() {
        const trendCtx = document.getElementById('dashboard-trend-chart');
        if (!trendCtx) return;

        const dateLabels = [];
        const dailyAdminFees = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short'
            });
            dateLabels.push(dateString);
            dailyAdminFees[dateString] = 0;
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        const sevenDaysAgoTs = sevenDaysAgo.getTime();

        for (const row of this.state.allData) {
            if (row._ts < sevenDaysAgoTs) continue;
            const dateString = new Date(row._ts).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short'
            });
            if (dailyAdminFees.hasOwnProperty(dateString)) {
                dailyAdminFees[dateString] += this.utils.calculateAdminFee(row, this.state.settings);
            }
        }

        const dataValues = dateLabels.map(label => dailyAdminFees[label]);
        const isDarkMode = document.documentElement.classList.contains('dark');
        const textColor = isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(71, 85, 105, 0.8)';
        const gridColor = isDarkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)';
        const primaryColor = isDarkMode ? 'rgba(14, 165, 233, 1)' : 'rgba(3, 105, 161, 1)';
        const primaryColorBg = isDarkMode ? 'rgba(14, 165, 233, 0.2)' : 'rgba(3, 105, 161, 0.2)';

        if (this.state.chartInstances['dashboard-trend-chart']) {
            this.state.chartInstances['dashboard-trend-chart'].destroy();
        }
        this.state.chartInstances['dashboard-trend-chart'] = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: [{
                    label: 'Total Biaya Admin',
                    data: dataValues,
                    fill: true,
                    backgroundColor: primaryColorBg,
                    borderColor: primaryColor,
                    tension: 0.4,
                    pointBackgroundColor: primaryColor,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (c) => `${c.dataset.label || ''}: ${this.utils.formatCurrency(c.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor,
                            callback: (value) => this.utils.formatCurrency(value).replace(',00', '')
                        },
                        grid: {
                            color: gridColor
                        }
                    },
                    x: {
                        ticks: {
                            color: textColor
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    },

    renderDataCharts(aggregatedData) {
        Object.values(this.state.chartInstances).forEach(chart => {
            if (chart && chart.canvas) {
                if (chart.canvas.id !== 'dashboard-trend-chart' && chart.canvas.id !== 'tx-type-pie-chart') {
                    chart.destroy();
                }
            }
        });
        const { chartDataLimit } = this.state.settings;
        
        const isDarkMode = document.documentElement.classList.contains('dark');
        const pieBorderColor = isDarkMode ? '#0f172a' : '#f1f5f9';

        const userCtx = document.getElementById('user-bar-chart');
        if (userCtx) {
            const sortedUsers = Object.entries(aggregatedData.byUser)
                .filter(([, data]) => (data.commissionFromManual + data.commissionFromTiket) > 0)
                .sort(([, a], [, b]) => (b.commissionOutlet) - (a.commissionOutlet))
                .slice(0, chartDataLimit);

            const manualData = sortedUsers.map(([, data]) => data.commissionFromManual);
            const tiketData = sortedUsers.map(([, data]) => data.commissionFromTiket);
            // --- PERBAIKAN: Menambahkan dataset ketiga untuk total komisi ---
            const totalCommissionData = sortedUsers.map(([, data]) => data.commissionOutlet);
            
            const createGradient = (context, color1, color2) => {
                const chart = context.chart;
                const {ctx, chartArea} = chart;
                if (!chartArea) {
                    return color1;
                }
                const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
                gradient.addColorStop(0, color1);
                gradient.addColorStop(1, color2);
                return gradient;
            };

            this.state.chartInstances['user-bar-chart'] = new Chart(userCtx, {
                type: 'bar',
                data: {
                    labels: sortedUsers.map(([user]) => user.length > 15 ? user.substring(0, 12) + '...' : user),
                    datasets: [{
                        label: 'Komisi Manual',
                        data: manualData,
                        backgroundColor: (context) => createGradient(context, isDarkMode ? 'rgba(14, 165, 233, 0.9)' : 'rgba(3, 105, 161, 0.9)', isDarkMode ? 'rgba(14, 165, 233, 0.4)' : 'rgba(3, 105, 161, 0.4)'),
                        borderColor: isDarkMode ? 'rgba(14, 165, 233, 1)' : 'rgba(3, 105, 161, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
                        datalabels: { display: false }
                    }, {
                        label: 'Komisi Tiket',
                        data: tiketData,
                        backgroundColor: (context) => createGradient(context, isDarkMode ? 'rgba(168, 85, 247, 0.9)' : 'rgba(147, 51, 234, 0.9)', isDarkMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(147, 51, 234, 0.4)'),
                        borderColor: isDarkMode ? 'rgba(168, 85, 247, 1)' : 'rgba(147, 51, 234, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
                    }, {
                        // --- PERBAIKAN: Dataset tersembunyi untuk menyimpan nilai total ---
                        label: 'Total Komisi',
                        data: totalCommissionData,
                        hidden: true, // Menyembunyikan dari tampilan dan legenda
                        datalabels: {
                           display: true // Tetap aktifkan agar formatter bisa berjalan
                        }
                    }]
                },
                options: this.ui.getChartOptions('bar', isDarkMode)
            });
        }

        const typeCtx = document.getElementById('type-pie-chart');
        const typeStatsPanel = document.getElementById('type-stats-panel');
        if (typeCtx && typeStatsPanel) {
            const manualData = aggregatedData.byType['MANUAL'] || { count: 0, totalCommissionOutlet: 0 };
            const tiketData = aggregatedData.byType['TIKET'] || { count: 0, totalCommissionOutlet: 0 };
            const totalTransactions = manualData.count + tiketData.count;
            
            const pieColor1 = isDarkMode ? 'rgba(14, 165, 233, 0.8)' : 'rgba(3, 105, 161, 0.8)';
            const pieColor2 = isDarkMode ? 'rgba(168, 85, 247, 0.8)' : 'rgba(147, 51, 234, 0.8)';

            typeStatsPanel.innerHTML = `
                <div class="border-l-4 pl-3" style="border-color: ${pieColor1}">
                    <h4 class="font-bold" style="color: ${pieColor1}">TRANSAKSI (MANUAL)</h4>
                    <p class="text-xl font-display">${manualData.count.toLocaleString('id-ID')}</p>
                    <p class="text-sm text-text-secondary">Total Komisi: ${this.utils.formatCurrency(manualData.totalCommissionOutlet)}</p>
                </div>
                <div class="border-l-4 pl-3" style="border-color: ${pieColor2}">
                    <h4 class="font-bold" style="color: ${pieColor2}">TRANSAKSI (TIKET)</h4>
                    <p class="text-xl font-display">${tiketData.count.toLocaleString('id-ID')}</p>
                    <p class="text-sm text-text-secondary">Total Komisi: ${this.utils.formatCurrency(tiketData.totalCommissionOutlet)}</p>
                </div>
            `;

            const doughnutCenterText = {
                id: 'doughnutCenterText',
                afterDraw(chart) {
                    const { ctx } = chart;
                    if (chart.getDatasetMeta(0).data.length === 0) return;
                    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    ctx.save();
                    const x = chart.getDatasetMeta(0).data[0].x;
                    const y = chart.getDatasetMeta(0).data[0].y;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = `600 12px 'Inter', sans-serif`;
                    ctx.fillStyle = isDarkMode ? '#94a3b8' : '#64748b';
                    ctx.fillText('Total Transaksi', x, y - 14);
                    ctx.font = `bold 24px 'Orbitron', sans-serif`;
                    ctx.fillStyle = isDarkMode ? '#e2e8f0' : '#1e293b';
                    ctx.fillText(total.toLocaleString('id-ID'), x, y + 14);
                    ctx.restore();
                }
            };

            this.state.chartInstances['type-pie-chart'] = new Chart(typeCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Manual', 'Tiket'],
                    datasets: [{
                        data: [manualData.count, tiketData.count],
                        backgroundColor: [pieColor1, pieColor2],
                        borderColor: pieBorderColor,
                        borderWidth: 4,
                        hoverOffset: 8,
                        hoverBorderColor: isDarkMode ? '#fff' : '#000'
                    }]
                },
                plugins: [ChartDataLabels, doughnutCenterText],
                options: this.ui.getChartOptions('pie', isDarkMode)
            });
        }
    },

    renderColumnSettingsPanel() {
        const list = document.getElementById('column-settings-list');
        if (!list) return;
        list.innerHTML = '';

        this.state.settings.publicSummaryColumns.forEach(col => {
            const li = document.createElement('li');
            li.dataset.id = col.id;
            li.className = 'flex items-center justify-between p-2 bg-black/20 rounded cursor-grab';
            li.innerHTML = `
                        <div class="flex items-center gap-3">
                            <i data-lucide="grip-vertical" class="w-5 h-5 text-text-muted"></i>
                            <label for="col-toggle-${col.id}" class="font-bold">${col.label}</label>
                        </div>
                        <input type="checkbox" id="col-toggle-${col.id}" class="form-input h-5 w-5" ${col.visible ? 'checked' : ''}>
                    `;
            list.appendChild(li);
        });
        lucide.createIcons();

        new Sortable(list, {
            animation: 150,
            ghostClass: 'bg-cyan-500/30'
        });
    },

    renderStagingTable() {
        const tableHeadWrapper = document.getElementById('staging-table-head-wrapper');
        if (!tableHeadWrapper) return;
    
        tableHeadWrapper.innerHTML = `
            <div class="grid grid-cols-[120px,1fr,1fr,1fr,1fr,80px] gap-x-4 font-bold text-xs text-text-secondary uppercase p-2">
                <div>Status</div>
                <div>Tanggal</div>
                <div>Nama</div>
                <div>Jumlah</div>
                <div>Keterangan</div>
                <div class="text-center">Aksi</div>
            </div>
        `;
    },

    createStagingTableRow(item) {
        let statusClass = '';
        let statusIcon = '';
        let statusText = '';

        switch (item.status) {
            case 'valid':
                statusClass = 'text-color-success';
                statusIcon = 'check-circle-2';
                statusText = 'Valid';
                break;
            case 'duplicate_db':
            case 'duplicate_input':
                statusClass = 'text-color-warning';
                statusIcon = 'alert-triangle';
                statusText = 'Duplikat';
                break;
            case 'error':
                statusClass = 'text-color-danger';
                statusIcon = 'x-circle';
                statusText = 'Error';
                break;
        }

        const isError = item.status === 'error';
        const inputClass = isError ? 'form-input form-input-sm bg-red-900/50 border-red-500/50' : 'form-input form-input-sm';

        const deleteButton = isError ? `
            <button class="btn btn-danger btn-sm p-1 delete-staging-row-btn" data-index="${item.originalIndex}" title="Hapus Baris">
                <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
        ` : '';

        const tanggalDisplay = isError 
            ? `<input type="text" class="${inputClass} w-full" value="${item.data.tanggal || ''}">` 
            : `<div class="truncate" title="${new Date(item.data.tanggal).toLocaleString('id-ID')}">${new Date(item.data.tanggal).toLocaleDateString('id-ID')}</div>`;

        const namaDisplay = isError 
            ? `<input type="text" class="${inputClass} w-full" value="${item.data.nama || ''}">`
            : `<div class="truncate" title="${item.data.nama || ''}">${item.data.nama || ''}</div>`;

        const jumlahDisplay = isError
            ? `<input type="text" class="${inputClass} w-full" value="${item.data.jumlah || ''}">`
            : `<div class="truncate">${this.utils.formatCurrency(item.data.jumlah)}</div>`;

        const keteranganDisplay = isError 
            ? `<input type="text" class="${inputClass} w-full" value="${item.data.keterangan || ''}">` 
            : `<div class="truncate" title="${item.data.keterangan || ''}">${item.data.keterangan || ''}</div>`;


        return `
            <div class="h-[60px] grid grid-cols-[120px,1fr,1fr,1fr,1fr,80px] gap-x-4 items-center border-t border-border-color/50 p-2" data-index="${item.originalIndex}">
                <div>
                    <div class="flex items-center gap-2 ${statusClass}">
                        <i data-lucide="${statusIcon}" class="w-4 h-4"></i>
                        <span class="font-bold">${statusText}</span>
                    </div>
                    ${item.errorReason ? `<p class="text-xs text-text-muted mt-1 truncate" title="${item.errorReason}">${item.errorReason}</p>` : ''}
                </div>
                <div>
                    ${tanggalDisplay}
                </div>
                <div>
                    ${namaDisplay}
                </div>
                <div>
                    ${jumlahDisplay}
                </div>
                <div>
                    ${keteranganDisplay}
                </div>
                <div class="text-center">
                    ${isError ? deleteButton : '-'}
                </div>
            </div>
        `;
    },

    updateStagingStatsAndSubmitBtn() {
        const stats = {
            total: 0,
            valid: 0,
            duplicate: 0,
            error: 0
        };
        let totalNominal = 0;
        this.state.stagingData.forEach(item => {
            stats.total++;
            if (item.status === 'valid') {
                stats.valid++;
                totalNominal += (parseFloat(item.data.jumlah) || 0);
            }
            else if (item.status.startsWith('duplicate')) stats.duplicate++;
            else if (item.status === 'error') stats.error++;
        });

        document.getElementById('staging-total-count').textContent = stats.total;
        document.getElementById('staging-valid-count').textContent = stats.valid;
        document.getElementById('staging-duplicate-count').textContent = stats.duplicate;
        document.getElementById('staging-error-count').textContent = stats.error;

        const nominalEl = document.getElementById('staging-total-nominal');
        if (nominalEl) {
            nominalEl.textContent = this.utils.formatCurrency(totalNominal);
        }

        const submitBtn = document.getElementById('submit-valid-data-btn');
        const submitCount = document.getElementById('submit-valid-count');
        const deleteAllErrorsBtn = document.getElementById('delete-all-errors-btn');

        const canSubmit = stats.valid > 0;
        submitBtn.disabled = !canSubmit;
        submitCount.textContent = stats.valid;

        if (deleteAllErrorsBtn) {
            deleteAllErrorsBtn.style.display = stats.error > 0 ? 'flex' : 'none';
        }
    },

    addSettingTag(listId, keyword) {
        const list = document.getElementById(listId);
        const tag = document.createElement('span');
        tag.className = 'bg-cyan-800 text-cyan-200 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full flex items-center gap-1';
        tag.innerHTML = `${keyword} <button class="remove-btn text-cyan-400 hover:text-white">&times;</button>`;
        tag.querySelector('.remove-btn').onclick = () => tag.remove();
        list.appendChild(tag);
    },

    addAdminRuleRow(rule) {
        const list = document.getElementById('admin-rules-list');
        const row = document.createElement('div');
        row.className = 'rule-row-wrapper';
        list.appendChild(row);
        this.ui.renderAdminRuleView(row, rule);
    },

    renderAdminRuleView(wrapper, rule) {
        const feeDisplay = rule.feeType === 'percentage' ?
            `${rule.feeValue}%` :
            this.utils.formatCurrency(rule.feeValue);

        wrapper.innerHTML = `
                    <div class="grid grid-cols-5 items-center gap-2 bg-black/20 p-1 rounded-md text-xs">
                        <span class="p-1 font-mono col-span-1">${rule.keyword}</span>
                        <span class="p-1 text-center font-mono col-span-1">&lt;= ${this.utils.formatCurrency(rule.amount)}</span>
                        <span class="p-1 text-right font-mono col-span-2">${feeDisplay}</span>
                        <div class="actions text-right col-span-1">
                            <button class="edit-btn text-color-primary hover:text-white p-1 inline-block"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>
                            <button class="remove-btn text-color-danger hover:text-white p-1 inline-block"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
                        </div>
                    </div>
                `;
        wrapper.querySelector('.edit-btn').onclick = () => this.ui.renderAdminRuleEdit(wrapper, rule);
        wrapper.querySelector('.remove-btn').onclick = () => wrapper.remove();
        lucide.createIcons();
    },

    renderAdminRuleEdit(wrapper, rule) {
        const isOldFormat = rule.fee !== undefined && rule.feeValue === undefined;
        const feeType = rule.feeType || 'flat';
        const feeValue = isOldFormat ? rule.fee : (rule.feeValue || 0);

        wrapper.innerHTML = `
                    <div class="grid grid-cols-5 items-center gap-2 bg-black/20 p-1 rounded-md text-xs">
                        <div class="col-span-1"><input class="form-input text-xs w-full" value="${rule.keyword || ''}"></div>
                        <div class="col-span-1"><input type="number" class="form-input text-xs w-full" value="${rule.amount || 0}"></div>
                        <div class="col-span-1"><select class="form-select text-xs w-full">
                            <option value="flat" ${feeType === 'flat' ? 'selected' : ''}>Rp</option>
                            <option value="percentage" ${feeType === 'percentage' ? 'selected' : ''}>%</option>
                        </select></div>
                        <div class="col-span-1"><input type="number" step="0.01" class="form-input text-xs w-full" value="${feeValue}"></div>
                        <div class="actions text-right col-span-1">
                            <button class="save-btn text-color-success hover:text-white p-1 inline-block"><i data-lucide="check" class="w-4 h-4 pointer-events-none"></i></button>
                            <button class="cancel-btn text-color-warning hover:text-white p-1 inline-block"><i data-lucide="x" class="w-4 h-4 pointer-events-none"></i></button>
                        </div>
                    </div>
                `;
        wrapper.querySelector('.save-btn').onclick = () => {
            const inputs = wrapper.querySelectorAll('input, select');
            const newRule = {
                keyword: inputs[0].value,
                amount: parseFloat(inputs[1].value),
                feeType: inputs[2].value,
                feeValue: parseFloat(inputs[3].value),
            };
            this.ui.renderAdminRuleView(wrapper, newRule);
        };
        wrapper.querySelector('.cancel-btn').onclick = () => this.ui.renderAdminRuleView(wrapper, rule);
        lucide.createIcons();
    },

    addNameMapRow(from, to) {
        const list = document.getElementById('name-consolidation-list');
        const row = document.createElement('div');
        row.className = 'rule-row-wrapper';
        list.appendChild(row);
        this.ui.renderNameMapView(row, {
            from,
            to
        });
    },

    addNmidMappingRow(from, to) {
        const list = document.getElementById('nmid-mapping-list');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'rule-row-wrapper';
        list.appendChild(row);
        
        row.innerHTML = `
            <div class="flex items-center gap-2 bg-black/20 p-1 rounded-md text-xs">
                <span class="flex-grow p-1 font-mono font-bold">${from}</span>
                <i data-lucide="arrow-right" class="w-4 h-4 text-color-primary"></i>
                <span class="flex-grow p-1 font-mono">${to}</span>
                <div class="actions">
                    <button class="remove-btn text-color-danger hover:text-white p-1">
                        <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `;
        row.querySelector('.remove-btn').onclick = () => row.remove();
        lucide.createIcons();
    },

    renderNameMapView(wrapper, rule) {
        wrapper.innerHTML = `<div class="flex items-center gap-2 bg-black/20 p-1 rounded-md text-xs"><span class="flex-1 p-1 font-mono">${rule.from}</span><i data-lucide="arrow-right" class="w-4 h-4 text-color-primary"></i><span class="flex-1 p-1 font-mono font-bold">${rule.to}</span><div class="actions"><button class="edit-btn text-color-primary hover:text-white p-1"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button><button class="remove-btn text-color-danger hover:text-white p-1"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button></div></div>`;
        wrapper.querySelector('.edit-btn').onclick = () => this.ui.renderNameMapEdit(wrapper, rule);
        wrapper.querySelector('.remove-btn').onclick = () => wrapper.remove();
        lucide.createIcons();
    },

    renderNameMapEdit(wrapper, rule) {
        wrapper.innerHTML = `<div class="flex items-center gap-2 bg-black/20 p-1 rounded-md text-xs"><input class="form-input text-xs flex-1" value="${rule.from}"><i data-lucide="arrow-right" class="w-4 h-4 text-color-primary"></i><input class="form-input text-xs flex-1" value="${rule.to}"><div class="actions"><button class="save-btn text-color-success hover:text-white p-1"><i data-lucide="check" class="w-4 h-4 pointer-events-none"></i></button><button class="cancel-btn text-color-warning hover:text-white p-1"><i data-lucide="x" class="w-4 h-4 pointer-events-none"></i></button></div></div>`;
        wrapper.querySelector('.save-btn').onclick = () => {
            const inputs = wrapper.querySelectorAll('input');
            this.ui.renderNameMapView(wrapper, {
                from: inputs[0].value,
                to: inputs[1].value
            });
        };
        wrapper.querySelector('.cancel-btn').onclick = () => this.ui.renderNameMapView(wrapper, rule);
        lucide.createIcons();
    },

    addAuditRuleRow(rule) {
        const list = document.getElementById('audit-rules-list');
        const row = document.createElement('div');
        row.className = 'rule-row-wrapper';
        list.appendChild(row);
        this.ui.renderAuditRuleView(row, rule);
    },

    renderAuditRuleView(wrapper, rule) {
        wrapper.innerHTML = `<div class="flex items-center gap-2 bg-black/20 p-1 rounded-md text-xs"><span class="flex-1 p-1 font-mono">${rule.keyword1}</span><i data-lucide="repeat" class="w-4 h-4 text-color-primary"></i><span class="flex-1 p-1 font-mono">${rule.keyword2}</span><div class="actions"><button class="edit-btn text-color-primary hover:text-white p-1"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button><button class="remove-btn text-color-danger hover:text-white p-1"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button></div></div>`;
        wrapper.querySelector('.edit-btn').onclick = () => this.ui.renderAuditRuleEdit(wrapper, rule);
        wrapper.querySelector('.remove-btn').onclick = () => wrapper.remove();
        lucide.createIcons();
    },

    renderAuditRuleEdit(wrapper, rule) {
        wrapper.innerHTML = `<div class="flex items-center gap-2 bg-black/20 p-1 rounded-md text-xs"><input class="form-input text-xs flex-1" value="${rule.keyword1}"><i data-lucide="repeat" class="w-4 h-4 text-color-primary"></i><input class="form-input text-xs flex-1" value="${rule.keyword2}"><div class="actions"><button class="save-btn text-color-success hover:text-white p-1"><i data-lucide="check" class="w-4 h-4 pointer-events-none"></i></button><button class="cancel-btn text-color-warning hover:text-white p-1"><i data-lucide="x" class="w-4 h-4 pointer-events-none"></i></button></div></div>`;
        wrapper.querySelector('.save-btn').onclick = () => {
            const inputs = wrapper.querySelectorAll('input');
            this.ui.renderAuditRuleView(wrapper, {
                keyword1: inputs[0].value,
                keyword2: inputs[1].value
            });
        };
        wrapper.querySelector('.cancel-btn').onclick = () => this.ui.renderAuditRuleView(wrapper, rule);
        lucide.createIcons();
    },

    renderUserRoleChart(roleCounts) {
        const ctx = document.getElementById('user-role-chart');
        if (!ctx) return;

        if (this.state.chartInstances['user-role-chart']) {
            this.state.chartInstances['user-role-chart'].destroy();
        }

        const isDarkMode = document.documentElement.classList.contains('dark');
        const textColor = isDarkMode ? '#e2e8f0' : '#1e293b';
        const labels = Object.keys(roleCounts);
        const data = Object.values(roleCounts);

        const colors = {
            'Master': '#f59e0b', // warning
            'Admin': '#ef4444', // danger
            'OED': '#0ea5e9', // primary
            'Auditor': '#a855f7' // accent
        };

        this.state.chartInstances['user-role-chart'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: labels.map(label => colors[label] || '#64748b'),
                    borderColor: isDarkMode ? '#0f172a' : '#f1f5f9',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '50%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textColor,
                            font: { family: "'Inter', sans-serif" },
                            boxWidth: 12,
                            padding: 10
                        }
                    },
                    datalabels: {
                        formatter: (value) => value,
                        color: '#fff',
                        font: { weight: 'bold', family: "'Inter', sans-serif" }
                    }
                }
            }
        });
    },

    addWhatsappContactRow(contact) {
        const list = document.getElementById('whatsapp-contacts-list');
        if (!list) return;
    
        const row = document.createElement('div');
        row.className = 'whatsapp-contact-item flex items-center justify-between gap-2 bg-black/20 p-2 rounded-md text-sm';
        row.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="user-circle" class="w-5 h-5 text-color-primary"></i>
                <span class="font-bold">${contact.name}</span>
                <span class="text-text-muted font-mono">${contact.number}</span>
            </div>
            <button class="remove-whatsapp-contact-btn btn btn-danger btn-sm p-1" data-number="${contact.number}">
                <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
        `;
        list.appendChild(row);
        lucide.createIcons();
    
        row.querySelector('.remove-whatsapp-contact-btn').onclick = (e) => {
            const numberToRemove = e.currentTarget.dataset.number;
            this.state.settings.whatsappContacts = this.state.settings.whatsappContacts.filter(c => c.number !== numberToRemove);
            row.remove();
        };
    },
    
    renderWhatsappContactsList() {
        const list = document.getElementById('whatsapp-contacts-list');
        if (!list) return;
        list.innerHTML = '';
        const contacts = this.state.settings.whatsappContacts || [];
        
        const fragment = document.createDocumentFragment();
        contacts.forEach(contact => {
            const row = document.createElement('div');
            row.className = 'whatsapp-contact-item flex items-center justify-between gap-2 bg-black/20 p-2 rounded-md text-sm';
            row.innerHTML = `
                <div class="flex items-center gap-2">
                    <i data-lucide="user-circle" class="w-5 h-5 text-color-primary"></i>
                    <span class="font-bold">${contact.name}</span>
                    <span class="text-text-muted font-mono">${contact.number}</span>
                </div>
                <button class="remove-whatsapp-contact-btn btn btn-danger btn-sm p-1" data-number="${contact.number}">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            `;
            row.querySelector('.remove-whatsapp-contact-btn').onclick = (e) => {
                const numberToRemove = e.currentTarget.dataset.number;
                this.state.settings.whatsappContacts = this.state.settings.whatsappContacts.filter(c => c.number !== numberToRemove);
                row.remove();
            };
            fragment.appendChild(row);
        });
        list.appendChild(fragment);
        lucide.createIcons();
    },

    showContactSelectionModal(contacts, onSelect) {
        const contentHTML = `
            <div class="space-y-2">
                ${contacts.map(contact => `
                    <button class="btn btn-secondary w-full text-left justify-start contact-select-btn" data-number="${contact.number}">
                        <i data-lucide="send" class="w-5 h-5"></i>
                        <span>${contact.name} - ${contact.number}</span>
                    </button>
                `).join('')}
            </div>
        `;
        this.ui.showModal('Pilih Kontak Laporan', 'Pilih kontak yang ingin Anda hubungi.', contentHTML, {
            footerHTML: `<button id="generic-modal-close-btn" class="btn btn-secondary w-full mt-6">Batal</button>`
        });

        document.querySelectorAll('.contact-select-btn').forEach(btn => {
            btn.onclick = () => {
                const selectedNumber = btn.dataset.number;
                onSelect(selectedNumber);
                this.ui.hideModal();
            };
        });
        lucide.createIcons();
    },

    showTransactionDetailModal(userName, data, isUserLoggedIn) {
        const canEdit = isUserLoggedIn && ['Master', 'Admin'].includes(this.state.currentUser?.role);
        
        const layoutClass = canEdit ? 'layout-can-edit' : 'layout-cannot-edit';

        let headerHTML = `
            <div class="transaction-detail-grid-layout ${layoutClass}">
                ${canEdit ? '<div class="p-2 text-center"><input type="checkbox" id="select-all-modal-checkbox" class="form-input"></div>' : ''}
                <div class="p-2">Tanggal</div>
                <div class="p-2">Nama</div>
                <div class="p-2 text-right">Jumlah</div>
                <div class="p-2">Keterangan</div>
                <div class="p-2 text-center">Aksi</div>
            </div>
        `;

        const totalAmount = data.reduce((sum, row) => sum + (parseFloat(row.jumlah) || 0), 0);

        const contentHTML = `
            <div id="transaction-modal-controls" class="flex justify-between items-center mb-4">
                <div>
                    <h3 class="text-lg font-bold">Transaksi untuk ${userName}</h3>
                    <p id="modal-data-info" class="text-sm text-text-secondary">Menampilkan ${data.length} transaksi.</p>
                </div>
                <div class="flex gap-2">
                     ${canEdit ? `
                        <button id="bulk-edit-modal-btn" class="btn btn-secondary btn-sm hidden items-center gap-1"><i data-lucide="edit" class="w-4 h-4"></i> <span id="bulk-edit-modal-text">Ubah</span></button>
                        <button id="delete-modal-btn" class="btn btn-danger btn-sm hidden items-center gap-1"><i data-lucide="trash-2" class="w-4 h-4"></i> <span id="delete-modal-text">Hapus</span></button>
                    ` : ''}
                </div>
            </div>
            <div class="border border-border-color rounded-lg overflow-hidden">
                <div class="bg-bg-panel sticky top-0 z-10 p-2 font-bold text-xs uppercase border-b border-border-color">
                    ${headerHTML}
                </div>
                <div id="transaction-detail-scroll-container" class="h-[50vh] overflow-y-auto relative">
                    <div id="transaction-detail-scroller" class="relative w-full">
                        <div id="transaction-detail-tbody"></div>
                    </div>
                </div>
                <div class="bg-bg-panel p-2 font-bold text-xs uppercase border-t border-border-color">
                    <div class="transaction-detail-grid-layout ${layoutClass}">
                        ${canEdit ? '<div></div>' : ''}
                        <div class="p-2">TOTAL TRANSAKSI:</div>
                        <div class="p-2"></div>
                        <div class="p-2 text-right text-color-primary text-sm font-display font-bold">${this.utils.formatCurrency(totalAmount)}</div>
                        <div class="p-2"></div>
                        <div class="p-2"></div>
                    </div>
                </div>
            </div>
        `;
    
        this.ui.showModal(`Rincian Transaksi`, ``, contentHTML, {
            size: 'xlarge',
            footerHTML: `<button id="generic-modal-close-btn" class="btn btn-primary w-full mt-6">Tutup</button>`,
            onClose: () => {
                if (this.state.virtualScrollInstances.transactionDetailModal) {
                    this.state.virtualScrollInstances.transactionDetailModal.destroy();
                    delete this.state.virtualScrollInstances.transactionDetailModal;
                }
                this.state.modalSelectedIds.clear();
            }
        });
    
        const renderRowFunction = (row) => {
            const isChecked = this.state.modalSelectedIds.has(row.id);
            const canEditRow = this.state.currentUser && ['Master', 'Admin'].includes(this.state.currentUser.role);
            
            const checkboxHTML = canEditRow ? `<div class="p-2 text-center"><input type="checkbox" class="form-input modal-row-checkbox" data-row-id="${row.id}" ${isChecked ? 'checked' : ''}></div>` : '';
            
            const reportButtonHTML = `<button class="btn btn-secondary btn-sm p-1 report-btn" data-row-id="${row.id}" title="Lapor"><i data-lucide="message-square-warning" class="w-4 h-4 pointer-events-none"></i></button>`;
            const editButtonHTML = canEditRow ? `<button class="btn btn-secondary btn-sm p-1 edit-modal-btn" data-row-id="${row.id}" title="Edit"><i data-lucide="edit" class="w-4 h-4 pointer-events-none"></i></button>` : '';

            return `
                <div class="h-[40px] transaction-detail-grid-layout ${layoutClass} border-b border-border-color/50 hover:bg-color-primary/10">
                    ${checkboxHTML}
                    <div class="p-2 truncate">${new Date(row.tanggal).toLocaleString('id-ID')}</div>
                    <div class="p-2 truncate">${row.nama}</div>
                    <div class="p-2 text-right">${this.utils.formatCurrency(row.jumlah)}</div>
                    <div class="p-2 truncate" title="${row.keterangan}">${row.keterangan}</div>
                    <div class="p-2 text-center flex justify-center gap-1">
                        ${reportButtonHTML}
                        ${editButtonHTML}
                    </div>
                </div>
            `;
        };

        this.state.modalSelectedIds.clear();
        const vsInstance = VirtualScrollManager.create({
            containerEl: document.getElementById('transaction-detail-scroll-container'),
            scrollerEl: document.getElementById('transaction-detail-scroller'),
            contentEl: document.getElementById('transaction-detail-tbody'),
            fullData: data,
            renderRowFunction: renderRowFunction,
            rowHeight: 40, 
            onRenderCallback: () => {
                lucide.createIcons();
            }
        });
        this.state.virtualScrollInstances.transactionDetailModal = vsInstance;
        vsInstance.initialize();

        if (canEdit) {
            document.getElementById('delete-modal-btn').onclick = () => this.handlers.handleDeleteSelectedInModal();
            document.getElementById('bulk-edit-modal-btn').onclick = () => this.handlers.handleBulkEditInModal();
            
            const modalContent = document.getElementById('generic-modal-content');
            if(modalContent) {
                modalContent.addEventListener('change', (e) => this.handlers.handleModalCheckboxChange(e, data));
            }
        }
    }
};
