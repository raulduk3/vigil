/**
 * Vigil API Client — Chrome Extension
 */

const API_BASE = "https://api.vigil.run/api";

class VigilAPI {
    constructor() {
        this.token = null;
        this.apiKey = null;
        this._initialized = false;
    }

    async init() {
        if (this._initialized) return;
        const data = await chrome.storage.sync.get(["vigil_token", "vigil_api_key"]);
        this.token = data.vigil_token || null;
        this.apiKey = data.vigil_api_key || null;
        this._initialized = true;
    }

    getAuthHeader() {
        if (this.apiKey) return `Bearer ${this.apiKey}`;
        if (this.token) return `Bearer ${this.token}`;
        return null;
    }

    async request(path, options = {}) {
        // Always ensure we've loaded credentials from storage
        await this.init();

        const auth = this.getAuthHeader();
        if (!auth) throw new Error("Not authenticated");

        const resp = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization": auth,
                ...options.headers,
            },
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: resp.statusText }));
            throw new Error(err.error || `API error ${resp.status}`);
        }

        return resp.json();
    }

    // Auth
    async login(email, password) {
        const resp = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || "Login failed");
        }
        const data = await resp.json();
        this.token = data.token;
        this._initialized = true;
        await chrome.storage.sync.set({ vigil_token: data.token });
        return data;
    }

    async loginWithApiKey(apiKey) {
        this.apiKey = apiKey;
        this._initialized = true;
        // Verify the key works
        try {
            await this.request("/auth/me");
            await chrome.storage.sync.set({ vigil_api_key: apiKey });
            return true;
        } catch {
            this.apiKey = null;
            throw new Error("Invalid API key");
        }
    }

    async isAuthenticated() {
        this._initialized = false; // Force reload from storage
        await this.init();
        if (!this.getAuthHeader()) return false;
        try {
            await this.request("/auth/me");
            return true;
        } catch {
            return false;
        }
    }

    async logout() {
        this.token = null;
        this.apiKey = null;
        this._initialized = false;
        await chrome.storage.sync.remove(["vigil_token", "vigil_api_key"]);
    }

    // Watchers
    async getWatchers() {
        const data = await this.request("/watchers");
        return data.watchers || [];
    }

    async createWatcher(name, systemPrompt, template) {
        const data = await this.request("/watchers", {
            method: "POST",
            body: JSON.stringify({
                name,
                system_prompt: systemPrompt,
                template_id: template || "general",
            }),
        });
        return data.watcher || data;
    }

    // Forwarding
    async getConfirmCode(watcherId) {
        return this.request(`/forwarding/confirm-code/${watcherId}`);
    }

    async getForwardingStatus(watcherId) {
        return this.request(`/forwarding/status/${watcherId}`);
    }
}

// Export singleton
const vigilAPI = new VigilAPI();
