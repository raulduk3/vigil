/**
 * Side Panel — Watcher dashboard with chat, inbox, stats, and setup.
 */

let currentWatcher = null;
let watchers = [];
let chatHistory = [];

// ============================================================================
// View Management
// ============================================================================

function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${name}`)?.classList.add("active");
    document.querySelectorAll(".nav-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.view === name);
    });

    if (name === "inbox") loadInbox();
    if (name === "stats") loadStats();
    if (name === "setup") loadSetup();
}

function showDashboard() {
    document.getElementById("view-auth").classList.remove("active");
    document.getElementById("header-controls").classList.remove("hidden");
    document.getElementById("nav-tabs").classList.remove("hidden");
    showView("chat");
}

// ============================================================================
// Init
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    console.log("[vigil] panel loaded");

    // Nav tabs
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.addEventListener("click", () => showView(tab.dataset.view));
    });

    // Auth check
    let authed = false;
    try {
        authed = await vigilAPI.isAuthenticated();
        console.log("[vigil] authed:", authed);
    } catch (e) {
        console.error("[vigil] auth check failed:", e);
    }
    if (authed) {
        await loadWatchers();
        showDashboard();
        return;
    }

    // API Key connect
    document.getElementById("panel-btn-connect").addEventListener("click", async () => {
        const key = document.getElementById("panel-api-key").value.trim();
        if (!key) return;
        const err = document.getElementById("panel-auth-error");
        err.classList.add("hidden");
        try {
            await vigilAPI.loginWithApiKey(key);
            await loadWatchers();
            showDashboard();
        } catch (e) {
            err.textContent = e.message;
            err.classList.remove("hidden");
        }
    });

    // Email login
    document.getElementById("panel-btn-login").addEventListener("click", async () => {
        const email = document.getElementById("panel-email").value.trim();
        const password = document.getElementById("panel-password").value;
        if (!email || !password) return;
        const err = document.getElementById("panel-auth-error");
        err.classList.add("hidden");
        try {
            await vigilAPI.login(email, password);
            await loadWatchers();
            showDashboard();
        } catch (e) {
            err.textContent = e.message;
            err.classList.remove("hidden");
        }
    });

    // Enter keys
    document.getElementById("panel-api-key").addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("panel-btn-connect").click();
    });
    document.getElementById("panel-password").addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("panel-btn-login").click();
    });

    // Chat input
    const chatInput = document.getElementById("chat-input");
    const btnSend = document.getElementById("btn-send");

    chatInput.addEventListener("input", () => {
        btnSend.disabled = !chatInput.value.trim();
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    });

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (chatInput.value.trim()) sendChat();
        }
    });

    btnSend.addEventListener("click", sendChat);

    // Chat suggestions
    document.querySelectorAll(".chat-suggestion").forEach(btn => {
        btn.addEventListener("click", () => {
            chatInput.value = btn.dataset.msg;
            btnSend.disabled = false;
            sendChat();
        });
    });

    // Settings button
    document.getElementById("btn-settings").addEventListener("click", () => {
        showView("setup");
    });

    // Watcher dropdown
    document.getElementById("watcher-select").addEventListener("change", (e) => {
        const w = watchers.find(w => w.id === e.target.value);
        if (w) {
            currentWatcher = w;
            chatHistory = [];
            renderChat();
        }
    });

    // Copy setup address
    document.getElementById("btn-copy-setup-address").addEventListener("click", () => {
        const addr = document.getElementById("setup-address").textContent;
        navigator.clipboard.writeText(addr);
        document.getElementById("btn-copy-setup-address").textContent = "Copied";
        setTimeout(() => document.getElementById("btn-copy-setup-address").textContent = "Copy", 2000);
    });
});

// ============================================================================
// Watchers
// ============================================================================

async function loadWatchers() {
    try {
        watchers = await vigilAPI.getWatchers();
        const select = document.getElementById("watcher-select");
        select.innerHTML = "";
        for (const w of watchers) {
            const opt = document.createElement("option");
            opt.value = w.id;
            opt.textContent = `${w.name} (${w.total_emails || 0})`;
            select.appendChild(opt);
        }
        if (watchers.length > 0) {
            currentWatcher = watchers[0];
        }
    } catch (e) {
        console.error("[vigil] loadWatchers failed:", e);
    }
}

// ============================================================================
// Chat
// ============================================================================

function renderChat() {
    const container = document.getElementById("chat-messages");
    if (chatHistory.length === 0) {
        container.innerHTML = `
            <div class="chat-welcome">
                <p class="chat-welcome-title">Talk to ${escapeHtml(currentWatcher?.name || "your watcher")}</p>
                <p class="chat-welcome-desc">Ask about your inbox, set rules, check obligations, or tell it what to focus on.</p>
                <div class="chat-suggestions">
                    <button class="chat-suggestion" data-msg="What needs my attention today?">What needs my attention?</button>
                    <button class="chat-suggestion" data-msg="Summarize my inbox this week">Summarize this week</button>
                    <button class="chat-suggestion" data-msg="What deadlines are coming up?">Upcoming deadlines</button>
                    <button class="chat-suggestion" data-msg="Ignore all emails from noreply addresses">Ignore noreply senders</button>
                </div>
            </div>
        `;
        container.querySelectorAll(".chat-suggestion").forEach(btn => {
            btn.addEventListener("click", () => {
                document.getElementById("chat-input").value = btn.dataset.msg;
                document.getElementById("btn-send").disabled = false;
                sendChat();
            });
        });
        return;
    }

    container.innerHTML = chatHistory.map(msg => `
        <div class="chat-msg chat-msg-${msg.role}">
            <div class="chat-msg-label">${msg.role === "user" ? "You" : currentWatcher?.name || "Vigil"}</div>
            <div class="chat-msg-body">${escapeHtml(msg.text)}</div>
        </div>
    `).join("");
    container.scrollTop = container.scrollHeight;
}

async function sendChat() {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg || !currentWatcher) return;

    input.value = "";
    input.style.height = "auto";
    document.getElementById("btn-send").disabled = true;

    chatHistory.push({ role: "user", text: msg });
    chatHistory.push({ role: "assistant", text: "Thinking..." });
    renderChat();

    try {
        const response = await vigilAPI.chat(currentWatcher.id, msg);
        chatHistory[chatHistory.length - 1].text = response;
    } catch (e) {
        chatHistory[chatHistory.length - 1].text = `Error: ${e.message}`;
    }
    renderChat();
}

// ============================================================================
// Inbox
// ============================================================================

async function loadInbox() {
    if (!currentWatcher) return;
    const container = document.getElementById("inbox-list");
    container.innerHTML = '<div class="loading-state">Loading threads...</div>';

    try {
        const threads = await vigilAPI.getThreads(currentWatcher.id);

        if (!threads.length) {
            container.innerHTML = '<div class="empty-state">No threads yet. Forward an email to get started.</div>';
            return;
        }

        container.innerHTML = threads.map(t => `
            <div class="inbox-item ${t.status === 'active' ? 'inbox-active' : ''}">
                <div class="inbox-subject">${escapeHtml(t.subject || "No subject")}</div>
                <div class="inbox-meta">
                    <span class="inbox-status inbox-status-${t.status}">${t.status}</span>
                    <span>${t.email_count || 0} emails</span>
                    ${t.last_activity ? `<span>${timeAgo(t.last_activity)}</span>` : ""}
                </div>
                ${t.summary ? `<div class="inbox-summary">${escapeHtml(t.summary)}</div>` : ""}
            </div>
        `).join("");
    } catch (e) {
        container.innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// ============================================================================
// Stats
// ============================================================================

async function loadStats() {
    if (!currentWatcher) return;
    const container = document.getElementById("stats-content");
    container.innerHTML = '<div class="loading-state">Loading stats...</div>';

    try {
        const [statusResult, usageResult, watcherResult, memoriesResult] = await Promise.allSettled([
            vigilAPI.getForwardingStatus(currentWatcher.id),
            vigilAPI.getUsage(),
            vigilAPI.getWatcher(currentWatcher.id),
            vigilAPI.getMemories(currentWatcher.id),
        ]);

        const status = statusResult.status === "fulfilled" ? statusResult.value : null;
        const usage = usageResult.status === "fulfilled" ? usageResult.value?.usage : null;
        const watcher = watcherResult.status === "fulfilled" ? watcherResult.value : null;
        const memories = memoriesResult.status === "fulfilled" ? memoriesResult.value : [];
        const watcherUsage = usage?.watchers?.find(w => w.watcher_id === currentWatcher.id);

        const active = status?.forwarding_active ?? false;
        const cost = watcherUsage?.cost ?? 0;

        container.innerHTML = `
            <div class="status-card">
                <div class="status-row">
                    <span>Status</span>
                    <span class="status-value" style="color:${active ? '#3d6b4f' : '#8b7234'}">${active ? 'Active' : 'Waiting'}</span>
                </div>
                <div class="status-row">
                    <span>Emails processed</span>
                    <span class="status-value">${(watcherUsage?.emails ?? status?.total_emails ?? 0).toLocaleString()}</span>
                </div>
                <div class="status-row">
                    <span>Emails (24h)</span>
                    <span class="status-value">${(status?.emails_24h ?? 0).toLocaleString()}</span>
                </div>
                <div class="status-row">
                    <span>Agent invocations</span>
                    <span class="status-value">${(watcherUsage?.invocations ?? 0).toLocaleString()}</span>
                </div>
                <div class="status-row">
                    <span>Alerts sent</span>
                    <span class="status-value">${(watcherUsage?.alerts ?? 0).toLocaleString()}</span>
                </div>
                <div class="status-row">
                    <span>Last email</span>
                    <span class="status-value">${status?.last_email_at ? timeAgo(status.last_email_at) : 'None'}</span>
                </div>
                <div class="status-row">
                    <span>Model</span>
                    <span class="status-value">${watcher?.model ?? '—'}</span>
                </div>
                <div class="status-row">
                    <span>Cost (this month)</span>
                    <span class="status-value">${cost > 0 ? '$' + cost.toFixed(4) : '$0.00'}</span>
                </div>
                <div class="status-row">
                    <span>Memories</span>
                    <span class="status-value">${memories.length}</span>
                </div>
            </div>

            ${memories.length > 0 ? `
                <div class="memories-section">
                    <h3>Recent Memories</h3>
                    ${memories.slice(0, 8).map(m => `
                        <div class="memory-item">
                            <div class="memory-content">${escapeHtml(m.content)}</div>
                            <div class="memory-meta">importance: ${m.importance || '—'} · ${m.created_at ? timeAgo(m.created_at) : ''}</div>
                        </div>
                    `).join("")}
                </div>
            ` : ''}
        `;
    } catch (e) {
        container.innerHTML = `<div class="error">${e.message}</div>`;
    }
}

// ============================================================================
// Setup
// ============================================================================

function loadSetup() {
    if (!currentWatcher) return;
    const addr = currentWatcher.ingestion_address ||
        `${currentWatcher.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${currentWatcher.ingest_token}@vigil.run`;
    document.getElementById("setup-address").textContent = addr;
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}
