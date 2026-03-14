/**
 * Gmail Content Script
 * Detects Gmail forwarding settings page and assists with setup.
 * NEVER reads email content — only interacts with the settings UI.
 */

(function() {
    // Only activate on the forwarding settings page
    function isForwardingPage() {
        return window.location.hash.includes("settings/fwdandpop");
    }

    // Notify the extension that we're on Gmail
    chrome.runtime.sendMessage({ type: "GMAIL_DETECTED" });

    // Watch for settings page navigation
    let lastHash = window.location.hash;
    const hashObserver = setInterval(() => {
        if (window.location.hash !== lastHash) {
            lastHash = window.location.hash;
            if (isForwardingPage()) {
                highlightForwardingSection();
            }
        }
    }, 1000);

    function highlightForwardingSection() {
        // Gmail's forwarding section uses specific class patterns
        // Add a subtle highlight to help users find the right controls
        setTimeout(() => {
            // Look for the "Add a forwarding address" button
            const buttons = document.querySelectorAll('input[type="button"], button');
            buttons.forEach(btn => {
                const text = btn.value || btn.textContent || "";
                if (text.toLowerCase().includes("add a forwarding address") ||
                    text.toLowerCase().includes("add forwarding")) {
                    btn.style.outline = "3px solid #0d9488";
                    btn.style.outlineOffset = "2px";
                    btn.style.borderRadius = "4px";
                    
                    // Add a small tooltip
                    const tip = document.createElement("div");
                    tip.textContent = "👁️ Click here to add your Vigil address";
                    tip.style.cssText = `
                        position: absolute;
                        background: #0d9488;
                        color: white;
                        padding: 6px 12px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        margin-top: 4px;
                        z-index: 10000;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    `;
                    btn.parentElement.style.position = "relative";
                    btn.parentElement.appendChild(tip);

                    // Remove after 10 seconds
                    setTimeout(() => tip.remove(), 10000);
                }
            });
        }, 2000); // Wait for Gmail settings to render
    }

    // Initial check
    if (isForwardingPage()) {
        highlightForwardingSection();
    }

    // Clean up on unload
    window.addEventListener("unload", () => {
        clearInterval(hashObserver);
    });
})();
