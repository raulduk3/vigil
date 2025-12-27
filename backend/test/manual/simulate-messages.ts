#!/usr/bin/env bun
/**
 * Simulate message ingestion to test event system
 * Run with: bun run backend/test/manual/simulate-messages.ts
 */

const API_BASE = 'http://localhost:3001';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function login(email: string, password: string) {
  log('blue', `\n→ Logging in as ${email}...`);
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  
  const data = await response.json();
  log('green', `✓ Logged in successfully`);
  // Handle both nested and flat token structure
  return data.tokens?.access_token || data.access_token;
}

async function getWatchers(token: string) {
  log('blue', '\n→ Fetching watchers...');
  const response = await fetch(`${API_BASE}/api/watchers`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get watchers: ${response.status}`);
  }
  
  const data = await response.json();
  log('green', `✓ Found ${data.watchers.length} watcher(s)`);
  return data.watchers;
}

async function createWatcher(token: string, name: string) {
  log('blue', `\n→ Creating watcher: ${name}...`);
  const response = await fetch(`${API_BASE}/api/watchers`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create watcher: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  log('green', `✓ Watcher created: ${data.watcher.watcher_id}`);
  log('cyan', `  Ingest email: ${data.watcher.ingest_email}`);
  return data.watcher;
}

async function activateWatcher(token: string, watcherId: string) {
  log('blue', '\n→ Configuring watcher policy...');
  
  // First, set up a policy with notification channels
  const policyResponse = await fetch(`${API_BASE}/api/watchers/${watcherId}/policy`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      allowed_senders: [],
      silence_threshold_hours: 72,
      deadline_warning_hours: 24,
      deadline_critical_hours: 2,
      notification_channels: [
        {
          type: 'email',
          destination: 'alerts@example.com',
          urgency_filter: 'all',
          enabled: true,
        }
      ],
      reporting_cadence: 'on_demand',
      reporting_recipients: [],
    }),
  });
  
  if (!policyResponse.ok) {
    const error = await policyResponse.text();
    log('yellow', `⚠ Policy update status: ${policyResponse.status} - ${error}`);
  } else {
    log('green', '✓ Policy configured');
  }
  
  log('blue', '→ Activating watcher...');
  const response = await fetch(`${API_BASE}/api/watchers/${watcherId}/activate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to activate watcher: ${response.status} - ${error}`);
  }
  
  log('green', '✓ Watcher activated');
}

async function ingestEmail(ingestToken: string, emailContent: string) {
  log('blue', '\n→ Ingesting email...');
  const response = await fetch(`${API_BASE}/ingest/${ingestToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: emailContent,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to ingest email: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  log('green', '✓ Email ingested successfully');
  log('cyan', `  Thread: ${data.thread_id || 'N/A'}`);
  log('cyan', `  Events generated: ${data.events_generated || 0}`);
  return data;
}

async function getEvents(token: string, watcherId: string) {
  const response = await fetch(`${API_BASE}/api/watchers/${watcherId}/events`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get events: ${response.status}`);
  }
  
  const data = await response.json();
  return data.events;
}

async function getThreads(token: string, watcherId: string) {
  const response = await fetch(`${API_BASE}/api/watchers/${watcherId}/threads`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get threads: ${response.status}`);
  }
  
  const data = await response.json();
  return data.threads;
}

function generateEmail(originalFrom: string, subject: string, body: string, forwardedBy: string, messageId?: string) {
  const msgId = messageId || `${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const date = new Date().toUTCString();
  const originalDate = new Date(Date.now() - 3600000).toUTCString(); // 1 hour ago
  
  // Create a forwarded email format
  const forwardedBody = `---------- Forwarded message ---------
From: ${originalFrom}
Date: ${originalDate}
Subject: ${subject}
To: team@company.com

${body}`;
  
  return `From: ${forwardedBy}
To: watcher@ingest.vigil.run
Subject: Fwd: ${subject}
Date: ${date}
Message-ID: <${msgId}>

${forwardedBody}`;
}

async function main() {
  try {
    log('cyan', '\n═══════════════════════════════════════════════════════════');
    log('cyan', '  Vigil Message Simulation Test');
    log('cyan', '═══════════════════════════════════════════════════════════');

    // Get credentials from command line or use defaults
    const email = process.argv[2] || 'test@example.com';
    const password = process.argv[3] || 'password123';

    // Step 1: Login
    const token = await login(email, password);

    // Step 2: Get or create watcher
    let watchers = await getWatchers(token);
    let watcher;
    
    if (watchers.length === 0) {
      watcher = await createWatcher(token, 'Test Watcher');
      await activateWatcher(token, watcher.watcher_id);
    } else {
      watcher = watchers[0];
      
      // Fetch full watcher details to get ingest_token
      log('blue', `\n→ Fetching watcher details...`);
      const watcherResponse = await fetch(`${API_BASE}/api/watchers/${watcher.watcher_id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (watcherResponse.ok) {
        const watcherData = await watcherResponse.json();
        watcher = watcherData.watcher;
      }
      
      log('cyan', `\nUsing existing watcher: ${watcher.name}`);
      log('cyan', `  ID: ${watcher.watcher_id}`);
      log('cyan', `  Status: ${watcher.status}`);
      log('cyan', `  Ingest email: ${watcher.ingest_email}`);
      log('cyan', `  Ingest token: ${watcher.ingest_token}`);
      
      if (watcher.status !== 'active') {
        await activateWatcher(token, watcher.watcher_id);
      }
    }

    // Use the ingest_token directly from the watcher object, or extract from email
    const ingestToken = watcher.ingest_token || watcher.ingest_email.split('@')[0];

    // Step 3: Send test messages
    log('yellow', '\n═══════════════════════════════════════════════════════════');
    log('yellow', '  Sending Test Messages');
    log('yellow', '═══════════════════════════════════════════════════════════');

    // Calculate deadline times for testing different urgency levels
    const now = new Date();
    const warningDeadline = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours (warning threshold: 24h)
    const criticalDeadline = new Date(now.getTime() + 90 * 60 * 1000); // 90 minutes (critical threshold: 2h)
    const overdueDeadline = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const normalDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours (no alert expected)

    const formatDeadline = (date: Date) => {
      const day = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${day} at ${time}`;
    };

    // Message 1: WARNING threshold - should trigger warning reminder
    log('blue', '\n→ Sending email #1: WARNING deadline (12 hours)...');
    const email1 = generateEmail(
      'alice@client.com',
      'Project Report Due - Warning Level',
      `Hi team,\n\nThe quarterly report is due by ${formatDeadline(warningDeadline)}. Please make sure all sections are complete.\n\nThis deadline is approaching the warning threshold.\n\nThanks!`,
      email // Account user is forwarding
    );
    await ingestEmail(ingestToken, email1);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Message 2: CRITICAL threshold - should trigger critical reminder
    log('blue', '\n→ Sending email #2: CRITICAL deadline (90 minutes)...');
    const email2 = generateEmail(
      'bob@client.com',
      'URGENT: Server Maintenance Required',
      `This is URGENT! We need to complete the server restart by ${formatDeadline(criticalDeadline)}.\n\nThe client is waiting and this is time-sensitive. Please act immediately!`,
      email // Account user is forwarding
    );
    await ingestEmail(ingestToken, email2);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Message 3: OVERDUE deadline - should trigger overdue reminder
    log('blue', '\n→ Sending email #3: OVERDUE deadline (2 hours past)...');
    const email3 = generateEmail(
      'charlie@vendor.com',
      'Invoice #12345 - Past Due',
      `Hi,\n\nAttached is invoice #12345 for December services. Payment was due by ${formatDeadline(overdueDeadline)} to avoid late fees.\n\nThis is now overdue and requires immediate attention.\n\nBest regards`,
      email // Account user is forwarding
    );
    await ingestEmail(ingestToken, email3);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Message 4: Normal deadline - no alert expected
    log('blue', '\n→ Sending email #4: Normal deadline (48 hours - no alert)...');
    const email4 = generateEmail(
      'dana@partner.com',
      'Meeting Agenda Review',
      `Hello,\n\nPlease review the agenda for our upcoming meeting by ${formatDeadline(normalDeadline)}.\n\nNo urgency, just when you have time.\n\nThanks!`,
      email // Account user is forwarding
    );
    await ingestEmail(ingestToken, email4);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Message 5: Follow-up with urgency signal (no explicit deadline)
    log('blue', '\n→ Sending email #5: Urgency signal without deadline...');
    const email5 = generateEmail(
      'alice@client.com',
      'Re: Project Report Due - Warning Level',
      'Just checking in - this is becoming URGENT. We need the technical analysis section ASAP. The client is asking for updates.',
      email // Account user is forwarding
    );
    await ingestEmail(ingestToken, email5);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Message 6: Closure signal (resolves first thread)
    log('blue', '\n→ Sending email #6: Closure signal...');
    const email6 = generateEmail(
      'alice@client.com',
      'Re: Project Report Due - Warning Level',
      'Great news! The report has been completed and submitted. This issue is now resolved. No further action needed.\n\nThanks everyone!',
      email // Account user is forwarding
    );
    await ingestEmail(ingestToken, email6);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 4: Check results
    log('yellow', '\n═══════════════════════════════════════════════════════════');
    log('yellow', '  Results');
    log('yellow', '═══════════════════════════════════════════════════════════');

    const threads = await getThreads(token, watcher.watcher_id);
    log('green', `\n✓ Threads created: ${threads.length}`);
    threads.forEach((thread: any) => {
      log('cyan', `  - ${thread.subject || 'No subject'} (${thread.status})`);
      log('cyan', `    Urgency: ${thread.urgency || 'ok'}`);
      log('cyan', `    Messages: ${thread.message_count || 0}`);
    });

    const events = await getEvents(token, watcher.watcher_id);
    log('green', `\n✓ Total events: ${events.length}`);
    
    // Count events by type
    const eventCounts = events.reduce((acc: any, event: any) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});
    
    log('cyan', '\nEvent breakdown:');
    Object.entries(eventCounts).forEach(([type, count]) => {
      log('cyan', `  - ${type}: ${count}`);
    });

    log('green', '\n✓ Test completed successfully!');
    log('cyan', '\nEmails sent:');
    log('cyan', '  1. WARNING deadline (12h) - Should trigger warning reminder');
    log('cyan', '  2. CRITICAL deadline (90min) - Should trigger critical reminder');
    log('cyan', '  3. OVERDUE deadline (-2h) - Should trigger overdue reminder');
    log('cyan', '  4. Normal deadline (48h) - No alert expected (within safe range)');
    log('cyan', '  5. Urgency signal - Follow-up without explicit deadline');
    log('cyan', '  6. Closure signal - Resolves thread #1');
    log('cyan', '\nNext steps:');
    log('cyan', '  1. Open browser to http://localhost:3000');
    log('cyan', '  2. Navigate to the watcher detail page');
    log('cyan', '  3. Check the Events tab to see all generated events');
    log('cyan', '  4. Verify REMINDER_GENERATED and ALERT_QUEUED events were created');
    log('cyan', '  5. Check urgency states: warning, critical, and overdue');
    log('cyan', '\nExpected reminders:');
    log('cyan', '  - Thread 1 (Report): WARNING reminder → closed by message 6');
    log('cyan', '  - Thread 2 (Server): CRITICAL reminder');
    log('cyan', '  - Thread 3 (Invoice): OVERDUE reminder');
    log('cyan', '  - Thread 4 (Meeting): No reminder (safe deadline)');

  } catch (error) {
    log('red', '\n✗ Error occurred:');
    console.error(error);
    process.exit(1);
  }
}

main();
