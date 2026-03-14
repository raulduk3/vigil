# Vigil Chrome Extension — Setup Wizard

## What This Is

A Chrome extension (Manifest V3) that helps users connect their email to Vigil by automating the forwarding setup in Gmail and Outlook. The extension NEVER reads email content. It only interacts with the settings/forwarding UI.

## Architecture

```
chrome-extension/
├── manifest.json          # Manifest V3
├── popup/
│   ├── popup.html         # Main popup UI
│   ├── popup.css          # Styles
│   └── popup.js           # Popup logic
├── sidepanel/
│   ├── panel.html         # Side panel UI (step-by-step wizard)
│   ├── panel.css          # Styles  
│   └── panel.js           # Wizard logic
├── content/
│   ├── gmail.js           # Content script for mail.google.com
│   └── outlook.js         # Content script for outlook.live.com / outlook.office.com
├── background/
│   └── service-worker.js  # Background service worker
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/
    └── api.js             # Vigil API client
```

## User Flow

### Step 1: Sign In
- User clicks extension icon → popup shows "Connect to Vigil"
- User enters Vigil API key (or signs in with email/password)
- Extension stores API key in chrome.storage.sync

### Step 2: Detect Email Provider
- Extension detects if user is on Gmail or Outlook
- If not on an email page, show "Open Gmail or Outlook to get started"

### Step 3: Create Watcher (if needed)
- Ask: "What do you want to watch?" (same as splash page)
- Call POST /api/watchers to create watcher
- Get back the ingest token / forwarding address

### Step 4: Automated Forwarding Setup

#### Gmail:
1. Navigate to Settings → Forwarding and POP/IMAP
   URL: https://mail.google.com/mail/u/0/#settings/fwdandpop
2. Click "Add a forwarding address"
3. Fill in the Vigil forwarding address (e.g., `r-prime-{token}@vigil.run`)
4. Gmail sends a confirmation email to that address
5. Vigil backend catches the confirmation email via Cloudflare Worker
6. Backend extracts the confirmation code from the email
7. Extension polls GET /api/forwarding/confirm-code?watcher_id=X
8. Once code arrives, extension fills it into the Gmail confirmation dialog
9. Click "Proceed" to verify
10. Select "Forward a copy" and "Keep Gmail's copy in the inbox"
11. Click "Save Changes"

#### Outlook:
1. Navigate to Settings → Mail → Forwarding
   URL: https://outlook.live.com/mail/0/options/mail/forwarding
2. Enable forwarding toggle
3. Fill in the Vigil forwarding address
4. Check "Keep a copy of forwarded messages"
5. Click Save

### Step 5: Confirmation
- Show "You're connected! Vigil is now watching your email."
- Link to dashboard

## Vigil Backend Changes Needed

### New endpoint: GET /api/forwarding/confirm-code
- Params: watcher_id
- Returns: { code: "123456" } if a Gmail confirmation email has been received
- Returns: { code: null } if not yet received
- The Cloudflare Worker already catches all emails to *@vigil.run
- The ingest handler needs to detect Gmail forwarding confirmation emails
  (subject contains "Gmail Forwarding Confirmation" or similar)
  and store the confirmation code temporarily (e.g., in a new table or in-memory)

### New endpoint: POST /api/forwarding/status  
- Params: watcher_id
- Returns: { forwarding_active: true/false, last_email_at: "..." }
- So the extension can verify forwarding is actually working

## Design

- Clean, minimal UI matching vigil.run aesthetics
- Dark theme (matches Vigil dashboard)
- Step indicators (1/5, 2/5, etc.)
- Animated transitions between steps
- Success confetti or checkmark animation at the end

## Technical Notes

- Manifest V3 (service worker, not background page)
- Content scripts need host permissions for mail.google.com and outlook
- Use chrome.storage.sync for API key persistence
- Poll for confirmation code every 2 seconds, timeout after 5 minutes
- All API calls go through lib/api.js wrapper
- No external dependencies, vanilla JS

## Icon

Use the Vigil eye icon. For now, create simple colored squares as placeholders:
- 16x16, 48x48, 128x128
- Purple/dark background with a white eye symbol
- Can be SVG converted to PNG

## Important Constraints

- NEVER access email content
- NEVER request mail.read or similar permissions  
- Only interact with settings/forwarding pages
- Content scripts should be minimal — just DOM manipulation for the settings UI
- The extension is a setup wizard, not a persistent monitor
