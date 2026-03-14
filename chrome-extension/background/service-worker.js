/**
 * Vigil Extension — Background Service Worker
 */

// Open side panel when extension icon clicked on supported pages
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
    }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "OPEN_SIDE_PANEL") {
        chrome.sidePanel.open({ tabId: sender.tab?.id });
        sendResponse({ ok: true });
    }

    if (message.type === "DETECT_PROVIDER") {
        const url = sender.tab?.url || "";
        if (url.includes("mail.google.com")) {
            sendResponse({ provider: "gmail" });
        } else if (url.includes("outlook.live.com") || url.includes("outlook.office.com")) {
            sendResponse({ provider: "outlook" });
        } else {
            sendResponse({ provider: null });
        }
    }

    if (message.type === "NAVIGATE_TAB") {
        chrome.tabs.update(sender.tab?.id, { url: message.url });
        sendResponse({ ok: true });
    }

    return true; // keep channel open for async responses
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
