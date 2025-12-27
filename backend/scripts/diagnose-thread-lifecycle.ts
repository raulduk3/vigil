#!/usr/bin/env bun
/**
 * Diagnose thread lifecycle issues
 * 
 * This script checks:
 * 1. Watcher status (must be 'active' for threads to be created)
 * 2. Recent MESSAGE_RECEIVED events
 * 3. Whether extraction is happening
 * 4. Whether threads are being created
 */

import { initializeDatabase, closeDatabase, queryMany, queryOne } from "@/db/client";
import { getEvents, getEventsForWatcher } from "@/db/event-store";
import { replayEvents } from "@/watcher/runtime";
import { routeEmail, getSignalDetails } from "@/llm/router";

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(color: keyof typeof colors, message: string) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(title: string) {
    console.log('\n' + '='.repeat(60));
    log('cyan', title);
    console.log('='.repeat(60));
}

async function main() {
    await initializeDatabase();

    logHeader('THREAD LIFECYCLE DIAGNOSTICS');

    // Get all watchers and their states
    logHeader('1. ALL WATCHERS STATUS');
    
    const allWatcherEvents = await getEvents({ types: ['WATCHER_CREATED'] });
    
    for (const createEvent of allWatcherEvents) {
        const watcherId = createEvent.watcher_id!;
        const events = await getEventsForWatcher(watcherId);
        const state = replayEvents(events);
        
        const statusColor = state.status === 'active' ? 'green' : 
                          state.status === 'paused' ? 'yellow' : 'red';
        
        console.log(`\n  Watcher: ${state.name || 'unnamed'} (${watcherId.slice(0, 8)}...)`);
        log(statusColor, `    Status: ${state.status}`);
        console.log(`    Ingest Email: ${state.ingest_email}`);
        console.log(`    Account: ${state.account_id?.slice(0, 8) || 'unknown'}...`);
        
        // Count event types
        const eventCounts: Record<string, number> = {};
        events.forEach(e => {
            eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
        });
        console.log(`    Event counts:`, JSON.stringify(eventCounts, null, 0));
    }

    // Recent MESSAGE_RECEIVED analysis
    logHeader('2. RECENT MESSAGE ANALYSIS (Last 10 messages)');
    
    const recentMessages = await getEvents({ 
        types: ['MESSAGE_RECEIVED'],
        limit: 10,
        order: 'DESC'
    });

    for (const msg of recentMessages) {
        const watcherId = msg.watcher_id!;
        const msgEvent = msg as any;
        
        console.log(`\n  Message: ${msgEvent.message_id}`);
        console.log(`    Watcher: ${watcherId.slice(0, 8)}...`);
        console.log(`    Subject: ${msgEvent.subject || msgEvent.normalized_subject || 'no subject'}`);
        console.log(`    Sender: ${msgEvent.sender}`);
        console.log(`    Time: ${new Date(msg.timestamp).toISOString()}`);
        
        // Get watcher state at message time
        const watcherEvents = await getEventsForWatcher(watcherId);
        const watcherState = replayEvents(watcherEvents);
        
        const statusColor = watcherState.status === 'active' ? 'green' : 'red';
        log(statusColor, `    Watcher Status: ${watcherState.status}`);
        
        // Check if extraction events followed
        const extractionEvents = watcherEvents.filter(e => 
            (e.type === 'HARD_DEADLINE_OBSERVED' || 
             e.type === 'SOFT_DEADLINE_SIGNAL_OBSERVED' ||
             e.type === 'URGENCY_SIGNAL_OBSERVED' ||
             e.type === 'CLOSURE_SIGNAL_OBSERVED') &&
            (e as any).message_id === msgEvent.message_id
        );
        
        if (extractionEvents.length > 0) {
            log('green', `    Extractions: ${extractionEvents.map(e => e.type).join(', ')}`);
        } else {
            log('yellow', `    Extractions: NONE`);
        }
        
        // Check if thread was created/updated
        const threadEvents = watcherEvents.filter(e =>
            (e.type === 'THREAD_OPENED' || e.type === 'THREAD_ACTIVITY_OBSERVED') &&
            (e as any).message_id === msgEvent.message_id
        );
        
        if (threadEvents.length > 0) {
            log('green', `    Thread Events: ${threadEvents.map(e => `${e.type}(${(e as any).thread_id?.slice(0, 8)})`).join(', ')}`);
        } else {
            log('yellow', `    Thread Events: NONE`);
        }
        
        // Run routing on body excerpt to see what SHOULD have been detected
        if (msgEvent.body_text_extract) {
            const details = getSignalDetails(msgEvent.body_text_extract, msgEvent.subject || '');
            const routing = routeEmail({
                email_text: msgEvent.body_text_extract,
                subject: msgEvent.subject || '',
                sender_email: msgEvent.sender
            });
            
            console.log(`    Router Analysis:`);
            if (details.deadline.detected) log('blue', `      - Deadline patterns: ${details.deadline.matches.join(', ')}`);
            if (details.softDeadline.detected) log('blue', `      - Soft deadline patterns: ${details.softDeadline.matches.join(', ')}`);
            if (details.urgency.detected) log('blue', `      - Urgency patterns: ${details.urgency.matches.join(', ')}`);
            if (details.closure.detected) log('blue', `      - Closure patterns: ${details.closure.matches.join(', ')}`);
            if (details.informational.detected) log('dim', `      - Informational patterns: ${details.informational.matches.join(', ')}`);
            if (!details.deadline.detected && !details.softDeadline.detected && !details.urgency.detected && !details.closure.detected) {
                log('red', `      - NO PATTERNS DETECTED`);
            }
            console.log(`    Router decision: ${routing.reasoning}`);
        }
    }

    // Thread summary
    logHeader('3. ALL THREADS');
    
    const threadOpenEvents = await getEvents({ types: ['THREAD_OPENED'] });
    console.log(`  Total threads created: ${threadOpenEvents.length}`);
    
    for (const threadEvent of threadOpenEvents) {
        const te = threadEvent as any;
        const watcherEvents = await getEventsForWatcher(threadEvent.watcher_id!);
        const watcherState = replayEvents(watcherEvents);
        
        // Find thread state
        const thread = watcherState.threads.get(te.thread_id);
        
        console.log(`\n  Thread: ${te.thread_id}`);
        console.log(`    Watcher: ${threadEvent.watcher_id?.slice(0, 8)}...`);
        console.log(`    Subject: ${te.normalized_subject}`);
        console.log(`    Status: ${thread?.status || 'unknown'}`);
        console.log(`    Trigger: ${te.trigger_type}`);
        console.log(`    Messages: ${thread?.message_count || 1}`);
    }

    // REMINDER check
    logHeader('4. REMINDERS');
    
    const reminderEvents = await getEvents({ types: ['REMINDER_GENERATED', 'REMINDER_EVALUATED'] });
    console.log(`  REMINDER_EVALUATED events: ${reminderEvents.filter(e => e.type === 'REMINDER_EVALUATED').length}`);
    console.log(`  REMINDER_GENERATED events: ${reminderEvents.filter(e => e.type === 'REMINDER_GENERATED').length}`);

    // Scheduler check
    logHeader('5. TIME_TICK EVENTS (Last 5)');
    
    const timeTickEvents = await getEvents({ types: ['TIME_TICK'], limit: 5, order: 'DESC' });
    console.log(`  Recent TIME_TICK events: ${timeTickEvents.length}`);
    for (const tick of timeTickEvents) {
        console.log(`    ${new Date(tick.timestamp).toISOString()} - Watcher: ${tick.watcher_id?.slice(0, 8)}...`);
    }

    // Alert check
    logHeader('6. ALERTS');
    
    const alertEvents = await getEvents({ types: ['ALERT_QUEUED', 'ALERT_SENT', 'ALERT_FAILED'] });
    console.log(`  ALERT_QUEUED: ${alertEvents.filter(e => e.type === 'ALERT_QUEUED').length}`);
    console.log(`  ALERT_SENT: ${alertEvents.filter(e => e.type === 'ALERT_SENT').length}`);
    console.log(`  ALERT_FAILED: ${alertEvents.filter(e => e.type === 'ALERT_FAILED').length}`);

    logHeader('DIAGNOSIS COMPLETE');
    
    await closeDatabase();
}

main().catch(console.error);
