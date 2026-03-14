/**
 * Gmail Content Script
 * Detects Gmail forwarding settings page and assists with setup.
 * NEVER reads email content — only interacts with the settings UI.
 */

(function() {
    function isForwardingPage() {
        return window.location.hash.includes("settings/fwdandpop");
    }

    function highlightForwardingSection() {
        setTimeout(() => {
            const buttons = document.querySelectorAll('input[type="button"], button');
            buttons.forEach(btn => {
                const text = btn.value || btn.textContent || "";
                if (text.toLowerCase().includes("add a forwarding address") ||
                    text.toLowerCase().includes("add forwarding")) {
                    btn.style.outline = "3px solid #2d5261";
                    btn.style.outlineOffset = "2px";
                    btn.style.borderRadius = "4px";
                    
                    const tip = document.createElement("div");
                    tip.textContent = "Click here to add your Vigil address";
                    tip.style.cssText = `
                        position: absolute;
                        background: #0B1F2A;
                        color: #f8f8f7;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 600;
                        margin-top: 4px;
                        z-index: 10000;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    `;
                    btn.parentElement.style.position = "relative";
                    btn.parentElement.appendChild(tip);
                    setTimeout(() => tip.remove(), 10000);
                }
            });
        }, 2000);
    }

    if (isForwardingPage()) {
        highlightForwardingSection();
    }

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

    window.addEventListener("unload", () => {
        clearInterval(hashObserver);
    });
})();
