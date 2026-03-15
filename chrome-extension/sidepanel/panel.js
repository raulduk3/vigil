/**
 * Vigil Chrome Extension — Side Panel
 */

let watchers = [], current = null, chatHistory = [];
let verifyInterval = null;

const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };
const ago = d => { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m/60)}h` : `${Math.floor(m/1440)}d`; };

function show(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    $(`view-${name}`)?.classList.add("active");
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    if (name === "overview") loadOverview();
    if (name === "threads") loadThreads();
    if (name === "config") loadConfig();
    if (name === "chat" && !chatHistory.length) renderChat();
}

function enterDashboard() {
    $("view-auth").classList.remove("active");
    $("view-onboard").classList.remove("active");
    $("header-right").classList.remove("hidden");
    $("nav-tabs").classList.remove("hidden");
    show("overview");
}

function enterOnboarding() {
    $("view-auth").classList.remove("active");
    $("header-right").classList.add("hidden");
    $("nav-tabs").classList.add("hidden");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    $("view-onboard").classList.add("active");
    resetOnboarding();
}

function openTab(url) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => { if (t?.id) chrome.tabs.update(t.id, { url }); });
}

// ============================================================================
// Boot
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Nav
    document.querySelectorAll(".nav-tab").forEach(t => t.addEventListener("click", () => show(t.dataset.view)));

    // Auth
    $("btn-auth-apikey").addEventListener("click", async () => {
        const key = $("auth-apikey").value.trim(); if (!key) return;
        $("auth-error").classList.add("hidden");
        try { await vigilAPI.loginWithApiKey(key); await boot(); }
        catch (e) { $("auth-error").textContent = e.message; $("auth-error").classList.remove("hidden"); }
    });
    $("btn-auth-login").addEventListener("click", async () => {
        const email = $("auth-email").value.trim(), pw = $("auth-password").value; if (!email || !pw) return;
        $("auth-error").classList.add("hidden");
        try { await vigilAPI.login(email, pw); await boot(); }
        catch (e) { $("auth-error").textContent = e.message; $("auth-error").classList.remove("hidden"); }
    });
    $("auth-apikey").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-auth-apikey").click(); });
    $("auth-password").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-auth-login").click(); });

    // Onboarding step 1: create watcher
    $("btn-ob-create").addEventListener("click", async () => {
        const name = $("ob-name").value.trim(), intent = $("ob-intent").value.trim();
        if (!name) { $("ob-error").textContent = "Give your watcher a name"; $("ob-error").classList.remove("hidden"); return; }
        $("ob-error").classList.add("hidden");
        $("btn-ob-create").disabled = true; $("btn-ob-create").textContent = "Creating...";
        try {
            const prompt = intent
                ? `You monitor emails. User instructions: ${intent}\n\nCore rules: Track deadlines and obligations. Alert when someone is waiting or a deadline is approaching. Ignore marketing and newsletters unless actionable.`
                : `You monitor emails. Track deadlines, obligations, and anything requiring action. Alert when something needs attention. Ignore noise.`;
            const w = await vigilAPI.createWatcher(name, prompt);
            await loadWatchers();
            current = watchers.find(x => x.id === w.id) || watchers[0];
            goOnboardStep(2);
            $("ob-address").textContent = w.ingestion_address || current?.ingestion_address || "";
            // Generate AI filter suggestions in background
            if (intent) generateFilters(w.id, intent);
        } catch (e) { $("ob-error").textContent = e.message; $("ob-error").classList.remove("hidden"); }
        $("btn-ob-create").disabled = false; $("btn-ob-create").textContent = "Create watcher";
    });

    // Onboarding step 2: connect email
    $("btn-ob-copy").addEventListener("click", () => {
        navigator.clipboard.writeText($("ob-address").textContent);
        $("btn-ob-copy").textContent = "Copied!"; setTimeout(() => $("btn-ob-copy").textContent = "Copy", 2000);
    });

    document.querySelectorAll(".ptab").forEach(t => {
        t.addEventListener("click", () => {
            document.querySelectorAll(".ptab").forEach(p => p.classList.remove("active"));
            t.classList.add("active");
            $("ob-gmail").classList.toggle("hidden", t.dataset.p !== "gmail");
            $("ob-outlook").classList.toggle("hidden", t.dataset.p !== "outlook");
        });
    });

    $("btn-ob-gmail").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/fwdandpop"));
    $("btn-ob-outlook").addEventListener("click", () => openTab("https://outlook.live.com/mail/0/options/mail/forwarding"));
    $("btn-ob-gmail-filter").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/filters"));
    $("btn-ob-outlook-rule").addEventListener("click", () => openTab("https://outlook.live.com/mail/0/options/mail/rules"));
    $("btn-ob-show-filters").addEventListener("click", () => $("ob-filter-section").classList.toggle("hidden"));

    $("btn-ob-next").addEventListener("click", () => {
        goOnboardStep(3);
        startVerifying();
    });

    // Onboarding step 3: verify
    $("btn-ob-skip").addEventListener("click", () => {
        stopVerifying();
        enterDashboard();
    });

    // Chat
    const ci = $("chat-input"), cs = $("btn-chat-send");
    ci.addEventListener("input", () => { cs.disabled = !ci.value.trim(); ci.style.height = "auto"; ci.style.height = Math.min(ci.scrollHeight, 120) + "px"; });
    ci.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (ci.value.trim()) sendChat(); } });
    cs.addEventListener("click", sendChat);

    // Config
    $("btn-cfg-copy").addEventListener("click", () => {
        navigator.clipboard.writeText($("cfg-address").textContent);
        $("btn-cfg-copy").textContent = "Copied!"; setTimeout(() => $("btn-cfg-copy").textContent = "Copy", 2000);
    });
    $("btn-cfg-gmail").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/fwdandpop"));
    $("btn-cfg-gmail-filter").addEventListener("click", () => openTab("https://mail.google.com/mail/u/0/#settings/filters"));
    $("btn-cfg-save").addEventListener("click", async () => {
        if (!current) return;
        const st = $("cfg-status");
        try {
            await vigilAPI.updateWatcher(current.id, { system_prompt: $("cfg-prompt").value.trim() || undefined, model: $("cfg-model").value });
            st.textContent = "Saved."; st.style.color = "#3d6b4f"; st.classList.remove("hidden");
            setTimeout(() => st.classList.add("hidden"), 3000);
        } catch (e) { st.textContent = e.message; st.style.color = "#8b4242"; st.classList.remove("hidden"); }
    });
    $("btn-cfg-new").addEventListener("click", () => enterOnboarding());
    $("btn-cfg-logout").addEventListener("click", async () => {
        await vigilAPI.logout(); location.reload();
    });

    // Watcher switcher
    $("watcher-select").addEventListener("change", e => {
        current = watchers.find(w => w.id === e.target.value); chatHistory = [];
        const activeView = document.querySelector(".nav-tab.active")?.dataset.view || "overview";
        show(activeView);
    });

    // Boot
    if (await vigilAPI.isAuthenticated()) await boot();
});

async function boot() {
    await loadWatchers();
    if (watchers.length === 0) enterOnboarding();
    else enterDashboard();
}

// ============================================================================
// Onboarding
// ============================================================================

function resetOnboarding() {
    $("ob-name").value = ""; $("ob-intent").value = "";
    $("ob-error").classList.add("hidden");
    $("ob-filter-section").classList.add("hidden");
    $("ob-ai-filters").classList.add("hidden");
    goOnboardStep(1);
}

function goOnboardStep(n) {
    [1,2,3].forEach(i => {
        $(`onboard-${i}`).classList.toggle("hidden", i !== n);
        $(`dot-${i}`).classList.toggle("active", i <= n);
    });
}

function startVerifying() {
    if (verifyInterval) return;
    let attempts = 0;
    const box = $("ob-verify-box");

    verifyInterval = setInterval(async () => {
        attempts++;
        if (!current) return;
        try {
            const s = await vigilAPI.getForwardingStatus(current.id);
            if (s.forwarding_active) {
                stopVerifying();
                box.innerHTML = `<span class="verify-ok">Connected! ${s.emails_24h} emails received.</span>`;
                setTimeout(() => enterDashboard(), 2000);
                return;
            }
        } catch {}
        if (attempts > 30) {
            stopVerifying();
            box.innerHTML = `<span class="verify-waiting">No emails detected yet. You can skip and check later.</span>`;
        } else {
            box.innerHTML = `<div class="spinner"></div><span>Waiting for first email... (${attempts}/30)</span>`;
        }
    }, 2000);
}

function stopVerifying() {
    if (verifyInterval) { clearInterval(verifyInterval); verifyInterval = null; }
}

async function generateFilters(watcherId, intent) {
    const el = $("ob-ai-filters");
    el.classList.remove("hidden");
    el.innerHTML = '<p class="muted small">Generating filter suggestions...</p>';
    try {
        const resp = await vigilAPI.chat(watcherId,
            `Suggest 2-3 email filters for Gmail or Outlook based on my instructions. For each, give:\nFILTER: [name]\nFrom: [value]\nSubject: [value]\nHas words: [value]\nKeep it short. If I should forward everything, say so.`
        );
        if (resp.toLowerCase().includes("forward everything") || resp.toLowerCase().includes("all email")) {
            el.innerHTML = `<p class="muted small" style="margin-top:8px;">Your instructions are broad enough to forward all email. No filters needed.</p>`;
        } else {
            el.innerHTML = `<div class="ai-filters"><p class="field-label">Suggested filters</p><pre class="filter-pre">${esc(resp)}</pre></div>`;
        }
    } catch {
        el.innerHTML = '';
    }
}

// ============================================================================
// Watchers
// ============================================================================

async function loadWatchers() {
    try {
        watchers = await vigilAPI.getWatchers();
        const sel = $("watcher-select");
        sel.innerHTML = watchers.map(w => `<option value="${w.id}">${esc(w.name)} (${w.total_emails || 0})</option>`).join("");
        if (!current && watchers.length) current = watchers[0];
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
        const watching = threads.filter(t => t.status === "watching" || t.status === "active");
        const alerts = acts.filter(a => a.tool === "send_alert" && a.result === "success");
        let h = `<div class="status-bar ${st.forwarding_active ? 'ok' : 'warn'}">${st.forwarding_active ? 'Connected' : 'Waiting for emails'} · ${(wu.emails||0).toLocaleString()} emails · $${(wu.cost||0).toFixed(3)}</div>`;
        if (watching.length) {
            h += `<div class="section"><div class="section-head">Watching <span class="badge">${watching.length}</span></div>`;
            h += watching.slice(0,8).map(t => `<div class="thread-row"><div class="thread-subject">${esc(t.subject)}</div><div class="thread-meta">${t.email_count||0} emails · ${t.last_activity ? ago(t.last_activity) : ""}</div>${t.summary ? `<div class="thread-summary">${esc(t.summary)}</div>` : ""}</div>`).join("") + "</div>";
        }
        if (alerts.length) {
            h += `<div class="section"><div class="section-head">Recent alerts</div>`;
            h += alerts.slice(0,5).map(a => `<div class="alert-row"><div class="alert-text">${esc(a.reasoning||a.decision||"Alert")}</div><div class="alert-meta">${a.created_at ? ago(a.created_at) : ""}</div></div>`).join("") + "</div>";
        }
        if (acts.length) {
            h += `<div class="section"><div class="section-head">Agent activity</div>`;
            h += acts.slice(0,10).map(a => {
                const cls = a.tool==="send_alert" ? "tool-alert" : a.tool==="ignore_thread" ? "tool-ignore" : "tool-default";
                return `<div class="action-row"><span class="tool-badge ${cls}">${esc(a.tool||"analyze")}</span><span class="action-text">${esc((a.decision||a.reasoning||"").slice(0,80))}</span><span class="action-time">${a.created_at ? ago(a.created_at) : ""}</span></div>`;
            }).join("") + "</div>";
        }
        if (mems.length) {
            h += `<div class="section"><div class="section-head">Memories <span class="badge">${mems.length}</span></div>`;
            h += mems.slice(0,6).map(m => `<div class="mem-row">${esc(m.content)}</div>`).join("") + "</div>";
        }
        if (!watching.length && !acts.length && !mems.length) {
            h += `<div class="empty">No activity yet. Forward an email to <strong>${esc(current.ingestion_address||"")}</strong></div>`;
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
            const a = t.status === "watching" || t.status === "active";
            return `<div class="thread-card ${a ? "thread-active" : ""}"><div class="thread-subject">${esc(t.subject)}</div><div class="thread-meta"><span class="status-${t.status}">${t.status}</span> · ${t.email_count||0} emails${t.last_activity ? " · "+ago(t.last_activity) : ""}</div>${t.summary ? `<div class="thread-summary">${esc(t.summary)}</div>` : ""}</div>`;
        }).join("");
    } catch (e) { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

// ============================================================================
// Chat
// ============================================================================

function renderChat() {
    const el = $("chat-messages");
    if (!chatHistory.length) {
        el.innerHTML = `<div class="chat-empty"><p class="chat-title">Talk to ${esc(current?.name||"your watcher")}</p><p class="muted">Ask about your inbox, set rules, or check obligations.</p>
        <div class="chip-row">${["What needs my attention?","Summarize this week","Upcoming deadlines","Ignore noreply senders"].map(s => `<button class="chip" data-msg="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`;
        el.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => { $("chat-input").value = c.dataset.msg; $("btn-chat-send").disabled = false; sendChat(); }));
        return;
    }
    el.innerHTML = chatHistory.map(m => `<div class="msg msg-${m.role}"><div class="msg-label">${m.role==="user" ? "You" : esc(current?.name||"Vigil")}</div><div class="msg-body">${esc(m.text)}</div></div>`).join("");
    el.scrollTop = el.scrollHeight;
}

async function sendChat() {
    const input = $("chat-input"), msg = input.value.trim(); if (!msg || !current) return;
    input.value = ""; input.style.height = "auto"; $("btn-chat-send").disabled = true;
    chatHistory.push({ role: "user", text: msg }, { role: "assistant", text: "Thinking..." });
    renderChat();
    try { chatHistory[chatHistory.length-1].text = await vigilAPI.chat(current.id, msg); }
    catch (e) { chatHistory[chatHistory.length-1].text = `Error: ${e.message}`; }
    renderChat();
}

// ============================================================================
// Config
// ============================================================================

async function loadConfig() {
    if (!current) return;
    $("cfg-address").textContent = current.ingestion_address || "";
    const conn = $("cfg-conn");
    conn.innerHTML = '<span class="muted small">Checking...</span>';
    try {
        const s = await vigilAPI.getForwardingStatus(current.id);
        conn.innerHTML = s.forwarding_active
            ? `<div class="conn-ok"><span class="conn-dot ok"></span> Connected — ${s.emails_24h} emails (24h), last ${ago(s.last_email_at)}</div>`
            : `<div class="conn-waiting"><span class="conn-dot waiting"></span> Not connected — set up forwarding below</div>`;
    } catch { conn.innerHTML = `<div class="conn-waiting"><span class="conn-dot waiting"></span> Not connected</div>`; }
    try {
        const w = await vigilAPI.getWatcher(current.id);
        $("cfg-prompt").value = w?.system_prompt || "";
        $("cfg-model").value = w?.model || "gpt-4.1-mini";
    } catch {
        $("cfg-prompt").value = current.system_prompt || "";
        $("cfg-model").value = current.model || "gpt-4.1-mini";
    }
}
