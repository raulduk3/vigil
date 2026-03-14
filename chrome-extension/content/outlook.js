/**
 * Outlook Content Script
 * Assists with Outlook forwarding setup.
 * NEVER reads email content — only interacts with the settings UI.
 */

(function() {
    function getForwardingUrl() {
        return window.location.origin.includes("outlook.office.com")
            ? `${window.location.origin}/mail/options/mail/forwarding`
            : `${window.location.origin}/mail/0/options/mail/forwarding`;
    }

    function isForwardingPage() {
        return window.location.href.includes("options/mail/forwarding");
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

    function setNativeValue(element, value) {
        const prototype = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        descriptor?.set?.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function findToggle() {
        const toggles = Array.from(document.querySelectorAll('[role="switch"], input[type="checkbox"]'));
        return toggles.find((toggle) => {
            if (!isVisible(toggle)) return false;
            const contextText = textOf(toggle.closest('label, div, section, form') || toggle.parentElement);
            return /forward/.test(contextText);
        }) || null;
    }

    function findAddressInput() {
        const inputs = Array.from(document.querySelectorAll('input[type="email"], input[type="text"]'));
        return inputs.find((input) => {
            if (!isVisible(input)) return false;
            const contextText = textOf(input.closest('label, div, section, form') || input.parentElement);
            return /forward|email|address/.test(contextText);
        }) || null;
    }

    function findKeepCopyControl() {
        const inputs = Array.from(document.querySelectorAll('[role="checkbox"], input[type="checkbox"]'));
        return inputs.find((input) => {
            if (!isVisible(input)) return false;
            const contextText = textOf(input.closest('label, div, section, form') || input.parentElement);
            return /keep a copy|keep copy|forwarded messages/.test(contextText);
        }) || null;
    }

    function findSaveButton() {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        return buttons.find((button) => isVisible(button) && /save/.test(textOf(button))) || null;
    }

    function isChecked(element) {
        if (!element) return false;
        if (element.matches('[role="switch"], [role="checkbox"]')) {
            return element.getAttribute('aria-checked') === 'true';
        }
        return Boolean(element.checked);
    }

    function toggleOn(element) {
        if (!element || isChecked(element)) return false;
        element.click();
        return true;
    }

    function describeState() {
        const toggle = findToggle();
        const input = findAddressInput();
        const keepCopy = findKeepCopyControl();
        const saveButton = findSaveButton();

        return {
            provider: 'outlook',
            onForwardingPage: isForwardingPage(),
            ready: isForwardingPage(),
            actions: {
                enableForwarding: Boolean(toggle),
                fillAddress: Boolean(input),
                keepCopy: Boolean(keepCopy),
                save: Boolean(saveButton),
            },
            note: !isForwardingPage()
                ? 'Open Outlook forwarding settings first.'
                : 'Outlook forwarding controls are available.',
        };
    }

    function applySetup(address, shouldSave) {
        if (!isForwardingPage()) {
            window.location.href = getForwardingUrl();
            return { ok: true, navigating: true, message: 'Opened Outlook forwarding settings.' };
        }

        const actions = [];
        const toggle = findToggle();
        const input = findAddressInput();
        const keepCopy = findKeepCopyControl();
        const saveButton = findSaveButton();

        if (toggleOn(toggle)) {
            highlight(toggle);
            actions.push('Enabled forwarding.');
        }

        if (input && address) {
            setNativeValue(input, address);
            highlight(input);
            actions.push('Filled the forwarding address.');
        }

        if (toggleOn(keepCopy)) {
            highlight(keepCopy);
            actions.push('Enabled keep a copy.');
        }

        if (shouldSave && saveButton) {
            highlight(saveButton);
            saveButton.click();
            actions.push('Saved the forwarding settings.');
        } else if (saveButton) {
            highlight(saveButton);
        }

        return {
            ok: actions.length > 0,
            message: actions.length > 0
                ? actions.join(' ')
                : 'Open Outlook forwarding settings, then run Assist again once the forwarding controls are visible.',
            state: describeState(),
        };
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GET_SETUP_STATE') {
            sendResponse(describeState());
            return false;
        }

        if (message.type === 'APPLY_SETUP') {
            sendResponse(applySetup(message.address, message.save));
            return false;
        }

        if (message.type === 'NAVIGATE_TO_FORWARDING') {
            window.location.href = getForwardingUrl();
            sendResponse({ ok: true, navigating: true });
            return false;
        }

        sendResponse({ error: 'Unsupported Outlook helper action' });
        return false;
    });
})();
