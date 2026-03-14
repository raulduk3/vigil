/**
 * Vigil Chrome Extension — Side Panel
 */

let watchers = [];
let current = null;
let chatHistory = [];

const $ = (id) => document.getElementById(id);
const esc = (s) => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const ago = (d) => { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m/60)}h` : `${Math.floor(m/1440)}d`; };

// ============================================================================
// Views
// ============================================================================

function show(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    $(`view-${name}`)?.classList.add("active");
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    if (name === "overview") loadOverview();
    if (name === "threads") loadThreads();
    if (name === "config") loadConfig();
    if (name === "chat" && chatHistory.length === 0) renderChat();
    if (name === "setup") resetSetup();
}

function enterApp() {
    $("view-auth").classList.remove("active");
    $("header-controls").classList.remove("hidden");
    $("nav-tabs").classList.remove("hidden");
    if (watchers.length === 0) {
        show("setup");
    } else {
        show("overview");
    }
}

// ============================================================================
// Boot — wire EVERYTHING, then check auth
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Nav
    document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => show(t.dataset.view)));

    // Auth
    $("btn-auth-apikey").addEventListener("click", async () => {
        const key = $("auth-apikey").value.trim();
        if (!key) return;
        $("auth-error").classList.add("hidden");
        try { await vigilAPI.loginWithApiKey(key); await loadWatchers(); enterApp(); }
        catch (e) { $("auth-error").textContent = e.message; $("auth-error").classList.remove("hidden"); }
    });

    $("btn-auth-login").addEventListener("click", async () => {
        const email = $("auth-email").value.trim(), pw = $("auth-password").value;
        if (!email || !pw) return;
        $("auth-error").classList.add("hidden");
        try { await vigilAPI.login(email, pw); await loadWatchers(); enterApp(); }
        catch (e) { $("auth-error").textContent = e.message; $("auth-error").classList.remove("hidden"); }
    });

    $("auth-apikey").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-auth-apikey").click(); });
    $("auth-password").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-auth-login").click(); });

    // Watcher switcher
    $("watcher-select").addEventListener("change", e => {
        current = watchers.find(w => w.id === e.target.value) || null;
        chatHistory = [];
        show(document.querySelector(".nav-tab.active")?.dataset.view || "overview");
    });

    // Chat
    const ci = $("chat-input"), cs = $("btn-chat-send");
    ci.addEventListener("input", () => { cs.disabled = !ci.value.trim(); ci.style.height = "auto"; ci.style.height = Math.min(ci.scrollHeight, 120) + "px"; });
    ci.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (ci.value.trim()) sendChat(); } });
    cs.addEventListener("click", sendChat);

    // Config buttons
    $("btn-copy-addr").addEventListener("click", () => {
        navigator.clipboard.writeText($("config-address").textContent);
        $("btn-copy-addr").textContent = "Copied"; setTimeout(() => $("btn-copy-addr").textContent = "Copy", 2000);
    });
    $("btn-gmail-fwd").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/fwdandpop"));
    $("btn-gmail-filter").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/filters"));
    $("btn-outlook-fwd").addEventListener("click", () => openTab("https://outlook.live.com/mail/0/options/mail/forwarding"));

    $("btn-save-config").addEventListener("click", async () => {
        if (!current) return;
        const st = $("config-status");
        try {
            await vigilAPI.updateWatcher(current.id, {
                system_prompt: $("config-prompt").value.trim() || undefined,
                model: $("config-model").value,
            });
            st.textContent = "Saved."; st.style.color = "#3d6b4f"; st.classList.remove("hidden");
            setTimeout(() => st.classList.add("hidden"), 3000);
        } catch (e) { st.textContent = e.message; st.style.color = "#8b4242"; st.classList.remove("hidden"); }
    });

    $("btn-logout").addEventListener("click", async () => {
        await vigilAPI.logout();
        $("header-controls").classList.add("hidden");
        $("nav-tabs").classList.add("hidden");
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        $("view-auth").classList.add("active");
    });

    // Setup: create watcher
    $("btn-setup-create").addEventListener("click", async () => {
        const name = $("setup-name").value.trim();
        const intent = $("setup-intent").value.trim();
        if (!name) { $("setup-create-error").textContent = "Name is required"; $("setup-create-error").classList.remove("hidden"); return; }
        $("setup-create-error").classList.add("hidden");
        $("btn-setup-create").disabled = true;
        $("btn-setup-create").textContent = "Creating...";
        try {
            const prompt = intent
                ? `You monitor emails related to: ${intent}. Track deadlines, obligations, and anything requiring action. Alert the user when someone is waiting on them or when a deadline is approaching. Ignore marketing and newsletters unless they contain something actionable.`
                : `You monitor emails and focus on deadlines, obligations, and anything requiring action. Alert the user when something needs their attention. Ignore noise.`;
            const watcher = await vigilAPI.createWatcher(name, prompt);
            await loadWatchers();
            current = watchers.find(w => w.id === watcher.id) || watchers[0];
            $("watcher-select").value = current?.id || "";
            // Show connect step
            $("setup-step-create").classList.add("hidden");
            $("setup-step-connect").classList.remove("hidden");
            $("setup-fwd-address").textContent = watcher.ingestion_address || `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${watcher.ingest_token}@vigil.run`;
        } catch (e) {
            $("setup-create-error").textContent = e.message;
            $("setup-create-error").classList.remove("hidden");
        }
        $("btn-setup-create").disabled = false;
        $("btn-setup-create").textContent = "Create watcher";
    });

    $("setup-name").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("setup-intent").focus(); } });

    // Setup: copy address
    $("btn-setup-copy").addEventListener("click", () => {
        navigator.clipboard.writeText($("setup-fwd-address").textContent);
        $("btn-setup-copy").textContent = "Copied"; setTimeout(() => $("btn-setup-copy").textContent = "Copy", 2000);
    });

    // Setup: provider tabs
    document.querySelectorAll(".provider-tab").forEach(t => {
        t.addEventListener("click", () => {
            document.querySelectorAll(".provider-tab").forEach(p => p.classList.remove("active"));
            t.classList.add("active");
            $("setup-gmail").classList.toggle("hidden", t.dataset.provider !== "gmail");
            $("setup-outlook").classList.toggle("hidden", t.dataset.provider !== "outlook");
        });
    });

    // Setup: open email settings
    $("btn-setup-gmail-fwd").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/fwdandpop"));
    $("btn-setup-outlook-fwd").addEventListener("click", () => openTab("https://outlook.live.com/mail/0/options/mail/forwarding"));
    $("btn-setup-gmail-filter").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/filters"));
    $("btn-setup-outlook-rule").addEventListener("click", () => openTab("https://outlook.live.com/mail/0/options/mail/rules"));

    // Setup: done / create another
    $("btn-setup-done").addEventListener("click", () => show("overview"));
    $("btn-setup-another").addEventListener("click", () => resetSetup());

    // Boot
    if (await vigilAPI.isAuthenticated()) { await loadWatchers(); enterApp(); }
});

function openTab(url) { chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => { if (t?.id) chrome.tabs.update(t.id, { url }); }); }

function resetSetup() {
    $("setup-step-create").classList.remove("hidden");
    $("setup-step-connect").classList.add("hidden");
    $("setup-name").value = "";
    $("setup-intent").value = "";
    $("setup-create-error").classList.add("hidden");
}

// ============================================================================
// Watchers
// ============================================================================

async function loadWatchers() {
    try {
        watchers = await vigilAPI.getWatchers();
        const sel = $("watcher-select");
        sel.innerHTML = watchers.map(w => `<option value="${w.id}">${esc(w.name)} (${w.total_emails || 0})</option>`).join("");
        current = watchers[0] || null;
    } catch (e) { console.error("loadWatchers:", e); }
}

// ============================================================================
// Overview
// ============================================================================

async function loadOverview() {
    if (!current) return;
    const el = $("overview-content");
    el.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const [st, usage, threads, mems, acts] = await Promise.all([
            vigilAPI.getForwardingStatus(current.id).catch(() => ({})),
            vigilAPI.getUsage().catch(() => ({})),
            vigilAPI.getThreads(current.id).catch(() => []),
            vigilAPI.getMemories(current.id).catch(() => []),
            vigilAPI.getActions(current.id).catch(() => []),
        ]);

        const wu = usage?.watchers?.find(w => w.watcher_id === current.id) || {};
        const active = (st.forwarding_active) ? "Active" : "Waiting";
        const watching = threads.filter(t => t.status === "watching" || t.status === "active");
        const alerts = acts.filter(a => a.tool === "send_alert" && a.result === "success");

        let h = `<div class="status-bar ${st.forwarding_active ? 'ok' : 'warn'}">${active} · ${(wu.emails || 0).toLocaleString()} emails · $${(wu.cost || 0).toFixed(3)}</div>`;

        if (watching.length) {
            h += `<div class="section"><div class="section-head">Watching <span class="badge">${watching.length}</span></div>`;
            h += watching.slice(0, 8).map(t => `<div class="thread-row">
                <div class="thread-subject">${esc(t.subject)}</div>
                <div class="thread-meta">${t.email_count || 0} emails · ${t.last_activity ? ago(t.last_activity) : ""}</div>
                ${t.summary ? `<div class="thread-summary">${esc(t.summary)}</div>` : ""}
            </div>`).join("") + "</div>";
        }

        if (alerts.length) {
            h += `<div class="section"><div class="section-head">Recent alerts</div>`;
            h += alerts.slice(0, 5).map(a => `<div class="alert-row">
                <div class="alert-text">${esc(a.reasoning || a.decision || "Alert sent")}</div>
                <div class="alert-meta">${a.created_at ? ago(a.created_at) : ""}</div>
            </div>`).join("") + "</div>";
        }

        if (acts.length) {
            h += `<div class="section"><div class="section-head">Agent activity</div>`;
            h += acts.slice(0, 10).map(a => {
                const cls = a.tool === "send_alert" ? "tool-alert" : a.tool === "ignore_thread" ? "tool-ignore" : "tool-default";
                return `<div class="action-row"><span class="tool-badge ${cls}">${esc(a.tool || "analyze")}</span><span class="action-text">${esc((a.decision || a.reasoning || "").slice(0, 80))}</span><span class="action-time">${a.created_at ? ago(a.created_at) : ""}</span></div>`;
            }).join("") + "</div>";
        }

        if (mems.length) {
            h += `<div class="section"><div class="section-head">Memories <span class="badge">${mems.length}</span></div>`;
            h += mems.slice(0, 6).map(m => `<div class="mem-row">${esc(m.content)}</div>`).join("") + "</div>";
        }

        if (!watching.length && !acts.length && !mems.length) {
            h += `<div class="empty">No activity yet. Forward an email to <strong>${esc(current.ingestion_address || "")}</strong></div>`;
        }

        el.innerHTML = h;
    } catch (e) { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

// ============================================================================
// Threads
// ============================================================================

async function loadThreads() {
    if (!current) return;
    const el = $("threads-content");
    el.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const threads = await vigilAPI.getThreads(current.id);
        if (!threads.length) { el.innerHTML = '<div class="empty">No threads yet.</div>'; return; }
        el.innerHTML = threads.map(t => {
            const active = t.status === "watching" || t.status === "active";
            return `<div class="thread-card ${active ? "thread-active" : ""}">
                <div class="thread-subject">${esc(t.subject)}</div>
                <div class="thread-meta"><span class="status-${t.status}">${t.status}</span> · ${t.email_count || 0} emails${t.last_activity ? " · " + ago(t.last_activity) : ""}</div>
                ${t.summary ? `<div class="thread-summary">${esc(t.summary)}</div>` : ""}
            </div>`;
        }).join("");
    } catch (e) { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

// ============================================================================
// Chat
// ============================================================================

function renderChat() {
    const el = $("chat-messages");
    if (!chatHistory.length) {
        el.innerHTML = `<div class="chat-empty">
            <p class="chat-title">Talk to ${esc(current?.name || "your watcher")}</p>
            <p class="muted">Ask about your inbox, set rules, or check obligations.</p>
            <div class="chip-row">${["What needs my attention?", "Summarize this week", "Upcoming deadlines", "Ignore noreply senders"]
                .map(s => `<button class="chip" data-msg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        </div>`;
        el.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
            $("chat-input").value = c.dataset.msg; $("btn-chat-send").disabled = false; sendChat();
        }));
        return;
    }
    el.innerHTML = chatHistory.map(m => `<div class="msg msg-${m.role}">
        <div class="msg-label">${m.role === "user" ? "You" : esc(current?.name || "Vigil")}</div>
        <div class="msg-body">${esc(m.text)}</div>
    </div>`).join("");
    el.scrollTop = el.scrollHeight;
}

async function sendChat() {
    const input = $("chat-input"), msg = input.value.trim();
    if (!msg || !current) return;
    input.value = ""; input.style.height = "auto"; $("btn-chat-send").disabled = true;
    chatHistory.push({ role: "user", text: msg }, { role: "assistant", text: "Thinking..." });
    renderChat();
    try { chatHistory[chatHistory.length - 1].text = await vigilAPI.chat(current.id, msg); }
    catch (e) { chatHistory[chatHistory.length - 1].text = `Error: ${e.message}`; }
    renderChat();
}

// ============================================================================
// Config
// ============================================================================

async function loadConfig() {
    if (!current) return;
    $("config-address").textContent = current.ingestion_address || `${current.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${current.ingest_token}@vigil.run`;
    try {
        const w = await vigilAPI.getWatcher(current.id);
        $("config-prompt").value = w?.system_prompt || "";
        $("config-model").value = w?.model || "gpt-4.1-mini";
    } catch {
        $("config-prompt").value = current.system_prompt || "";
        $("config-model").value = current.model || "gpt-4.1-mini";
    }
}
