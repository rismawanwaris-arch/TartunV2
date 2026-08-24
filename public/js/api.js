const API_URL = '/api';

const AppAPI = {
    async req(endpoint, options = {}) {
        const token = localStorage.getItem('fkof_token');
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

        try {
            const res = await fetch(`${API_URL}${endpoint}`, { 
                ...options, 
                headers,
                signal: controller.signal 
            });
            clearTimeout(timeoutId);
            
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401 && !endpoint.includes('login')) {
                    if (localStorage.getItem('fkof_token')) {
                        this.auth.logout();
                    }
                }
                throw new Error(data.error || 'API Error');
            }
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Koneksi timeout. Server tidak merespon dalam 30 detik.');
            }
            throw error;
        }
    },

    async fetchAllData() {
        let allData = [];
        let page = 1;
        const limit = 1000;

        while (true) {
            const res = await this.api.req(`/transactions?page=${page}&limit=${limit}`);
            if (res.data && res.data.length > 0) {
                allData = allData.concat(res.data);
            }
            if (!res.data || res.data.length < limit) {
                break;
            }
            page++;
        }

        return allData;
    },

    async addDataBatch(batch) {
        await this.api.req('/transactions/bulk', {
            method: 'POST',
            body: JSON.stringify({ rows: batch })
        });
    },

    async updateData(id, updates) {
        await this.api.req('/transactions/bulk-update', {
            method: 'PUT',
            body: JSON.stringify({ updates: [{ id, data: updates }] })
        });
    },

    async updateDataBatch(updates) {
        return await this.api.req('/transactions/bulk-update', {
            method: 'PUT',
            body: JSON.stringify({ updates: updates })
        });
    },

    async deleteDataBatch(ids) {
        const res = await this.api.req('/transactions/delete-bulk', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
        return res.count;
    },

    async deleteDataByBatchId(batchId) {
        const res = await this.api.req(`/transactions/batch/${batchId}`, {
            method: 'DELETE'
        });
        return res.deleted;
    },

    async deleteDataByDateRange(startDate, endDate) {
        const res = await this.api.req(`/transactions/range?start=${startDate.toISOString()}&end=${endDate.toISOString()}`, {
            method: 'DELETE'
        });
        return res.deleted;
    },

    async getProfile(userId) {
        return await this.api.req('/auth/me');
    },

    async getAllProfiles() {
        return await this.api.req('/users');
    },

    async updateUserRole(userId, newRole) {
        await this.api.req(`/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });
    },

    async updateUserStatus(userId, newStatus) {
        await this.api.req(`/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: newStatus ? 1 : 0 })
        });
    },

    async updateUserSession(userId, sessionId) {
        try {
            await this.api.req('/auth/check-session', {
                method: 'POST',
                body: JSON.stringify({ session_id: sessionId })
            });
        } catch (e) {
            // Ignore error here to prevent logout loop on init
        }
    },

    async updateUserDashboardConfig(userId, config) {
        await this.api.req('/users/me/dashboard-config', {
            method: 'PUT',
            body: JSON.stringify({ config })
        });
    },
    
    async updateUserFilterPresets(userId, presets) {
        await this.api.req('/users/me/filter-presets', {
            method: 'PUT',
            body: JSON.stringify({ presets })
        });
    },

    async uploadAvatar(userId, file) {
        const formData = new FormData();
        formData.append('avatar', file);

        const token = localStorage.getItem('fkof_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/users/me/avatar', {
            method: 'PUT',
            headers,
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data.url;
    },

    async updateProfileAvatar(userId, avatarUrl) {
        return true;
    },

    async logAction(action, details = {}) {
        try {
            console.log(`[LOG] Action: ${action}`, details);
        } catch (e) {
            console.error('Gagal mencatat log:', e);
        }
    }
};
