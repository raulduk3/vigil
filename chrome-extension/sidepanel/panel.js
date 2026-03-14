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
                item.innerHTML = `
                    <div class="name">${escapeHtml(w.name)}</div>
                    <div class="meta">${w.total_emails || 0} emails · ${w.status}</div>
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

async function initStep4() {
    if (!selectedWatcher) return;

    // Build forwarding address
    const slug = selectedWatcher.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const token = selectedWatcher.ingest_token;
    const address = `${slug}-${token}@vigil.run`;

    document.getElementById("forwarding-address").textContent = address;

    // Show provider-specific steps
    document.getElementById("gmail-steps").classList.toggle("hidden", detectedProvider !== "gmail");
    document.getElementById("outlook-steps").classList.toggle("hidden", detectedProvider !== "outlook");

    if (detectedProvider === "gmail") {
        document.getElementById("forwarding-instructions").textContent =
            "Follow these steps to forward your Gmail to Vigil.";
    } else {
        document.getElementById("forwarding-instructions").textContent =
            "Follow these steps to forward your Outlook email to Vigil.";
    }

    // Copy address button
    document.getElementById("btn-copy-address").addEventListener("click", () => {
        navigator.clipboard.writeText(address);
        document.getElementById("btn-copy-address").textContent = "Copied";
        setTimeout(() => document.getElementById("btn-copy-address").textContent = "Copy", 2000);
    });

    // Gmail settings button
    document.getElementById("btn-gmail-settings")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://mail.google.com/mail/u/0/#settings/fwdandpop" });
        });
    });

    // Outlook settings button
    document.getElementById("btn-outlook-settings")?.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            chrome.tabs.update(tab.id, { url: "https://outlook.live.com/mail/0/options/mail/forwarding" });
        });
    });

    // Verify button — checks if emails are flowing
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

    // Skip button — user confirms they've set it up
    document.getElementById("btn-skip-verify").addEventListener("click", () => {
        goToStep(5);
    });
}



// ============================================================================
// Step 5: Confirmation
// ============================================================================

async function initStep5() {
    if (!selectedWatcher) return;

    try {
        const status = await vigilAPI.getForwardingStatus(selectedWatcher.id);
        document.getElementById("status-active").textContent = status.forwarding_active ? "Active" : "Waiting...";
        document.getElementById("status-active").style.color = status.forwarding_active ? "#3d6b4f" : "#8b7234";
        document.getElementById("status-last-email").textContent = status.last_email_at
            ? new Date(status.last_email_at).toLocaleString()
            : "—";
        document.getElementById("status-email-count").textContent = status.emails_24h || "0";
    } catch (e) {
        console.error("Status check failed:", e);
    }

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
