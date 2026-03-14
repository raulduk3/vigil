/**
 * Side Panel — Watcher dashboard with chat, inbox, stats, and setup.
 */

const DEFAULT_WATCHER_PROMPT = `You are an email monitoring agent. You watch a stream of forwarded emails and take action when something needs attention.

Your job:
1. Read each email carefully. Extract who sent it, what they want, and whether it requires action.
2. Track conversations. Group related emails into threads. Update thread status as conversations evolve.
3. Remember what matters. Store facts, commitments, deadlines, and patterns as memories.
4. Alert when needed. Send an alert when an email requires the user's attention.
5. Stay quiet when nothing matters. Routine confirmations, newsletters, and FYIs should rarely alert.

When you alert, be specific and actionable. When you store memories, be concrete.`;

let currentWatcher = null;
let watchers = [];
let chatHistory = [];
let currentSetupContext = null;
let currentConfirmCode = null;
let confirmCodeTimer = null;

function showView(name) {
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    document.getElementById(`view-${name}`)?.classList.add("active");

    document.querySelectorAll(".nav-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.view === name);
    });

    if (name !== "setup") {
        stopConfirmCodePolling();
    }

    if (name === "dashboard") loadDashboard();
    if (name === "inbox") loadInbox();
    if (name === "setup") loadSetup();
    if (name === "stats") loadStats();
}

function showAuthenticatedShell(startView = "dashboard") {
    document.getElementById("view-auth").classList.remove("active");
    document.getElementById("header-controls").classList.remove("hidden");
    document.getElementById("nav-tabs").classList.remove("hidden");
    showView(startView);
}

function showAuthShell() {
    stopConfirmCodePolling();
    document.getElementById("header-controls").classList.add("hidden");
    document.getElementById("nav-tabs").classList.add("hidden");
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    document.getElementById("view-auth").classList.add("active");
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
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

function setStatus(element, text, tone = "info") {
    if (!element) return;
    element.textContent = text;
    element.dataset.tone = tone;
    element.classList.remove("hidden");
}

function hideStatus(element) {
    if (!element) return;
    element.textContent = "";
    element.classList.add("hidden");
    delete element.dataset.tone;
}

function getSetupAddress() {
    if (!currentWatcher) return "";
    return currentWatcher.ingestion_address ||
        `${currentWatcher.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${currentWatcher.ingest_token}@vigil.run`;
}

function renderNoWatcherState(title, description) {
    return `
        <div class="empty-state">
            <p>${escapeHtml(title)}</p>
            <p style="margin-top:4px;">${escapeHtml(description)}</p>
        </div>
    `;
}

function updateWatcherSelector() {
    const select = document.getElementById("watcher-select");
    select.innerHTML = "";
    select.disabled = watchers.length === 0;

    if (watchers.length === 0) {
        const option = document.createElement("option");
        option.textContent = "Create a watcher";
        option.value = "";
        select.appendChild(option);
        return;
    }

    for (const watcher of watchers) {
        const option = document.createElement("option");
        option.value = watcher.id;
        option.textContent = `${watcher.name} (${(watcher.total_emails || 0).toLocaleString()})`;
        option.selected = currentWatcher?.id === watcher.id;
        select.appendChild(option);
    }
}

async function loadWatchers() {
    watchers = await vigilAPI.getWatchers();

    if (watchers.length === 0) {
        currentWatcher = null;
    } else if (!currentWatcher) {
        currentWatcher = watchers[0];
    } else {
        currentWatcher = watchers.find((watcher) => watcher.id === currentWatcher.id) || watchers[0];
    }

    updateWatcherSelector();
}

function renderChat() {
    const container = document.getElementById("chat-messages");

    if (!currentWatcher) {
        container.innerHTML = renderNoWatcherState(
            "No watcher yet.",
            "Open Config to create one before using chat."
        );
        return;
    }

    if (chatHistory.length === 0) {
        container.innerHTML = `
            <div class="chat-welcome">
                <p class="chat-welcome-title">Talk to ${escapeHtml(currentWatcher.name || "your watcher")}</p>
                <p class="chat-welcome-desc">Ask about your inbox, set rules, check obligations, or tell it what to focus on.</p>
                <div class="chat-suggestions">
                    <button class="chat-suggestion" data-msg="What needs my attention today?">What needs my attention?</button>
                    <button class="chat-suggestion" data-msg="Summarize my inbox this week">Summarize this week</button>
                    <button class="chat-suggestion" data-msg="What deadlines are coming up?">Upcoming deadlines</button>
                    <button class="chat-suggestion" data-msg="Ignore all emails from noreply addresses">Ignore noreply senders</button>
                </div>
            </div>
        `;

        container.querySelectorAll(".chat-suggestion").forEach((button) => {
            button.addEventListener("click", () => {
                document.getElementById("chat-input").value = button.dataset.msg;
                document.getElementById("btn-send").disabled = false;
                sendChat();
            });
        });
        return;
    }

    container.innerHTML = chatHistory.map((message) => `
        <div class="chat-msg chat-msg-${message.role}">
            <div class="chat-msg-label">${message.role === "user" ? "You" : escapeHtml(currentWatcher?.name || "Vigil")}</div>
            <div class="chat-msg-body">${escapeHtml(message.text)}</div>
        </div>
    `).join("");
    container.scrollTop = container.scrollHeight;
}

async function sendChat() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    if (!message || !currentWatcher) return;

    input.value = "";
    input.style.height = "auto";
    document.getElementById("btn-send").disabled = true;

    chatHistory.push({ role: "user", text: message });
    chatHistory.push({ role: "assistant", text: "Thinking..." });
    renderChat();

    try {
        const response = await vigilAPI.chat(currentWatcher.id, message);
        chatHistory[chatHistory.length - 1].text = response;
    } catch (error) {
        chatHistory[chatHistory.length - 1].text = `Error: ${error.message}`;
    }

    renderChat();
}

async function loadDashboard() {
    const container = document.getElementById("dashboard-content");

    if (!currentWatcher) {
        container.innerHTML = renderNoWatcherState(
            "Create your first watcher.",
            "Open Config to generate a forwarding address and finish setup."
        );
        return;
    }

    container.innerHTML = '<div class="loading-state">Loading...</div>';

    try {
        const [statusResult, usageResult, threadsResult, memoriesResult, actionsResult] = await Promise.allSettled([
            vigilAPI.getForwardingStatus(currentWatcher.id),
            vigilAPI.getUsage(),
            vigilAPI.getThreads(currentWatcher.id),
            vigilAPI.getMemories(currentWatcher.id),
            vigilAPI.getActions(currentWatcher.id),
        ]);

        const status = statusResult.status === "fulfilled" ? statusResult.value : {};
        const usage = usageResult.status === "fulfilled" ? usageResult.value?.usage : {};
        const threads = threadsResult.status === "fulfilled" ? threadsResult.value : [];
        const memories = memoriesResult.status === "fulfilled" ? memoriesResult.value : [];
        const actions = actionsResult.status === "fulfilled" ? actionsResult.value : [];
        const watcherUsage = usage?.watchers?.find((watcher) => watcher.watcher_id === currentWatcher.id) || {};

        const activeThreads = threads.filter((thread) => thread.status === "watching" || thread.status === "active");
        const recentAlerts = actions.filter((action) => action.tool === "send_alert" && action.result === "success").slice(0, 5);
        const recentActions = actions.slice(0, 8);
        const active = status.forwarding_active ?? false;

        let html = `
            <div class="dash-status-bar ${active ? "dash-active" : "dash-waiting"}">
                <span>${active ? "Active" : "Waiting for emails"}</span>
                <span>${(watcherUsage.emails ?? 0).toLocaleString()} emails · ${(watcherUsage.invocations ?? 0).toLocaleString()} invocations · $${(watcherUsage.cost ?? 0).toFixed(3)}</span>
            </div>
        `;

        if (activeThreads.length > 0) {
            html += `
                <div class="dash-section">
                    <div class="dash-section-header">Active threads <span class="dash-count">${activeThreads.length}</span></div>
                    ${activeThreads.slice(0, 6).map((thread) => `
                        <div class="dash-thread">
                            <div class="dash-thread-subject">${escapeHtml(thread.subject || "No subject")}</div>
                            <div class="dash-thread-meta">${thread.email_count || 0} emails · ${thread.last_activity ? timeAgo(thread.last_activity) : ""}</div>
                            ${thread.summary ? `<div class="dash-thread-summary">${escapeHtml(thread.summary)}</div>` : ""}
                        </div>
                    `).join("")}
                </div>
            `;
        }

        if (recentAlerts.length > 0) {
            html += `
                <div class="dash-section">
                    <div class="dash-section-header">Recent alerts <span class="dash-count">${watcherUsage.alerts ?? 0}</span></div>
                    ${recentAlerts.map((action) => `
                        <div class="dash-alert">
                            <div class="dash-alert-text">${escapeHtml(action.reasoning || action.decision || "Alert sent")}</div>
                            <div class="dash-alert-meta">${action.created_at ? timeAgo(action.created_at) : ""}</div>
                        </div>
                    `).join("")}
                </div>
            `;
        }

        if (recentActions.length > 0) {
            html += `
                <div class="dash-section">
                    <div class="dash-section-header">Agent activity</div>
                    ${recentActions.map((action) => {
                        const tool = action.tool || "analyze";
                        const toolClass = tool === "send_alert"
                            ? "dash-tool-alert"
                            : tool === "ignore_thread"
                                ? "dash-tool-ignore"
                                : "dash-tool-default";

                        return `
                            <div class="dash-action">
                                <span class="dash-tool ${toolClass}">${escapeHtml(tool)}</span>
                                <span class="dash-action-text">${escapeHtml(action.decision || action.reasoning || "—")}</span>
                                <span class="dash-action-time">${action.created_at ? timeAgo(action.created_at) : ""}</span>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
        }

        if (memories.length > 0) {
            html += `
                <div class="dash-section">
                    <div class="dash-section-header">What the agent remembers <span class="dash-count">${memories.length}</span></div>
                    ${memories.slice(0, 6).map((memory) => `
                        <div class="dash-memory">${escapeHtml(memory.content)}</div>
                    `).join("")}
                </div>
            `;
        }

        if (!activeThreads.length && !recentActions.length && !memories.length) {
            html += `
                <div class="empty-state">
                    <p>No activity yet.</p>
                    <p style="margin-top:4px;">Forward an email to <strong>${escapeHtml(getSetupAddress())}</strong> to get started.</p>
                </div>
            `;
        }

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
}

async function loadInbox() {
    const container = document.getElementById("inbox-list");

    if (!currentWatcher) {
        container.innerHTML = renderNoWatcherState(
            "No threads yet.",
            "Create a watcher first in Config."
        );
        return;
    }

    container.innerHTML = '<div class="loading-state">Loading threads...</div>';

    try {
        const threads = await vigilAPI.getThreads(currentWatcher.id);
        if (!threads.length) {
            container.innerHTML = '<div class="empty-state">No threads yet. Forward an email to get started.</div>';
            return;
        }

        container.innerHTML = threads.map((thread) => `
            <div class="inbox-item ${(thread.status === "watching" || thread.status === "active") ? "inbox-active" : ""}">
                <div class="inbox-subject">${escapeHtml(thread.subject || "No subject")}</div>
                <div class="inbox-meta">
                    <span class="inbox-status inbox-status-${thread.status}">${thread.status}</span>
                    <span>${thread.email_count || 0} emails</span>
                    ${thread.last_activity ? `<span>${timeAgo(thread.last_activity)}</span>` : ""}
                </div>
                ${thread.summary ? `<div class="inbox-summary">${escapeHtml(thread.summary)}</div>` : ""}
            </div>
        `).join("");
    } catch (error) {
        container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
}

async function loadStats() {
    const container = document.getElementById("stats-content");

    if (!currentWatcher) {
        container.innerHTML = renderNoWatcherState(
            "No watcher selected.",
            "Create one in Config to see forwarding and usage stats."
        );
        return;
    }

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
                <div class="status-row"><span>Status</span><span class="status-value" style="color:${active ? '#3d6b4f' : '#8b7234'}">${active ? 'Active' : 'Waiting'}</span></div>
                <div class="status-row"><span>Emails processed</span><span class="status-value">${(watcherUsage?.emails ?? status?.total_emails ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Emails (24h)</span><span class="status-value">${(status?.emails_24h ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Agent invocations</span><span class="status-value">${(watcherUsage?.invocations ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Alerts sent</span><span class="status-value">${(watcherUsage?.alerts ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Last email</span><span class="status-value">${status?.last_email_at ? timeAgo(status.last_email_at) : 'None'}</span></div>
                <div class="status-row"><span>Model</span><span class="status-value">${watcher?.model ?? '—'}</span></div>
                <div class="status-row"><span>Cost (this month)</span><span class="status-value">${cost > 0 ? '$' + cost.toFixed(4) : '$0.00'}</span></div>
                <div class="status-row"><span>Memories</span><span class="status-value">${memories.length}</span></div>
            </div>
            ${memories.length > 0 ? `
                <div class="memories-section">
                    <h3>Recent Memories</h3>
                    ${memories.slice(0, 8).map(m => `
                        <div class="memory-item">
                            <div class="memory-content">${escapeHtml(m.content)}</div>
                            <div class="memory-meta">importance: ${m.importance || '—'} ${m.created_at ? '· ' + timeAgo(m.created_at) : ''}</div>
                        </div>
                    `).join("")}
                </div>
            ` : ''}
        `;
    } catch (e) {
        container.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
}

// ============================================================================
// Setup
// ============================================================================

async function loadSetup() {
    if (!currentWatcher) return;

    const addr = currentWatcher.ingestion_address ||
        `${currentWatcher.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${currentWatcher.ingest_token}@vigil.run`;
    document.getElementById("setup-address").textContent = addr;

    try {
        const w = await vigilAPI.getWatcher(currentWatcher.id);
        document.getElementById("setup-prompt").value = w.system_prompt || "";
        document.getElementById("setup-model").value = w.model || "gpt-4.1";
    } catch (e) {
        document.getElementById("setup-prompt").value = currentWatcher.system_prompt || "";
        document.getElementById("setup-model").value = currentWatcher.model || "gpt-4.1";
    }
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
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
