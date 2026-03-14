/**
 * Vigil API Client — Chrome Extension
 */

const DEFAULT_API_BASE = "https://api.vigil.run/api";
const FALLBACK_API_BASES = [
    DEFAULT_API_BASE,
    "http://localhost:3001/api",
    "http://127.0.0.1:3001/api",
];

let _apiKey = null;
let _token = null;
let _apiBase = DEFAULT_API_BASE;

class VigilAPI {
    _normalizeApiBase(apiBase) {
        if (!apiBase || typeof apiBase !== "string") return DEFAULT_API_BASE;
        return apiBase.replace(/\/$/, "");
    }

    _getCandidateBases() {
        return [...new Set([
            this._normalizeApiBase(_apiBase),
            ...FALLBACK_API_BASES.map((base) => this._normalizeApiBase(base)),
        ])];
    }

    async _restoreFromStorage() {
        try {
            const local = await chrome.storage.local.get(["vigil_token", "vigil_api_key", "vigil_api_base"]);
            const sync = await chrome.storage.sync.get(["vigil_token", "vigil_api_key", "vigil_api_base"]);

            _apiKey = local.vigil_api_key || sync.vigil_api_key || null;
            _token = local.vigil_token || sync.vigil_token || null;
            _apiBase = this._normalizeApiBase(local.vigil_api_base || sync.vigil_api_base || DEFAULT_API_BASE);

            if (sync.vigil_token || sync.vigil_api_key || sync.vigil_api_base) {
                await chrome.storage.local.set({
                    ...(sync.vigil_token ? { vigil_token: sync.vigil_token } : {}),
                    ...(sync.vigil_api_key ? { vigil_api_key: sync.vigil_api_key } : {}),
                    ...(sync.vigil_api_base ? { vigil_api_base: this._normalizeApiBase(sync.vigil_api_base) } : {}),
                });
                await chrome.storage.sync.remove(["vigil_token", "vigil_api_key", "vigil_api_base"]);
            }
        } catch (error) {
            console.warn("[vigil] storage restore failed:", error);
        }
    }

    async _persistAuth() {
        const payload = { vigil_api_base: this._normalizeApiBase(_apiBase) };
        if (typeof _apiKey === "string") payload.vigil_api_key = _apiKey;
        if (typeof _token === "string") payload.vigil_token = _token;

        await chrome.storage.local.set(payload);

        const keysToRemove = [];
        if (!_apiKey) keysToRemove.push("vigil_api_key");
        if (!_token) keysToRemove.push("vigil_token");
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    }

    async setApiBase(apiBase) {
        _apiBase = this._normalizeApiBase(apiBase);
        await chrome.storage.local.set({ vigil_api_base: _apiBase });
    }

    getApiBase() {
        return this._normalizeApiBase(_apiBase);
    }

    _getAuthHeader() {
        if (_apiKey) return `Bearer ${_apiKey}`;
        if (_token) return `Bearer ${_token}`;
        return null;
    }

    async _fetchWithCandidateBases(path, options = {}) {
        const candidates = this._getCandidateBases();
        let lastError = null;

        for (const base of candidates) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(`${base}${path}`, {
                    ...options,
                    signal: controller.signal,
                });

                _apiBase = base;
                await chrome.storage.local.set({ vigil_api_base: _apiBase });
                return { response, base };
            } catch (error) {
                if (error.name === "AbortError") {
                    lastError = error;
                    break;
                }
                lastError = error;
            } finally {
                clearTimeout(timeout);
            }
        }

        throw lastError || new Error("Network error");
    }

    async request(path, options = {}) {
        const auth = this._getAuthHeader();
        if (!auth) throw new Error("Not authenticated");

        let response;
        try {
            const result = await this._fetchWithCandidateBases(path, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": auth,
                    ...(options.headers || {}),
                },
            });
            response = result.response;
        } catch (error) {
            throw new Error(`Network error: ${error.message}`);
        }

        if (!response.ok) {
            const body = await response.text();
            let message;
            try {
                message = JSON.parse(body).error;
            } catch {
                message = body || response.statusText;
            }

            const error = new Error(message || `API error ${response.status}`);
            error.status = response.status;
            throw error;
        }

        if (response.status === 204) {
            return null;
        }

        return response.json();
    }

    async login(email, password) {
        const { response } = await this._fetchWithCandidateBases("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || "Login failed");
        }

        const data = await response.json();
        const accessToken = data.tokens?.access_token || data.access_token || data.token;
        if (!accessToken) {
            throw new Error("Login succeeded but no token returned");
        }

        _apiKey = null;
        _token = accessToken;
        await this._persistAuth();
        return data;
    }

    async loginWithApiKey(apiKey) {
        _apiKey = apiKey;
        _token = null;

        try {
            await this.request("/auth/me");
            await this._persistAuth();
            return true;
        } catch {
            _apiKey = null;
            throw new Error("Invalid API key");
        }
    }

    async isAuthenticated() {
        if (!this._getAuthHeader()) {
            await this._restoreFromStorage();
        }
        if (!this._getAuthHeader()) {
            return false;
        }

        try {
            await this.request("/auth/me");
            return true;
        } catch (error) {
            if (error.status === 401) {
                await this.logout({ preserveApiBase: true });
            }
            return false;
        }
    }

    async logout(options = {}) {
        _apiKey = null;
        _token = null;

        const keys = ["vigil_token", "vigil_api_key"];
        if (!options.preserveApiBase) {
            keys.push("vigil_api_base");
            _apiBase = DEFAULT_API_BASE;
        }

        await chrome.storage.local.remove(keys);
    }

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

    async chat(watcherId, message) {
        const data = await this.request(`/watchers/${watcherId}/invoke`, {
            method: "POST",
            body: JSON.stringify({ message }),
        });
        return data.message || data.chat_response || "No response.";
    }

    async getThreads(watcherId) {
        const data = await this.request(`/watchers/${watcherId}/threads`);
        return data.threads || data || [];
    }

    async getMemories(watcherId) {
        const data = await this.request(`/watchers/${watcherId}/memory`);
        return data.memories || data || [];
    }

    async getActions(watcherId) {
        const data = await this.request(`/watchers/${watcherId}/actions`);
        return data.actions || data || [];
    }

    async updateWatcher(watcherId, updates) {
        const data = await this.request(`/watchers/${watcherId}`, {
            method: "PATCH",
            body: JSON.stringify(updates),
        });
        return data.watcher || data;
    }

    async getUsage() {
        return this.request("/usage");
    }

    async getWatcher(watcherId) {
        const data = await this.request(`/watchers/${watcherId}`);
        return data.watcher || data;
    }

    async getConfirmCode(watcherId) {
        return this.request(`/forwarding/confirm-code/${watcherId}`);
    }

    async getForwardingStatus(watcherId) {
        return this.request(`/forwarding/status/${watcherId}`);
    }
}

const vigilAPI = new VigilAPI();