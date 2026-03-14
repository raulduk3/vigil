/**
 * Vigil Extension — Background Service Worker
 */

// Set side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

const PROVIDER_URLS = {
    gmail: {
        forwarding: "https://mail.google.com/mail/u/0/#settings/fwdandpop",
        filters: "https://mail.google.com/mail/u/0/#settings/filters",
    },
    outlook: {
        forwarding: "https://outlook.live.com/mail/0/options/mail/forwarding",
    },
};

function getProviderFromUrl(url = "") {
    if (url.includes("mail.google.com")) return "gmail";
    if (url.includes("outlook.live.com") || url.includes("outlook.office.com")) return "outlook";
    return null;
}

function getProviderUrl(provider, destination = "forwarding", activeUrl = "") {
    if (provider === "outlook" && activeUrl.includes("outlook.office.com")) {
        if (destination === "forwarding") {
            return "https://outlook.office.com/mail/options/mail/forwarding";
        }
    }

    return PROVIDER_URLS[provider]?.[destination] || null;
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
        chrome.tabs.create({ url: chrome.runtime.getURL("getting-started.html") }).catch(console.error);
    }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (message.type === "DETECT_PROVIDER") {
            return { provider: getProviderFromUrl(sender.tab?.url || "") };
        }

        if (message.type === "GET_ACTIVE_CONTEXT") {
            const tab = await getActiveTab();
            const url = tab?.url || "";
            const provider = getProviderFromUrl(url);
            return {
                tabId: tab?.id || null,
                url,
                provider,
                supported: Boolean(provider),
            };
        }

        if (message.type === "OPEN_PROVIDER_PAGE") {
            const provider = message.provider;
            const destination = message.destination || "forwarding";
            const tab = await getActiveTab();
            const url = getProviderUrl(provider, destination, tab?.url || "");

            if (!url) {
                throw new Error("Unsupported provider page");
            }

            if (tab?.id) {
                await chrome.tabs.update(tab.id, { url });
                return { ok: true, url, tabId: tab.id };
            }

            const created = await chrome.tabs.create({ url });
            return { ok: true, url, tabId: created.id || null };
        }

        if (message.type === "OPEN_SIDE_PANEL") {
            const tabId = message.tabId || (await getActiveTab())?.id;
            if (!tabId) {
                throw new Error("No active tab available");
            }

            await chrome.sidePanel.open({ tabId });
            return { ok: true, tabId };
        }

        return { error: "unknown message type" };
    })()
        .then(sendResponse)
        .catch((error) => {
            sendResponse({ error: error.message || "Unknown extension error" });
        });

    return true;
});
