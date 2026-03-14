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
        if (_apiKey) return `Bearer ${_apiKey}`;
        if (_token) return `Bearer ${_token}`;
            const DEFAULT_API_BASE = "https://api.vigil.run/api";
            const FALLBACK_API_BASES = [
                DEFAULT_API_BASE,
                "http://localhost:3001/api",
                "http://127.0.0.1:3001/api",
            ];
    }
    async request(path, options = {}) {
        const auth = this._getAuthHeader();
            let _apiBase = DEFAULT_API_BASE;
        console.log("[vigil] request", path, { hasAuth: !!auth, keyPrefix: _apiKey?.slice(0,6), tokenPrefix: _token?.slice(0,10) });
        if (!auth) throw new Error("Not authenticated");
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


        console.log("[vigil] fetching:", url);
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

            resp = await fetch(url, {
                ...options,
                signal: controller.signal,

                async _persistAuth() {
                    await chrome.storage.local.set({
                        ...(typeof _apiKey === "string" ? { vigil_api_key: _apiKey } : {}),
                        ...(typeof _token === "string" ? { vigil_token: _token } : {}),
                        vigil_api_base: this._normalizeApiBase(_apiBase),
                    });
                }

                async setApiBase(apiBase) {
                    _apiBase = this._normalizeApiBase(apiBase);
                    await chrome.storage.local.set({ vigil_api_base: _apiBase });
                }

                getApiBase() {
                    return this._normalizeApiBase(_apiBase);
                }
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": auth,
                    ...(options.headers || {}),
                },
            });

                async _fetchWithCandidateBases(path, options = {}) {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);
                    const candidates = this._getCandidateBases();
                    let lastError = null;

                    try {
                        for (const base of candidates) {
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
                                    throw error;
                                }
                                lastError = error;
                            }
                        }
                    } finally {
                        clearTimeout(timeout);
                    }

                    throw lastError || new Error("Network error");
                }

            clearTimeout(timeout);
        } catch (fetchErr) {
            throw new Error(`Network error: ${fetchErr.message}`);
        }
        if (!resp.ok) {
            const body = await resp.text();
                        const result = await this._fetchWithCandidateBases(path, {
        }
        const data = await resp.json();
        console.log("[vigil] parsed response", path, typeof data);
        return data;
    }

    // Auth — email/password
                        resp = result.response;
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
            throw new Error(err.error || "Login failed");
        }
        const data = await resp.json();
        // Backend returns { tokens: { access_token, refresh_token }, user: {...} }
        const accessToken = data.tokens?.access_token || data.access_token || data.token;
                        const error = new Error(msg || `API error ${resp.status}`);
                        error.status = resp.status;
                        throw error;
            console.error("[vigil] no token in login response:", data);
            throw new Error("Login succeeded but no token returned");
                    if (resp.status === 204) {
                        return null;
                    }

                    return resp.json();
        chrome.storage.local.set({ vigil_token: accessToken });
        return data;

                    const { response: resp } = await this._fetchWithCandidateBases("/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password }),
                    });

            const me = await this.request("/auth/me");
            console.log("[vigil] apiKey verified:", me);
            chrome.storage.local.set({ vigil_api_key: apiKey }); // fire-and-forget
            return true;

        } catch (e) {
            throw new Error("Invalid API key");
        }

    // Check if we have valid credentials

                    _apiKey = null;
    async isAuthenticated() {
                    await this._persistAuth();
            await this._restoreFromStorage();
        }
        if (!this._getAuthHeader()) {
            return false;
        }
                    _token = null;
            await this.request("/auth/me");
                        await this.request("/auth/me");
                        await this._persistAuth();
        }
    }
    async logout() {
        _apiKey = null;
        _token = null;
        await chrome.storage.local.remove(["vigil_token", "vigil_api_key"]);
    }
    // Watchers
        console.log("[vigil] getWatchers...");
        const data = await this.request("/watchers");
        const list = data.watchers || [];
        console.log("[vigil] getWatchers:", list.length, "watchers");
    }

    async createWatcher(name, systemPrompt, template) {
        const data = await this.request("/watchers", {
            method: "POST",
                    } catch (error) {
                        if (error.status === 401) {
                            await this.logout({ preserveApiBase: true });
                        }
                name,
                system_prompt: systemPrompt,
                template_id: template || "general",
            }),
                async logout(options = {}) {
        return data.watcher || data;
    }
                    const keys = ["vigil_token", "vigil_api_key"];
                    if (!options.preserveApiBase) {
                        keys.push("vigil_api_base");
                        _apiBase = DEFAULT_API_BASE;
                    }
                    await chrome.storage.local.remove(keys);
    async chat(watcherId, message) {
        const data = await this.request(`/watchers/${watcherId}/invoke`, {
            body: JSON.stringify({ message }),
        return data.message || data.chat_response || "No response.";
                    return data.watchers || [];
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
