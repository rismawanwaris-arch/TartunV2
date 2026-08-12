const AppAuth = {
    async check() {
        const token = localStorage.getItem('fkof_token');
        if (!token) return null;
        try {
            const profile = await this.api.getProfile();
            return profile;
        } catch (e) {
            localStorage.removeItem('fkof_token');
            localStorage.removeItem('fkof_session_id');
            return null;
        }
    },

    async handleAuthStateChange(event, session) {
        if (this.state.isProcessingAuthChange) {
            return;
        }
        this.state.isProcessingAuthChange = true;

        const user = session?.user;
        const logPanel = document.getElementById('public-log-panel');
        const viewAllLogsBtn = document.getElementById('view-all-logs-btn');

        if (!this.state.isInitialAuthCheckComplete) {
            this.ui.showLoader('Mengautentikasi sesi...');
        }

        try {
            if (user) {
                let profile = await this.api.getProfile(user.id);
                const localSessionId = localStorage.getItem('fkof_session_id');

                if (localSessionId && profile.session_id !== localSessionId) {
                    localStorage.removeItem('fkof_token');
                    localStorage.removeItem('fkof_session_id');
                    this.ui.showModal(
                        "Sesi Berakhir", 
                        "Anda telah dikeluarkan karena akun ini login di perangkat lain. Hanya satu sesi yang diizinkan pada satu waktu.",
                        '',
                        { onClose: () => location.reload() }
                    );
                    this.ui.hideLoader();
                    this.state.isProcessingAuthChange = false;
                    return;
                }

                if (profile && profile.is_active === false) {
                    localStorage.removeItem('fkof_token');
                    localStorage.removeItem('fkof_session_id');
                    this.ui.showModal("Login Gagal", "Akun Anda telah dinonaktifkan. Silakan hubungi admin.");
                    this.ui.hideLoader();
                    this.ui.revealApp();
                    this.state.isProcessingAuthChange = false;
                    return;
                }
                
                this.state.currentUser = {
                    id: user.id,
                    email: user.email,
                    role: profile.role,
                    dashboardConfig: profile.dashboard_config ? JSON.parse(profile.dashboard_config) : null
                };
                this.state.filterPresets = Array.isArray(profile.filter_presets) ? profile.filter_presets : 
                                           (typeof profile.filter_presets === 'string' ? JSON.parse(profile.filter_presets) : []);
            } else {
                this.state.currentUser = null;
                this.state.filterPresets = [];
                localStorage.removeItem('fkof_session_id');
                localStorage.removeItem('fkof_token');
            }

            const isLoggingIn = user && (!this.state.currentUser || this.state.currentUser.id !== user.id);

            if (!this.state.isInitialAuthCheckComplete) {
                await this.settings.load();
                if (this.state.currentUser) {
                    await this.handlers.fetchInitialData();
                    this.handlers.setupDataListeners();
                }
                await this.handlers.listenToLogChanges();
            } else {
                await this.settings.load();
                if (isLoggingIn) {
                    this.ui.showLoader('Memuat data...');
                    await this.handlers.fetchInitialData();
                    this.handlers.setupDataListeners();
                    this.ui.hideLoader();
                }
            }

            this.ui.applySettings(false);
            await this.ui.updateMenuVisibility(); 

            this.handlers.setupFilterPresets();

            if (logPanel && viewAllLogsBtn) {
                const canViewLogs = this.state.currentUser && ['Master', 'Admin'].includes(this.state.currentUser.role);
                logPanel.classList.toggle('cursor-pointer', canViewLogs);
                logPanel.classList.toggle('hover:bg-cyan-500/10', canViewLogs);
                viewAllLogsBtn.classList.toggle('hidden', !canViewLogs);
                logPanel.onclick = canViewLogs ? this.handlers.showFullLogModal : null;
            }

        } catch (e) {
            console.error("Auth state change error:", e);
            this.ui.showModal("Error Otentikasi", e.message);
        } finally {
            if (!this.state.isInitialAuthCheckComplete) {
                this.state.isInitialAuthCheckComplete = true;
                this.ui.revealApp();
            }
            this.state.isProcessingAuthChange = false;
        }
    },

    async login(email, password) {
        this.ui.hideLoginModal();
        this.ui.showLoader('Mencoba login...');
        this.dom.loginError.textContent = '';
        
        try {
            const data = await this.api.req('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            localStorage.setItem('fkof_token', data.token);
            localStorage.setItem('fkof_session_id', data.session_id);
            this.ui.hideLoader();
            await this.handleAuthStateChange('SIGNED_IN', { user: data.user });
        } catch (error) {
            this.ui.hideLoader();
            this.ui.showLoginModal();
            this.dom.loginError.textContent = "Email atau password salah.";
        }
    },

    async logout() {
        this.ui.showLoader('Logout...');
        if (this.state.sessionCheckInterval) {
            clearInterval(this.state.sessionCheckInterval);
            this.state.sessionCheckInterval = null;
        }
        if (this.state.currentUser) {
            try {
                await this.api.req('/auth/logout', { method: 'POST' });
            } catch (e) {
                console.error("Gagal menghapus session_id saat logout:", e);
            }
        }
        localStorage.removeItem('fkof_session_id');
        localStorage.removeItem('fkof_token');
        
        this.state.activeView = 'dashboard';
        await this.handleAuthStateChange('SIGNED_OUT', null);
        this.ui.hideLoader();
        location.reload();
    }
};
