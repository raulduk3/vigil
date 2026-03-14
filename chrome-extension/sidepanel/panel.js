/**
 * Side Panel Wizard — Step-by-step forwarding setup
 */

let currentStep = 1;
let selectedWatcher = null;
let detectedProvider = null;


// ============================================================================
// Step Navigation
// ============================================================================

function goToStep(step) {
    // Hide all steps
    document.querySelectorAll(".wizard-step").forEach(s => s.classList.remove("active"));
    // Show target step
    document.getElementById(`step-${step}`).classList.add("active");

    // Update indicators
    document.querySelectorAll(".step-indicator .step").forEach(s => {
        const n = parseInt(s.dataset.step);
        s.classList.remove("active", "done");
        if (n === step) s.classList.add("active");
        else if (n < step) s.classList.add("done");
    });

    // Update lines
    const lines = document.querySelectorAll(".step-line");
    lines.forEach((line, i) => {
        line.classList.toggle("done", i < step - 1);
    });

    currentStep = step;

    // Step-specific initialization
    if (step === 2) initStep2();
    if (step === 3) initStep3();
    if (step === 4) initStep4();
    if (step === 5) initStep5();
}

// ============================================================================
// Step 1: Authentication
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Check if already authenticated
    const authed = await vigilAPI.isAuthenticated();
    if (authed) {
        goToStep(2);
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
            goToStep(2);
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
            goToStep(2);
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
});

// ============================================================================
// Step 2: Provider Detection
// ============================================================================

async function initStep2() {
    const statusEl = document.getElementById("provider-status");
    const messageEl = document.getElementById("provider-message");

    // Check current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";

    if (url.includes("mail.google.com")) {
        detectedProvider = "gmail";
        statusEl.classList.add("found");
        messageEl.textContent = "Gmail detected! Ready to set up forwarding.";
        setTimeout(() => goToStep(3), 1500);
    } else if (url.includes("outlook.live.com") || url.includes("outlook.office.com")) {
        detectedProvider = "outlook";
        statusEl.classList.add("found");
        messageEl.textContent = "Outlook detected! Ready to set up forwarding.";
        setTimeout(() => goToStep(3), 1500);
    } else {
        messageEl.textContent = "Open Gmail or Outlook in this tab, then come back.";

        // Auto-detect when tab changes
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (info.url) {
                if (info.url.includes("mail.google.com")) {
                    detectedProvider = "gmail";
                    chrome.tabs.onUpdated.removeListener(listener);
                    goToStep(3);
                } else if (info.url.includes("outlook.live.com") || info.url.includes("outlook.office.com")) {
                    detectedProvider = "outlook";
                    chrome.tabs.onUpdated.removeListener(listener);
                    goToStep(3);
                }
            }
        });
    }
}

// ============================================================================
// Step 3: Watcher Selection
// ============================================================================

function buildSystemPrompt(intent) {
    if (!intent) {
        return `You monitor emails and focus on deadlines, obligations, and anything requiring action. Alert the user when someone is waiting on them or when a deadline is approaching. Ignore marketing, newsletters, and automated notifications unless they contain something actionable.`;
    }
    return `You are an email monitoring agent. Your instructions from the user:\n\n${intent}\n\nCore behavior:\n- Track deadlines, obligations, and anything requiring the user's action.\n- Alert when someone is waiting on the user or a deadline is approaching.\n- Remember patterns across emails (sender behavior, recurring topics, payment schedules).\n- Ignore noise unless the user's instructions say otherwise.\n- When in doubt about urgency, err on the side of alerting.`;
}

async function initStep3() {
    const listEl = document.getElementById("watcher-list");
    const errorEl = document.getElementById("watcher-error");
    const intentEl = document.getElementById("watcher-intent");

    try {
        const watchers = await vigilAPI.getWatchers();
        listEl.innerHTML = "";

        if (watchers.length > 0) {
            for (const w of watchers) {
                const item = document.createElement("div");
                item.className = "watcher-item";
                const stats = [
                    `${(w.total_emails || 0).toLocaleString()} emails`,
                    `${w.active_threads || 0} threads`,
                    `${w.memories || 0} memories`,
                ].join(" · ");
                item.innerHTML = `
                    <div class="name">${escapeHtml(w.name)}</div>
                    <div class="meta">${stats}</div>
                `;
                item.addEventListener("click", async () => {
                    document.querySelectorAll(".watcher-item").forEach(i => i.classList.remove("selected"));
                    item.classList.add("selected");
                    selectedWatcher = w;

                    // If user typed instructions, update the watcher's prompt
                    const intent = intentEl.value.trim();
                    if (intent) {
                        try {
                            const prompt = buildSystemPrompt(intent);
                            await vigilAPI.updateWatcher(w.id, { system_prompt: prompt });
                            console.log("[vigil] updated watcher prompt with user intent");
                        } catch (e) {
                            console.warn("[vigil] failed to update watcher prompt:", e);
                        }
                    }

                    goToStep(4);
                });
                listEl.appendChild(item);
            }
        } else {
            listEl.innerHTML = '<p class="step-desc">No watchers yet. Create one below.</p>';
        }
    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.classList.remove("hidden");
    }

    // Create watcher
    document.getElementById("btn-create-watcher").addEventListener("click", async () => {
        const name = document.getElementById("watcher-name").value.trim();
        const intent = intentEl.value.trim();
        if (!name) return;

        errorEl.classList.add("hidden");
        try {
            const prompt = buildSystemPrompt(intent);
            const watcher = await vigilAPI.createWatcher(name, prompt);
            selectedWatcher = watcher;
            goToStep(4);
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.classList.remove("hidden");
        }
    });
}

// ============================================================================
// Step 4: Forwarding Setup
// ============================================================================

function parseIntentToFilters(intent) {
    if (!intent) return [];

    const filters = [];
    const lower = intent.toLowerCase();

    // Extract email addresses
    const emailMatches = intent.match(/[\w.-]+@[\w.-]+\.\w+/g);
    if (emailMatches) {
        filters.push({ field: "From", value: emailMatches.join(" OR "), type: "from" });
    }

    // Extract domain patterns
    const domainMatches = intent.match(/@([\w.-]+\.\w+)/g);
    if (domainMatches && !emailMatches) {
        const domains = domainMatches.map(d => d.slice(1));
        filters.push({ field: "From", value: domains.map(d => `@${d}`).join(" OR "), type: "from" });
    }

    // Extract subject keywords
    const subjectKeywords = [];
    const subjectPatterns = [
        /invoic/i, /payment/i, /deadline/i, /urgent/i, /overdue/i,
        /contract/i, /proposal/i, /quote/i, /estimate/i, /receipt/i,
        /ticket/i, /support/i, /bug/i, /incident/i, /alert/i,
    ];
    for (const p of subjectPatterns) {
        if (p.test(lower)) {
            subjectKeywords.push(p.source.replace(/\\i?/g, "").replace(/\//g, ""));
        }
    }
    if (subjectKeywords.length > 0) {
        filters.push({ field: "Subject", value: subjectKeywords.join(" OR "), type: "subject" });
    }

    // Detect "client" or "work" patterns
    if (/client/i.test(lower) || /customer/i.test(lower) || /vendor/i.test(lower)) {
        if (filters.length === 0) {
            filters.push({ field: "Has the words", value: "reply needed OR action required OR follow up OR awaiting", type: "words" });
        }
    }

    // If nothing specific was extracted, suggest forwarding all
    if (filters.length === 0 && intent.length > 10) {
        const words = intent.split(/\s+/).filter(w => w.length > 4).slice(0, 4);
        if (words.length > 0) {
            filters.push({ field: "Has the words", value: words.join(" OR "), type: "words" });
        }
    }

    return filters;
}

function renderFilterSuggestions(containerId, filters, provider) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    if (filters.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:#787874;">Tip: You can filter by sender (From), subject, or keywords. The agent handles the rest with its instructions.</p>';
        return;
    }

    for (const f of filters) {
        const div = document.createElement("div");
        div.className = "filter-suggestion";
        div.innerHTML = `<span class="filter-field">${escapeHtml(f.field)}:</span> <span class="filter-value">${escapeHtml(f.value)}</span>`;
        container.appendChild(div);
    }

    const tip = document.createElement("p");
    tip.style.cssText = "font-size:11px;color:#787874;margin-top:6px;";
    if (provider === "gmail") {
        tip.textContent = "Enter these in Gmail's filter creation form. You can combine multiple fields.";
    } else {
        tip.textContent = "Use these as conditions in your Outlook rule.";
    }
    container.appendChild(tip);
}

let forwardingApproach = "all";

async function initStep4() {
    if (!selectedWatcher) return;

    // Build forwarding address
    const slug = selectedWatcher.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const token = selectedWatcher.ingest_token || selectedWatcher.ingestion_address?.split("@")[0]?.split("-").pop();
    const address = selectedWatcher.ingestion_address || `${slug}-${token}@vigil.run`;

    document.getElementById("forwarding-address").textContent = address;

    // Get the user's intent for filter suggestions
    const intent = document.getElementById("watcher-intent")?.value?.trim() || "";
    const filters = parseIntentToFilters(intent);

    // Approach toggle
    const btnAll = document.getElementById("btn-forward-all");
    const btnFilter = document.getElementById("btn-forward-filter");

    function showSteps() {
        // Hide all step sets
        document.getElementById("gmail-steps").classList.add("hidden");
        document.getElementById("gmail-filter-steps").classList.add("hidden");
        document.getElementById("outlook-steps").classList.add("hidden");
        document.getElementById("outlook-rule-steps").classList.add("hidden");

        if (detectedProvider === "gmail") {
            if (forwardingApproach === "all") {
                document.getElementById("gmail-steps").classList.remove("hidden");
            } else {
                document.getElementById("gmail-filter-steps").classList.remove("hidden");
                renderFilterSuggestions("gmail-filter-suggestions", filters, "gmail");
            }
        } else if (detectedProvider === "outlook") {
            if (forwardingApproach === "all") {
                document.getElementById("outlook-steps").classList.remove("hidden");
            } else {
                document.getElementById("outlook-rule-steps").classList.remove("hidden");
                renderFilterSuggestions("outlook-rule-suggestions", filters, "outlook");
            }
        }
    }

    btnAll.addEventListener("click", () => {
        forwardingApproach = "all";
        btnAll.classList.add("active");
        btnFilter.classList.remove("active");
        showSteps();
    });

    btnFilter.addEventListener("click", () => {
        forwardingApproach = "filter";
        btnFilter.classList.add("active");
        btnAll.classList.remove("active");
        showSteps();
    });

    // If user provided specific filters in their intent, default to filter mode
    if (filters.length > 0) {
        forwardingApproach = "filter";
        btnFilter.classList.add("active");
        btnAll.classList.remove("active");
    }

    showSteps();

    document.getElementById("forwarding-instructions").textContent =
        detectedProvider === "gmail"
            ? "Follow these steps to forward your Gmail to Vigil."
            : "Follow these steps to forward your Outlook email to Vigil.";

    // Copy address button
    document.getElementById("btn-copy-address").addEventListener("click", () => {
        navigator.clipboard.writeText(address);
        document.getElementById("btn-copy-address").textContent = "Copied";
        setTimeout(() => document.getElementById("btn-copy-address").textContent = "Copy", 2000);
    });

    // Gmail settings buttons
    document.getElementById("btn-gmail-settings")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://mail.google.com/mail/u/0/#settings/fwdandpop" });
        });
    });
    document.getElementById("btn-gmail-settings-filter")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://mail.google.com/mail/u/0/#settings/fwdandpop" });
        });
    });
    document.getElementById("btn-gmail-filters")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://mail.google.com/mail/u/0/#settings/filters" });
        });
    });

    // Outlook settings buttons
    document.getElementById("btn-outlook-settings")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://outlook.live.com/mail/0/options/mail/forwarding" });
        });
    });
    document.getElementById("btn-outlook-rules")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://outlook.live.com/mail/0/options/mail/rules" });
        });
    });

    // Verify button
    document.getElementById("btn-verify-forwarding").addEventListener("click", async () => {
        const btn = document.getElementById("btn-verify-forwarding");
        btn.textContent = "Checking...";
        btn.disabled = true;
        try {
            const status = await vigilAPI.getForwardingStatus(selectedWatcher.id);
            if (status.forwarding_active) {
                goToStep(5);
            } else {
                btn.textContent = "No emails received yet. Forwarding may take a moment.";
                setTimeout(() => {
                    btn.textContent = "Check Forwarding Status";
                    btn.disabled = false;
                }, 3000);
            }
        } catch (e) {
            console.error("Verify failed:", e);
            btn.textContent = "Check Forwarding Status";
            btn.disabled = false;
        }
    });

    // Skip button
    document.getElementById("btn-skip-verify").addEventListener("click", () => {
        goToStep(5);
    });
}



// ============================================================================
// Step 5: Confirmation
// ============================================================================

async function initStep5() {
    if (!selectedWatcher) return;

    // Fetch all stats in parallel
    const [statusResult, usageResult, watcherResult] = await Promise.allSettled([
        vigilAPI.getForwardingStatus(selectedWatcher.id),
        vigilAPI.getUsage(),
        vigilAPI.getWatcher(selectedWatcher.id),
    ]);

    const status = statusResult.status === "fulfilled" ? statusResult.value : null;
    const usage = usageResult.status === "fulfilled" ? usageResult.value?.usage : null;
    const watcher = watcherResult.status === "fulfilled" ? watcherResult.value : null;

    // Find this watcher's usage stats
    const watcherUsage = usage?.watchers?.find(w => w.watcher_id === selectedWatcher.id);

    // Status
    const active = status?.forwarding_active ?? false;
    document.getElementById("status-active").textContent = active ? "Active" : "Waiting...";
    document.getElementById("status-active").style.color = active ? "#3d6b4f" : "#8b7234";

    // Email counts
    document.getElementById("status-total-emails").textContent =
        (watcherUsage?.emails ?? status?.total_emails ?? 0).toLocaleString();
    document.getElementById("status-email-count").textContent =
        (status?.emails_24h ?? 0).toLocaleString();

    // Agent stats
    document.getElementById("status-invocations").textContent =
        (watcherUsage?.invocations ?? 0).toLocaleString();
    document.getElementById("status-alerts").textContent =
        (watcherUsage?.alerts ?? 0).toLocaleString();

    // Last email
    document.getElementById("status-last-email").textContent = status?.last_email_at
        ? new Date(status.last_email_at).toLocaleString()
        : "No emails yet";

    // Model
    document.getElementById("status-model").textContent =
        watcher?.model ?? selectedWatcher.model ?? "—";

    // Cost
    const cost = watcherUsage?.cost ?? 0;
    document.getElementById("status-cost").textContent =
        cost > 0 ? `$${cost.toFixed(4)}` : "$0.00";

    document.getElementById("btn-restart").addEventListener("click", () => {
        selectedWatcher = null;
        detectedProvider = null;
        goToStep(2);
    });
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
