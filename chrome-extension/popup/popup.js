/**
 * Popup Logic
 */

document.addEventListener("DOMContentLoaded", async () => {
    const authSection = document.getElementById("auth-section");
    const connectedSection = document.getElementById("connected-section");
    const authError = document.getElementById("auth-error");

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
        } catch (err) {
            authError.textContent = err.message;
            authError.classList.remove("hidden");
        }
    });

    // Open setup wizard
    document.getElementById("btn-setup").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            await chrome.sidePanel.open({ tabId: tab.id });
            window.close();
        }
    });

    // Logout
    document.getElementById("btn-logout").addEventListener("click", async () => {
        await vigilAPI.logout();
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
