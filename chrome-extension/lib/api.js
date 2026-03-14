/**
 * Vigil API Client — Chrome Extension
 */

const API_BASE = "https://api.vigil.run/api";

class VigilAPI {
    constructor() {
        this.token = null;
        this.apiKey = null;
    }

    async loadFromStorage() {
        try {
            const data = await chrome.storage.sync.get(["vigil_token", "vigil_api_key"]);
            console.log("[vigil] loadFromStorage:", { hasToken: !!data.vigil_token, hasKey: !!data.vigil_api_key });
            if (data.vigil_api_key) this.apiKey = data.vigil_api_key;
            if (data.vigil_token) this.token = data.vigil_token;
        } catch (e) {
            console.error("[vigil] storage read failed:", e);
        }
    }

    getAuthHeader() {
        if (this.apiKey) return `Bearer ${this.apiKey}`;
        if (this.token) return `Bearer ${this.token}`;
        return null;
    }

    async request(path, options = {}) {
        // Always reload from storage to ensure we have credentials
        await this.loadFromStorage();

        const auth = this.getAuthHeader();
        console.log("[vigil] request", path, { hasAuth: !!auth, apiKey: this.apiKey?.slice(0, 6), token: this.token?.slice(0, 6) });

        if (!auth) throw new Error("Not authenticated");

        const resp = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization": auth,
                ...(options.headers || {}),
            },
        });

        console.log("[vigil] response", path, resp.status);

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
        await chrome.storage.sync.set({ vigil_token: data.token });
        console.log("[vigil] login success, token saved");
        return data;
    }

    async loginWithApiKey(apiKey) {
        this.apiKey = apiKey;
        console.log("[vigil] loginWithApiKey: set apiKey on instance");
        try {
            await this.request("/auth/me");
            await chrome.storage.sync.set({ vigil_api_key: apiKey });
            console.log("[vigil] loginWithApiKey: saved to storage");
            return true;
        } catch (e) {
            console.error("[vigil] loginWithApiKey failed:", e);
            this.apiKey = null;
            throw new Error("Invalid API key");
        }
    }

    async isAuthenticated() {
        await this.loadFromStorage();
        if (!this.getAuthHeader()) {
            console.log("[vigil] isAuthenticated: no credentials");
            return false;
        }
        try {
            await this.request("/auth/me");
            console.log("[vigil] isAuthenticated: verified");
            return true;
        } catch (e) {
            console.log("[vigil] isAuthenticated: verification failed", e);
            return false;
        }
    }

    async logout() {
        this.token = null;
        this.apiKey = null;
        await chrome.storage.sync.remove(["vigil_token", "vigil_api_key"]);
    }

    // Watchers
    async getWatchers() {
        console.log("[vigil] getWatchers called");
        const data = await this.request("/watchers");
        console.log("[vigil] getWatchers response:", data);
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
