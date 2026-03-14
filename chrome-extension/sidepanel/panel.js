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

const ALLOWED_MODELS = [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
];

const DEFAULT_MODEL = "gpt-4.1-mini";

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

function normalizeModel(model) {
    if (ALLOWED_MODELS.includes(model)) {
        return model;
    }

    return DEFAULT_MODEL;
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
        const watcherUsage = usage?.watchers?.find((item) => item.watcher_id === currentWatcher.id);

        const active = status?.forwarding_active ?? false;
        const cost = watcherUsage?.cost ?? 0;

        container.innerHTML = `
            <div class="status-card">
                <div class="status-row"><span>Status</span><span class="status-value" style="color:${active ? "#3d6b4f" : "#8b7234"}">${active ? "Active" : "Waiting"}</span></div>
                <div class="status-row"><span>Emails processed</span><span class="status-value">${(watcherUsage?.emails ?? status?.total_emails ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Emails (24h)</span><span class="status-value">${(status?.emails_24h ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Agent invocations</span><span class="status-value">${(watcherUsage?.invocations ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Alerts sent</span><span class="status-value">${(watcherUsage?.alerts ?? 0).toLocaleString()}</span></div>
                <div class="status-row"><span>Last email</span><span class="status-value">${status?.last_email_at ? timeAgo(status.last_email_at) : "None"}</span></div>
                <div class="status-row"><span>Model</span><span class="status-value">${watcher?.model ?? "—"}</span></div>
                <div class="status-row"><span>Cost (this month)</span><span class="status-value">${cost > 0 ? "$" + cost.toFixed(4) : "$0.00"}</span></div>
                <div class="status-row"><span>Memories</span><span class="status-value">${memories.length}</span></div>
            </div>
            ${memories.length > 0 ? `
                <div class="memories-section">
                    <h3>Recent Memories</h3>
                    ${memories.slice(0, 8).map((memory) => `
                        <div class="memory-item">
                            <div class="memory-content">${escapeHtml(memory.content)}</div>
                            <div class="memory-meta">importance: ${memory.importance || "—"} ${memory.created_at ? "· " + timeAgo(memory.created_at) : ""}</div>
                        </div>
                    `).join("")}
                </div>
            ` : ""}
        `;
    } catch (error) {
        container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
}

async function getActiveSetupContext() {
    try {
        const context = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_CONTEXT" });
        if (!context?.supported || !context.tabId) {
            return context || { supported: false, provider: null, tabId: null };
        }

        try {
            const page = await chrome.tabs.sendMessage(context.tabId, { type: "GET_SETUP_STATE" });
            return { ...context, page };
        } catch (error) {
            return {
                ...context,
                page: null,
                error: error.message || "Setup helper unavailable on this page.",
            };
        }
    } catch (error) {
        return {
            supported: false,
            provider: null,
            tabId: null,
            error: error.message || "Unable to inspect the active tab.",
        };
    }
}

function updateSetupVisibility() {
    const emptyState = document.getElementById("watcher-empty-state");
    const setupSections = document.getElementById("watcher-setup-sections");
    emptyState.classList.toggle("hidden", Boolean(currentWatcher));
    setupSections.classList.toggle("hidden", !currentWatcher);
}

function renderSetupContext() {
    const statusText = document.getElementById("provider-status-text");
    const statusDetail = document.getElementById("provider-status-detail");
    const assistButton = document.getElementById("btn-assist-setup");

    if (!currentSetupContext?.supported) {
        statusText.textContent = "Open Gmail or Outlook in the active tab to enable setup assistance.";
        statusDetail.textContent = "The extension can open either provider's forwarding settings directly.";
        assistButton.disabled = true;
        return;
    }

    const providerName = currentSetupContext.provider === "gmail" ? "Gmail" : "Outlook";
    const onForwardingPage = Boolean(currentSetupContext.page?.onForwardingPage);
    const detailParts = [];
    const pageActions = currentSetupContext.page?.actions || {};

    if (currentSetupContext.page?.note) {
        detailParts.push(currentSetupContext.page.note);
    }
    if (pageActions.fillAddress) {
        detailParts.push("The forwarding address field is visible.");
    }
    if (pageActions.fillConfirmCode) {
        detailParts.push("A confirmation code field is visible.");
    }
    if (pageActions.save && currentSetupContext.provider === "outlook") {
        detailParts.push("Outlook save controls are available.");
    }

    statusText.textContent = onForwardingPage
        ? `${providerName} forwarding settings are open in the active tab.`
        : `${providerName} is open in the active tab, but not on the forwarding settings page.`;
    statusDetail.textContent = detailParts.join(" ") || "Use the provider buttons below to jump to the forwarding settings page.";
    assistButton.disabled = false;
}

async function refreshConfirmCodeStatus() {
    const confirmBox = document.getElementById("gmail-confirm-box");
    const confirmStatus = document.getElementById("gmail-confirm-status");
    const confirmCode = document.getElementById("gmail-confirm-code");
    const insertButton = document.getElementById("btn-insert-confirm-code");

    const shouldShow = Boolean(currentWatcher) && currentSetupContext?.provider === "gmail";
    confirmBox.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) {
        currentConfirmCode = null;
        insertButton.disabled = true;
        return;
    }

    try {
        const result = await vigilAPI.getConfirmCode(currentWatcher.id);
        currentConfirmCode = result.code || null;

        if (currentConfirmCode) {
            confirmStatus.textContent = "Confirmation code received. Insert it into Gmail from here.";
            confirmCode.textContent = currentConfirmCode;
            insertButton.disabled = false;
        } else {
            confirmStatus.textContent = "Waiting for Gmail to send the confirmation email to Vigil.";
            confirmCode.textContent = "Not available yet";
            insertButton.disabled = true;
        }
    } catch (error) {
        currentConfirmCode = null;
        confirmStatus.textContent = `Could not load confirmation code: ${error.message}`;
        confirmCode.textContent = "Unavailable";
        insertButton.disabled = true;
    }
}

function stopConfirmCodePolling() {
    if (confirmCodeTimer) {
        clearInterval(confirmCodeTimer);
        confirmCodeTimer = null;
    }
}

function startConfirmCodePolling() {
    stopConfirmCodePolling();
    confirmCodeTimer = setInterval(() => {
        if (!currentWatcher || currentSetupContext?.provider !== "gmail") {
            stopConfirmCodePolling();
            return;
        }
        refreshConfirmCodeStatus().catch(console.error);
    }, 4000);
}

async function refreshSetupContext() {
    currentSetupContext = await getActiveSetupContext();
    renderSetupContext();
    await refreshConfirmCodeStatus();

    if (currentSetupContext?.provider === "gmail" && currentWatcher) {
        startConfirmCodePolling();
    } else {
        stopConfirmCodePolling();
    }
}

async function loadSetup() {
    updateSetupVisibility();
    hideStatus(document.getElementById("setup-automation-status"));

    if (!currentWatcher) {
        stopConfirmCodePolling();
        return;
    }

    document.getElementById("setup-address").textContent = getSetupAddress();

    try {
        const watcher = await vigilAPI.getWatcher(currentWatcher.id);
        currentWatcher = watcher;
        document.getElementById("setup-address").textContent = getSetupAddress();
        document.getElementById("setup-prompt").value = watcher.system_prompt || "";
        document.getElementById("setup-model").value = normalizeModel(watcher.model);
    } catch {
        document.getElementById("setup-prompt").value = currentWatcher.system_prompt || "";
        document.getElementById("setup-model").value = normalizeModel(currentWatcher.model);
    }

    await refreshSetupContext();
}

async function openProviderPage(provider) {
    const response = await chrome.runtime.sendMessage({
        type: "OPEN_PROVIDER_PAGE",
        provider,
        destination: "forwarding",
    });

    if (response?.error) {
        throw new Error(response.error);
    }

    setTimeout(() => {
        refreshSetupContext().catch(console.error);
    }, 800);
}

async function assistCurrentPage(options = {}) {
    if (!currentWatcher) {
        setStatus(document.getElementById("setup-automation-status"), "Create a watcher first.", "error");
        return;
    }

    currentSetupContext = await getActiveSetupContext();
    renderSetupContext();

    if (!currentSetupContext?.supported || !currentSetupContext.tabId) {
        setStatus(
            document.getElementById("setup-automation-status"),
            "Open Gmail or Outlook in the active tab before using setup assistance.",
            "error"
        );
        return;
    }

    try {
        const result = await chrome.tabs.sendMessage(currentSetupContext.tabId, {
            type: "APPLY_SETUP",
            address: getSetupAddress(),
            confirmCode: options.confirmCode || currentConfirmCode,
            save: currentSetupContext.provider === "outlook",
        });

        if (result?.error) {
            throw new Error(result.error);
        }

        setStatus(
            document.getElementById("setup-automation-status"),
            result?.message || "Setup assistance completed.",
            result?.ok ? "success" : "info"
        );

        currentSetupContext = await getActiveSetupContext();
        renderSetupContext();
        await refreshConfirmCodeStatus();
    } catch (error) {
        setStatus(document.getElementById("setup-automation-status"), error.message, "error");
    }
}

async function createWatcher() {
    const nameInput = document.getElementById("new-watcher-name");
    const notesInput = document.getElementById("new-watcher-notes");
    const status = document.getElementById("create-watcher-status");
    const name = nameInput.value.trim();
    const notes = notesInput.value.trim();

    if (!name) {
        setStatus(status, "Watcher name is required.", "error");
        return;
    }

    const systemPrompt = notes
        ? `${DEFAULT_WATCHER_PROMPT}\n\nAdditional instructions:\n${notes}`
        : DEFAULT_WATCHER_PROMPT;

    try {
        setStatus(status, "Creating watcher...", "info");
        const watcher = await vigilAPI.createWatcher(name, systemPrompt, "general");
        currentWatcher = watcher;
        nameInput.value = "";
        notesInput.value = "";
        await loadWatchers();
        setStatus(status, "Watcher created. Finish forwarding setup below.", "success");
        showView("setup");
    } catch (error) {
        setStatus(status, error.message, "error");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    window.onerror = function(message, src, line) {
        const error = document.createElement("div");
        error.style.cssText = "position:fixed;bottom:0;left:0;right:0;padding:12px;background:#8b4242;color:white;font-size:12px;z-index:9999;";
        error.textContent = `Error: ${message} (line ${line})`;
        document.body.appendChild(error);
    };

    document.querySelectorAll(".nav-tab").forEach((tab) => {
        tab.addEventListener("click", () => showView(tab.dataset.view));
    });

    document.getElementById("panel-btn-connect").addEventListener("click", async () => {
        const key = document.getElementById("panel-api-key").value.trim();
        if (!key) return;
        const error = document.getElementById("panel-auth-error");
        error.classList.add("hidden");

        try {
            await vigilAPI.loginWithApiKey(key);
            await loadWatchers();
            showAuthenticatedShell(currentWatcher ? "dashboard" : "setup");
        } catch (err) {
            error.textContent = err.message;
            error.classList.remove("hidden");
        }
    });

    document.getElementById("panel-btn-login").addEventListener("click", async () => {
        const email = document.getElementById("panel-email").value.trim();
        const password = document.getElementById("panel-password").value;
        if (!email || !password) return;
        const error = document.getElementById("panel-auth-error");
        error.classList.add("hidden");

        try {
            await vigilAPI.login(email, password);
            await loadWatchers();
            showAuthenticatedShell(currentWatcher ? "dashboard" : "setup");
        } catch (err) {
            error.textContent = err.message;
            error.classList.remove("hidden");
        }
    });

    document.getElementById("panel-api-key").addEventListener("keydown", (event) => {
        if (event.key === "Enter") document.getElementById("panel-btn-connect").click();
    });
    document.getElementById("panel-password").addEventListener("keydown", (event) => {
        if (event.key === "Enter") document.getElementById("panel-btn-login").click();
    });

    const chatInput = document.getElementById("chat-input");
    const sendButton = document.getElementById("btn-send");
    chatInput.addEventListener("input", () => {
        sendButton.disabled = !chatInput.value.trim() || !currentWatcher;
        chatInput.style.height = "auto";
        chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
    });
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (chatInput.value.trim()) sendChat();
        }
    });
    sendButton.addEventListener("click", sendChat);

    document.querySelectorAll(".chat-suggestion").forEach((button) => {
        button.addEventListener("click", () => {
            chatInput.value = button.dataset.msg;
            sendButton.disabled = !currentWatcher;
            sendChat();
        });
    });

    document.getElementById("btn-settings").addEventListener("click", () => showView("setup"));

    document.getElementById("watcher-select").addEventListener("change", (event) => {
        const watcher = watchers.find((item) => item.id === event.target.value);
        if (!watcher) return;
        currentWatcher = watcher;
        chatHistory = [];
        renderChat();
        if (document.getElementById("view-setup").classList.contains("active")) {
            loadSetup();
        } else {
            loadDashboard();
        }
    });

    document.getElementById("btn-copy-setup-address").addEventListener("click", async () => {
        const address = document.getElementById("setup-address").textContent;
        await navigator.clipboard.writeText(address);
        const button = document.getElementById("btn-copy-setup-address");
        button.textContent = "Copied";
        setTimeout(() => {
            button.textContent = "Copy";
        }, 2000);
    });

    document.getElementById("btn-open-gmail-settings").addEventListener("click", async () => {
        try {
            await openProviderPage("gmail");
        } catch (error) {
            setStatus(document.getElementById("setup-automation-status"), error.message, "error");
        }
    });

    document.getElementById("btn-open-outlook-settings").addEventListener("click", async () => {
        try {
            await openProviderPage("outlook");
        } catch (error) {
            setStatus(document.getElementById("setup-automation-status"), error.message, "error");
        }
    });

    document.getElementById("btn-refresh-setup-context").addEventListener("click", () => {
        refreshSetupContext().catch((error) => {
            setStatus(document.getElementById("setup-automation-status"), error.message, "error");
        });
    });

    document.getElementById("btn-assist-setup").addEventListener("click", () => {
        assistCurrentPage().catch(console.error);
    });

    document.getElementById("btn-insert-confirm-code").addEventListener("click", () => {
        if (currentConfirmCode) {
            assistCurrentPage({ confirmCode: currentConfirmCode }).catch(console.error);
        }
    });

    document.getElementById("btn-create-watcher").addEventListener("click", () => {
        createWatcher().catch(console.error);
    });

    document.getElementById("btn-save-config").addEventListener("click", async () => {
        if (!currentWatcher) return;
        const prompt = document.getElementById("setup-prompt").value.trim();
        const model = normalizeModel(document.getElementById("setup-model").value);
        const status = document.getElementById("config-status");

        try {
            const updates = {};
            if (prompt) updates.system_prompt = prompt;
            if (model) updates.model = model;
            const watcher = await vigilAPI.updateWatcher(currentWatcher.id, updates);
            currentWatcher = watcher;
            setStatus(status, "Saved.", "success");
        } catch (error) {
            setStatus(status, `Error: ${error.message}`, "error");
        }
    });

    document.getElementById("btn-logout").addEventListener("click", async () => {
        await vigilAPI.logout({ preserveApiBase: true });
        currentWatcher = null;
        watchers = [];
        chatHistory = [];
        showAuthShell();
    });

    renderChat();

    try {
        const authed = await vigilAPI.isAuthenticated();
        if (authed) {
            await loadWatchers();
            showAuthenticatedShell(currentWatcher ? "dashboard" : "setup");
            renderChat();
        }
    } catch (error) {
        console.error("[vigil] auth check failed:", error);
    }
});