#!/usr/bin/env bun
/**
 * End-to-End Live Test Script
 * 
 * This script simulates the full email processing pipeline:
 * 1. Register a user
 * 2. Create a watcher with contacts
 * 3. Send simulated emails
 * 4. Watch events flow through the system
 * 5. Observe alert generation
 */

const API_BASE = "http://localhost:3001";

// Colors for console output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

function log(category: string, message: string, data?: any) {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    const color = {
        "AUTH": colors.cyan,
        "WATCHER": colors.green,
        "EMAIL": colors.yellow,
        "EVENT": colors.magenta,
        "ALERT": colors.red,
        "INFO": colors.blue,
    }[category] || colors.reset;
    
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${colors.bright}[${category}]${colors.reset} ${message}`);
    if (data) {
        console.log(`  ${colors.dim}${JSON.stringify(data, null, 2).split("\n").join("\n  ")}${colors.reset}`);
    }
}

async function api(method: string, path: string, body?: any, token?: string) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    
    const text = await response.text();
    try {
        return { status: response.status, data: JSON.parse(text) };
    } catch {
        return { status: response.status, data: text };
    }
}

// Test email templates
const testEmails = {
    normalUpdate: (contact: string, threadId?: string) => ({
        from: contact,
        subject: threadId ? `Re: Project Update` : "Project Update",
        body: "Hi, just wanted to share a quick update on the project. Everything is on track for the deadline. Let me know if you need any details.",
        references: threadId ? [`<${threadId}@test.com>`] : [],
    }),
    
    urgentRequest: (contact: string) => ({
        from: contact,
        subject: "URGENT: Server Down - Need Immediate Help",
        body: "The production server is down! We're losing money every minute. Please respond ASAP. This is critical!",
        references: [],
    }),
    
    actionRequired: (contact: string) => ({
        from: contact,
        subject: "Action Required: Contract Review by EOD",
        body: "Please review the attached contract and sign by end of day today. The client is waiting. This cannot be delayed further.",
        references: [],
    }),
    
    followUp: (contact: string, threadId: string) => ({
        from: contact,
        subject: "Re: Project Update",
        body: "Following up on my previous email. Have you had a chance to review? We need your input before proceeding.",
        references: [`<${threadId}@test.com>`],
    }),
    
    escalation: (contact: string, threadId: string) => ({
        from: contact,
        subject: "Re: URGENT: Server Down - Need Immediate Help",
        body: "Still haven't heard back. The server has been down for 2 hours now. CEO is asking questions. Please respond immediately!",
        references: [`<${threadId}@test.com>`],
    }),
};

function buildRawEmail(email: { from: string; subject: string; body: string; references: string[] }): string {
    const messageId = `<${Date.now()}-${Math.random().toString(36).slice(2)}@test.com>`;
    const date = new Date().toUTCString();
    
    let headers = [
        `From: ${email.from}`,
        `To: test-watcher@vigil.local`,
        `Subject: ${email.subject}`,
        `Date: ${date}`,
        `Message-ID: ${messageId}`,
        `Content-Type: text/plain; charset=utf-8`,
    ];
    
    if (email.references.length > 0) {
        headers.push(`References: ${email.references.join(" ")}`);
        headers.push(`In-Reply-To: ${email.references[email.references.length - 1]}`);
    }
    
    return headers.join("\r\n") + "\r\n\r\n" + email.body;
}

async function watchEvents(watcherId: string, token: string, lastTimestamp: number): Promise<number> {
    const { status, data } = await api("GET", `/api/watchers/${watcherId}/events?since=${lastTimestamp}&order=ASC`, undefined, token);
    
    if (status === 200 && data.events?.length > 0) {
        for (const event of data.events) {
            const eventColor = {
                "MESSAGE_RECEIVED": colors.cyan,
                "MESSAGE_ROUTED": colors.blue,
                "ROUTE_EXTRACTION_COMPLETE": colors.green,
                "EXTRACTION_COMPLETE": colors.green,
                "THREAD_OPENED": colors.yellow,
                "THREAD_ACTIVITY": colors.yellow,
                "REMINDER_CREATED": colors.magenta,
                "REMINDER_DUE": colors.red,
                "ALERT_TRIGGERED": colors.red,
                "ALERT_SENT": colors.red,
            }[event.type] || colors.reset;
            
            console.log(`${colors.dim}[${new Date(event.timestamp).toISOString().split("T")[1].split(".")[0]}]${colors.reset} ${eventColor}${colors.bright}[${event.type}]${colors.reset}`);
            
            // Show relevant details based on event type
            const details: Record<string, any> = { event_id: event.event_id.slice(0, 8) };
            
            switch (event.type) {
                case "MESSAGE_RECEIVED":
                    details.from = event.from;
                    details.subject = event.subject?.slice(0, 40);
                    break;
                case "MESSAGE_ROUTED":
                    details.route = event.route;
                    details.message_id = event.message_id?.slice(0, 8);
                    break;
                case "ROUTE_EXTRACTION_COMPLETE":
                    details.route = event.route;
                    details.signals = event.extraction_signals;
                    break;
                case "THREAD_OPENED":
                    details.thread_id = event.thread_id?.slice(0, 8);
                    details.subject = event.subject?.slice(0, 30);
                    break;
                case "THREAD_ACTIVITY":
                    details.thread_id = event.thread_id?.slice(0, 8);
                    details.activity = event.activity_type;
                    break;
                case "REMINDER_CREATED":
                    details.reminder_id = event.reminder_id?.slice(0, 8);
                    details.due = new Date(event.due_at).toISOString();
                    details.urgency = event.urgency;
                    break;
                case "ALERT_TRIGGERED":
                    details.alert_id = event.alert_id?.slice(0, 8);
                    details.urgency = event.urgency;
                    break;
            }
            
            console.log(`  ${colors.dim}${JSON.stringify(details)}${colors.reset}`);
            lastTimestamp = Math.max(lastTimestamp, event.timestamp);
        }
    }
    
    return lastTimestamp;
}

async function main() {
    console.log("\n" + colors.bright + "═".repeat(60) + colors.reset);
    console.log(colors.bright + "  VIGIL End-to-End Live Test" + colors.reset);
    console.log(colors.bright + "═".repeat(60) + colors.reset + "\n");
    
    // Step 1: Register user
    log("AUTH", "Registering test user...");
    const email = `test-${Date.now()}@example.com`;
    const password = "TestPassword123!";
    
    const registerResult = await api("POST", "/api/auth/register", { email, password });
    if (registerResult.status !== 201) {
        log("AUTH", "Registration failed", registerResult.data);
        process.exit(1);
    }
    const token = registerResult.data.tokens.access_token;
    const accountId = registerResult.data.user.account_id;
    log("AUTH", `User registered: ${email}`, { account_id: accountId.slice(0, 8) });
    
    // Step 2: Create watcher with contacts
    log("WATCHER", "Creating watcher with monitored contacts...");
    const watcherResult = await api("POST", "/api/watchers", {
        name: "E2E Test Watcher",
        contacts: [
            { name: "Alice Boss", email: "alice@company.com", relationship: "manager" },
            { name: "Bob Client", email: "bob@client.com", relationship: "client" },
            { name: "Carol Team", email: "carol@team.com", relationship: "colleague" },
        ],
        check_interval_minutes: 1,
        escalation_threshold_minutes: 5,
    }, token);
    
    if (watcherResult.status !== 201) {
        log("WATCHER", "Watcher creation failed", watcherResult.data);
        process.exit(1);
    }
    
    const watcherId = watcherResult.data.watcher.watcher_id;
    const ingestToken = watcherResult.data.watcher.ingest_token;
    log("WATCHER", `Watcher created: ${watcherResult.data.watcher.name}`, { 
        watcher_id: watcherId.slice(0, 8),
        contacts: 3 
    });
    
    // Step 3: Start event monitoring
    console.log("\n" + colors.cyan + "─".repeat(60) + colors.reset);
    console.log(colors.cyan + colors.bright + "  Starting Event Monitor (Ctrl+C to stop)" + colors.reset);
    console.log(colors.cyan + "─".repeat(60) + colors.reset + "\n");
    
    let lastTimestamp = Date.now() - 1000;
    
    // Poll for events in background
    const eventPollInterval = setInterval(async () => {
        try {
            lastTimestamp = await watchEvents(watcherId, token, lastTimestamp);
        } catch (e) {
            // Ignore polling errors
        }
    }, 1000);
    
    // Step 4: Send test emails with delays
    const scenarios = [
        { delay: 2000, name: "Normal update from Alice", email: testEmails.normalUpdate("alice@company.com") },
        { delay: 3000, name: "Urgent request from Bob", email: testEmails.urgentRequest("bob@client.com") },
        { delay: 4000, name: "Action required from Carol", email: testEmails.actionRequired("carol@team.com") },
        { delay: 6000, name: "Follow-up from Alice", email: testEmails.followUp("alice@company.com", "thread-1") },
        { delay: 8000, name: "Escalation from Bob", email: testEmails.escalation("bob@client.com", "thread-2") },
    ];
    
    for (const scenario of scenarios) {
        await new Promise(resolve => setTimeout(resolve, scenario.delay));
        
        console.log("\n" + colors.yellow + "▶ " + colors.bright + `Sending: ${scenario.name}` + colors.reset);
        
        const rawEmail = buildRawEmail(scenario.email);
        // Ingest endpoint is POST /ingest/:token (not /api/watchers/:id/ingest)
        const ingestResult = await api("POST", `/ingest/${ingestToken}`, {
            raw_email: rawEmail,
        });
        
        if (ingestResult.status !== 202) {
            log("EMAIL", "Ingest failed", ingestResult.data);
        } else {
            log("EMAIL", "Email accepted for processing", { 
                from: scenario.email.from,
                subject: scenario.email.subject.slice(0, 30) 
            });
        }
    }
    
    // Wait for processing and show final state
    console.log("\n" + colors.dim + "Waiting for event processing..." + colors.reset);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get final state
    console.log("\n" + colors.green + "─".repeat(60) + colors.reset);
    console.log(colors.green + colors.bright + "  Final State Summary" + colors.reset);
    console.log(colors.green + "─".repeat(60) + colors.reset + "\n");
    
    const watcherState = await api("GET", `/api/watchers/${watcherId}`, undefined, token);
    if (watcherState.status === 200) {
        const w = watcherState.data.watcher;
        log("INFO", "Watcher State", {
            active_threads: w.threads?.length || 0,
            pending_reminders: w.reminders?.filter((r: any) => r.status === "pending")?.length || 0,
            total_events: w.event_count || "unknown",
        });
        
        if (w.threads?.length > 0) {
            console.log("\n  " + colors.bright + "Active Threads:" + colors.reset);
            for (const thread of w.threads.slice(0, 5)) {
                console.log(`    • ${thread.subject?.slice(0, 40)} (${thread.status})`);
            }
        }
        
        if (w.reminders?.length > 0) {
            console.log("\n  " + colors.bright + "Reminders:" + colors.reset);
            for (const reminder of w.reminders.slice(0, 5)) {
                const due = new Date(reminder.due_at).toISOString();
                console.log(`    • [${reminder.urgency}] ${reminder.reason?.slice(0, 30)} - due: ${due}`);
            }
        }
    }
    
    // Cleanup
    clearInterval(eventPollInterval);
    
    console.log("\n" + colors.bright + "═".repeat(60) + colors.reset);
    console.log(colors.green + colors.bright + "  Test Complete!" + colors.reset);
    console.log(colors.bright + "═".repeat(60) + colors.reset + "\n");
    
    console.log(`${colors.dim}Watcher ID: ${watcherId}${colors.reset}`);
    console.log(`${colors.dim}Account: ${email}${colors.reset}`);
    console.log(`${colors.dim}Token (for manual testing): ${token.slice(0, 20)}...${colors.reset}\n`);
}

main().catch(console.error);
