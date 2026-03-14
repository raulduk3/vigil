# Vigil Chrome Extension

Manifest V3 setup assistant for Gmail and Outlook forwarding.

## What it does

- Connects to your Vigil account with an API key or email login
- Creates a watcher if your account does not already have one
- Guides forwarding setup on Gmail and Outlook settings pages
- Polls Vigil for Gmail forwarding confirmation codes
- Never requests inbox read permissions or email content access

## Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this `chrome-extension` directory
5. Pin the extension in Chrome

The extension opens `getting-started.html` on first install with the same onboarding steps.

## Development notes

- Production API base: `https://api.vigil.run/api`
- Local fallback API base: `http://localhost:3001/api`
- After changing extension files, reload the extension in `chrome://extensions`
- If Gmail or Outlook tabs were already open, refresh them after reloading the extension

## Scope

The content scripts only target forwarding and settings UI. They do not read message lists, message bodies, or inbox content.