/**
 * Vigil Extension — Background Service Worker
 */

// Set side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "DETECT_PROVIDER") {
        const url = sender.tab?.url || "";
        if (url.includes("mail.google.com")) {
            sendResponse({ provider: "gmail" });
        } else if (url.includes("outlook.live.com") || url.includes("outlook.office.com")) {
            sendResponse({ provider: "outlook" });
        } else {
            sendResponse({ provider: null });
        }
        return false;
    }

    sendResponse({ error: "unknown message type" });
    return false;
});
