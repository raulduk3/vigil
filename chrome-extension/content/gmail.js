/**
 * Gmail Content Script
 * Assists with Gmail forwarding setup.
 * NEVER reads email content — only interacts with the settings UI.
 */

(function() {
    function getForwardingUrl() {
        const match = window.location.pathname.match(/^\/mail\/u\/[^/]+\//);
        const basePath = match?.[0] || "/mail/u/0/";
        return `${window.location.origin}${basePath}#settings/fwdandpop`;
    }

    function isForwardingPage() {
        return window.location.href.includes("#settings/fwdandpop");
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    function textOf(element) {
        return (element?.innerText || element?.textContent || element?.value || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function highlight(element) {
        if (!element) return;
        element.style.outline = "3px solid #2d5261";
        element.style.outlineOffset = "2px";
        element.style.borderRadius = "4px";
    }

    function attachHint(element, message) {
        if (!element || element.dataset.vigilHintAttached === "true") return;
        const hint = document.createElement("div");
        hint.textContent = message;
        hint.style.cssText = [
            "margin-top: 6px",
            "padding: 6px 10px",
            "background: #0B1F2A",
            "color: #f8f8f7",
            "border-radius: 4px",
            "font-size: 12px",
            "font-weight: 600",
            "width: fit-content",
            "max-width: 320px",
            "box-shadow: 0 2px 8px rgba(0,0,0,0.15)",
        ].join(";");

        const parent = element.parentElement || element;
        parent.appendChild(hint);
        element.dataset.vigilHintAttached = "true";
        setTimeout(() => {
            hint.remove();
            element.dataset.vigilHintAttached = "false";
        }, 10000);
    }

    function setNativeValue(element, value) {
        const prototype = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        descriptor?.set?.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function findButton(matchers) {
        const patterns = matchers.map((matcher) => matcher instanceof RegExp ? matcher : new RegExp(matcher, "i"));
        const elements = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], div[role="button"]'));
        return elements.find((element) => isVisible(element) && patterns.some((pattern) => pattern.test(textOf(element))));
    }

    function findForwardingDialog() {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        return dialogs.find((dialog) => isVisible(dialog) && /forward|confirm|verification/.test(textOf(dialog))) || null;
    }

    function findAddressInput() {
        const dialog = findForwardingDialog();
        const scope = dialog || document;
        const inputs = Array.from(scope.querySelectorAll('input[type="email"], input[type="text"]'));
        return inputs.find((input) => {
            if (!isVisible(input)) return false;
            const contextText = textOf(input.closest('[role="dialog"], tr, td, div, form') || input.parentElement);
            return /forward|email|address/.test(contextText) && !/search|filter/.test(contextText);
        }) || null;
    }

    function findConfirmCodeInput() {
        const dialog = findForwardingDialog();
        const scope = dialog || document;
        const inputs = Array.from(scope.querySelectorAll('input[type="text"], input[type="number"]'));
        return inputs.find((input) => {
            if (!isVisible(input)) return false;
            const contextText = textOf(input.closest('[role="dialog"], tr, td, div, form') || input.parentElement);
            return /confirm|verification|code/.test(contextText);
        }) || null;
    }

    function describeState() {
        const addButton = findButton([/add a forwarding address/i, /add forwarding/i]);
        const addressInput = findAddressInput();
        const confirmCodeInput = findConfirmCodeInput();
        const proceedButton = findButton([/next/i, /proceed/i, /ok/i, /verify/i, /save changes/i]);

        return {
            provider: "gmail",
            onForwardingPage: isForwardingPage(),
            ready: isForwardingPage(),
            actions: {
                openDialog: Boolean(addButton),
                fillAddress: Boolean(addressInput),
                fillConfirmCode: Boolean(confirmCodeInput),
                proceed: Boolean(proceedButton),
            },
            note: !isForwardingPage()
                ? "Open Gmail forwarding settings first."
                : confirmCodeInput
                    ? "Confirmation dialog detected."
                    : addressInput
                        ? "Forwarding address dialog detected."
                        : addButton
                            ? "Ready to open the Add forwarding address dialog."
                            : "Forwarding settings are open.",
        };
    }

    function applySetup(address, confirmCode) {
        if (!isForwardingPage()) {
            window.location.href = getForwardingUrl();
            return { ok: true, navigating: true, message: "Opened Gmail forwarding settings." };
        }

        const actions = [];
        const addButton = findButton([/add a forwarding address/i, /add forwarding/i]);
        const addressInput = findAddressInput();
        const confirmInput = findConfirmCodeInput();
        const proceedButton = findButton([/next/i, /proceed/i, /ok/i, /verify/i, /save changes/i]);

        if (addressInput && address) {
            setNativeValue(addressInput, address);
            highlight(addressInput);
            attachHint(addressInput, "Vigil filled your forwarding address.");
            actions.push("Filled the forwarding address.");
        } else if (!addressInput && addButton) {
            addButton.click();
            highlight(addButton);
            attachHint(addButton, "Dialog opened. Run Assist again if Gmail does not auto-focus the input.");
            actions.push("Opened the Add forwarding address dialog.");
        }

        if (confirmInput && confirmCode) {
            setNativeValue(confirmInput, confirmCode);
            highlight(confirmInput);
            attachHint(confirmInput, "Vigil inserted the Gmail confirmation code.");
            actions.push("Inserted the confirmation code.");
        }

        if (proceedButton) {
            highlight(proceedButton);
            attachHint(proceedButton, "Use this button to continue or save the Gmail forwarding flow.");
        }

        return {
            ok: actions.length > 0,
            waitingForCode: Boolean(addressInput && address && !confirmCode),
            message: actions.length > 0
                ? actions.join(" ")
                : "Open Gmail forwarding settings, then use Add forwarding address or the confirmation dialog before running Assist again.",
            state: describeState(),
        };
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "GET_SETUP_STATE") {
            sendResponse(describeState());
            return false;
        }

        if (message.type === "APPLY_SETUP") {
            sendResponse(applySetup(message.address, message.confirmCode));
            return false;
        }

        if (message.type === "NAVIGATE_TO_FORWARDING") {
            window.location.href = getForwardingUrl();
            sendResponse({ ok: true, navigating: true });
            return false;
        }

        sendResponse({ error: "Unsupported Gmail helper action" });
        return false;
    });
})();
