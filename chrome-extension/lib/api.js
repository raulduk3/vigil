/**
 * Vigil API Client — Chrome Extension
 */

const API_BASE = "https://api.vigil.run/api";
let _apiKey = null;
let _token = null;

const vigilAPI = {
    // ---- Auth ----
    async _restoreFromStorage() {
        try {
            const data = await chrome.storage.local.get(["vigil_token", "vigil_api_key"]);
            if (data.vigil_api_key) _apiKey = data.vigil_api_key;
            if (data.vigil_token) _token = data.vigil_token;
        } catch (e) { /* ignore */ }
    },

    _getAuth() {
        if (_apiKey) return `Bearer ${_apiKey}`;
        if (_token) return `Bearer ${_token}`;
        return null;
    },

    async _fetch(path, opts = {}) {
        if (!this._getAuth()) await this._restoreFromStorage();
        const auth = this._getAuth();
        if (!auth) throw new Error("Not authenticated");

        const r = await fetch(`${API_BASE}${path}`, {
            ...opts,
            headers: { "Content-Type": "application/json", "Authorization": auth, ...(opts.headers || {}) },
        });
        if (!r.ok) {
            const body = await r.text().catch(() => "");
            let msg;
            try { msg = JSON.parse(body).error; } catch { msg = body || r.statusText; }
            throw new Error(msg || `Error ${r.status}`);
        }
        return r.json();
    },

    async login(email, password) {
        const r = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Login failed"); }
        const data = await r.json();
        _token = data.tokens?.access_token || data.token;
        if (!_token) throw new Error("No token in response");
        chrome.storage.local.set({ vigil_token: _token });
        return data;
    },

    async loginWithApiKey(key) {
        _apiKey = key;
        try {
            await this._fetch("/auth/me");
            chrome.storage.local.set({ vigil_api_key: key });
        } catch (e) { _apiKey = null; throw new Error("Invalid API key"); }
    },

    async isAuthenticated() {
        await this._restoreFromStorage();
        if (!this._getAuth()) return false;
        try { await this._fetch("/auth/me"); return true; } catch { return false; }
    },

    async logout() {
        _apiKey = null; _token = null;
        await chrome.storage.local.remove(["vigil_token", "vigil_api_key"]);
    },

    // ---- Data ----
    async getWatchers() { return (await this._fetch("/watchers")).watchers || []; },
    async createWatcher(name, systemPrompt, model) {
        const d = await this._fetch("/watchers", { method: "POST", body: JSON.stringify({ name, system_prompt: systemPrompt, model: model || "gpt-4.1-mini" }) });
        return d.watcher || d;
    },
    async getWatcher(id) { return (await this._fetch(`/watchers/${id}`)).watcher; },
    async updateWatcher(id, u) { return (await this._fetch(`/watchers/${id}`, { method: "PATCH", body: JSON.stringify(u) })).watcher; },
    async getThreads(id) { const d = await this._fetch(`/watchers/${id}/threads?limit=50`); return d.threads || d || []; },
    async getMemories(id) { const d = await this._fetch(`/watchers/${id}/memory`); return d.memories || d || []; },
    async getActions(id) { const d = await this._fetch(`/watchers/${id}/actions?limit=20`); return d.actions || d || []; },
    async getUsage() { return (await this._fetch("/usage")).usage; },
    async getForwardingStatus(id) { return this._fetch(`/forwarding/status/${id}`); },
    async chat(id, message) { const d = await this._fetch(`/watchers/${id}/invoke`, { method: "POST", body: JSON.stringify({ message }) }); return d.message || "No response."; },
};
