/**
 * Vigil API Client — Chrome Extension
 * 
 * Auth is held in memory for the active session.
 * chrome.storage.local is used only to persist across panel reloads.
 */

const API_BASE = "https://api.vigil.run/api";

// Module-level credential store — survives across all calls in this page context
let _apiKey = null;
let _token = null;

class VigilAPI {

    async _restoreFromStorage() {
        // Restore from both local and sync (migration)
        try {
            const local = await chrome.storage.local.get(["vigil_token", "vigil_api_key"]);
            const sync = await chrome.storage.sync.get(["vigil_token", "vigil_api_key"]);
            _apiKey = local.vigil_api_key || sync.vigil_api_key || null;
            _token = local.vigil_token || sync.vigil_token || null;
            console.log("[vigil] restored from storage:", { hasKey: !!_apiKey, hasToken: !!_token });
        } catch (e) {
            console.warn("[vigil] storage restore failed:", e);
        }
    }

    _getAuthHeader() {
        if (_apiKey) return `Bearer ${_apiKey}`;
        if (_token) return `Bearer ${_token}`;
        return null;
    }

    async request(path, options = {}) {
        const auth = this._getAuthHeader();
        console.log("[vigil] request", path, { hasAuth: !!auth, keyPrefix: _apiKey?.slice(0,6), tokenPrefix: _token?.slice(0,10) });
        if (!auth) throw new Error("Not authenticated");

        const url = `${API_BASE}${path}`;
        console.log("[vigil] fetching:", url);

        let resp;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            resp = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": auth,
                    ...(options.headers || {}),
                },
            });

            clearTimeout(timeout);
        } catch (fetchErr) {
            console.error("[vigil] fetch error:", fetchErr.name, fetchErr.message);
            throw new Error(`Network error: ${fetchErr.message}`);
        }

        console.log("[vigil] response", path, resp.status, resp.statusText);

        if (!resp.ok) {
            const body = await resp.text();
            console.error("[vigil] error body:", body);
            let msg;
            try { msg = JSON.parse(body).error; } catch { msg = body || resp.statusText; }
            throw new Error(msg || `API error ${resp.status}`);
        }

        const data = await resp.json();
        console.log("[vigil] parsed response", path, typeof data);
        return data;
    }

    // Auth — email/password
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
        console.log("[vigil] login response keys:", Object.keys(data));
        // Backend returns { tokens: { access_token, refresh_token }, user: {...} }
        const accessToken = data.tokens?.access_token || data.access_token || data.token;
        if (!accessToken) {
            console.error("[vigil] no token in login response:", data);
            throw new Error("Login succeeded but no token returned");
        }
        _token = accessToken;
        console.log("[vigil] login OK, token set in memory:", _token.slice(0, 15) + "...");
        chrome.storage.local.set({ vigil_token: accessToken });
        return data;
    }

    // Auth — API key
    async loginWithApiKey(apiKey) {
        _apiKey = apiKey;
        console.log("[vigil] apiKey set in memory, verifying...");
        try {
            const me = await this.request("/auth/me");
            console.log("[vigil] apiKey verified:", me);
            chrome.storage.local.set({ vigil_api_key: apiKey }); // fire-and-forget
            return true;
        } catch (e) {
            console.error("[vigil] apiKey verification failed:", e);
            _apiKey = null;
            throw new Error("Invalid API key");
        }
    }

    // Check if we have valid credentials
    async isAuthenticated() {
        // Try restoring from storage first
        if (!this._getAuthHeader()) {
            await this._restoreFromStorage();
        }
        if (!this._getAuthHeader()) {
            console.log("[vigil] isAuthenticated: no credentials anywhere");
            return false;
        }
        try {
            await this.request("/auth/me");
            return true;
        } catch {
            return false;
        }
    }

    async logout() {
        _apiKey = null;
        _token = null;
        await chrome.storage.local.remove(["vigil_token", "vigil_api_key"]);
    }

    // Watchers
    async getWatchers() {
        console.log("[vigil] getWatchers...");
        const data = await this.request("/watchers");
        const list = data.watchers || [];
        console.log("[vigil] getWatchers:", list.length, "watchers");
        return list;
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

    // Forwarding
    async getConfirmCode(watcherId) {
        return this.request(`/forwarding/confirm-code/${watcherId}`);
    }

    async getForwardingStatus(watcherId) {
        return this.request(`/forwarding/status/${watcherId}`);
    }
}

const vigilAPI = new VigilAPI();
