/**
 * Popup Logic
 */

document.addEventListener("DOMContentLoaded", async () => {
    const authSection = document.getElementById("auth-section");
    const connectedSection = document.getElementById("connected-section");
    const authError = document.getElementById("auth-error");
    const activeContext = document.getElementById("active-context");

    async function getActiveContext() {
        return chrome.runtime.sendMessage({ type: "GET_ACTIVE_CONTEXT" });
    }

    async function refreshContextCopy() {
        try {
            const context = await getActiveContext();
            if (context?.provider === "gmail") {
                activeContext.textContent = "Gmail detected in your active tab. Open the setup panel to finish forwarding.";
            } else if (context?.provider === "outlook") {
                activeContext.textContent = "Outlook detected in your active tab. Open the setup panel to finish forwarding.";
            } else {
                activeContext.textContent = "Open Gmail or Outlook, or jump there directly from below.";
            }
        } catch {
            activeContext.textContent = "Open Gmail or Outlook, then continue in the setup panel.";
        }
    }

    // Tab switching
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        });
    });

    // Check auth state
    const authed = await vigilAPI.isAuthenticated();
    if (authed) {
        authSection.classList.add("hidden");
        connectedSection.classList.remove("hidden");
        await refreshContextCopy();
    }

    // API Key login
    document.getElementById("btn-apikey").addEventListener("click", async () => {
        const key = document.getElementById("api-key").value.trim();
        if (!key) return;
        
        authError.classList.add("hidden");
        try {
            await vigilAPI.loginWithApiKey(key);
            authSection.classList.add("hidden");
            connectedSection.classList.remove("hidden");
            await refreshContextCopy();
        } catch (err) {
            authError.textContent = err.message;
            authError.classList.remove("hidden");
        }
    });

    // Email/password login
    document.getElementById("btn-login").addEventListener("click", async () => {
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        if (!email || !password) return;

        authError.classList.add("hidden");
        try {
            await vigilAPI.login(email, password);
            authSection.classList.add("hidden");
            connectedSection.classList.remove("hidden");
            await refreshContextCopy();
        } catch (err) {
            authError.textContent = err.message;
            authError.classList.remove("hidden");
        }
    });

    // Open setup wizard
    document.getElementById("btn-setup").addEventListener("click", async () => {
        const context = await getActiveContext();
        if (context?.tabId) {
            await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL", tabId: context.tabId });
        }
        window.close();
    });

    document.getElementById("btn-open-gmail").addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "OPEN_PROVIDER_PAGE", provider: "gmail", destination: "forwarding" });
        await refreshContextCopy();
    });

    document.getElementById("btn-open-outlook").addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "OPEN_PROVIDER_PAGE", provider: "outlook", destination: "forwarding" });
        await refreshContextCopy();
    });

    // Logout
    document.getElementById("btn-logout").addEventListener("click", async () => {
        await vigilAPI.logout({ preserveApiBase: true });
        connectedSection.classList.add("hidden");
        authSection.classList.remove("hidden");
    });

    // Enter key on inputs
    document.getElementById("api-key").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("btn-apikey").click();
    });
    document.getElementById("password").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("btn-login").click();
    });
});
