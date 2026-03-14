/**
 * Outlook Content Script
 * Detects Outlook forwarding settings page and assists with setup.
 * NEVER reads email content — only interacts with the settings UI.
 */

(function() {
    function isForwardingPage() {
        return window.location.href.includes("options/mail/forwarding");
    }

    // Notify the extension
    chrome.runtime.sendMessage({ type: "OUTLOOK_DETECTED" });

    function highlightForwardingSection() {
        setTimeout(() => {
            // Outlook's forwarding toggle and input field
            const toggles = document.querySelectorAll('[role="switch"], [type="checkbox"]');
            const inputs = document.querySelectorAll('input[type="email"], input[type="text"]');

            toggles.forEach(toggle => {
                const label = toggle.closest("div")?.textContent || "";
                if (label.toLowerCase().includes("forwarding") || label.toLowerCase().includes("forward")) {
                    toggle.style.outline = "3px solid #0d9488";
                    toggle.style.outlineOffset = "2px";
                }
            });

            inputs.forEach(input => {
                const placeholder = (input.placeholder || "").toLowerCase();
                const label = input.closest("div")?.textContent || "";
                if (placeholder.includes("email") || label.toLowerCase().includes("forward")) {
                    input.style.outline = "3px solid #0d9488";
                    input.style.outlineOffset = "2px";

                    const tip = document.createElement("div");
                    tip.textContent = "👁️ Paste your Vigil forwarding address here";
                    tip.style.cssText = `
                        background: #0d9488;
                        color: white;
                        padding: 6px 12px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        margin-top: 4px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    `;
                    input.parentElement.appendChild(tip);
                    setTimeout(() => tip.remove(), 10000);
                }
            });
        }, 3000);
    }

    if (isForwardingPage()) {
        highlightForwardingSection();
    }

    // Watch for SPA navigation
    const observer = new MutationObserver(() => {
        if (isForwardingPage()) {
            highlightForwardingSection();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
