#!/usr/bin/env bun
/**
 * Check the most recent messages and their threads
 */

import { initializeDatabase, closeDatabase } from "@/db/client";
import { getEvents } from "@/db/event-store";

async function main() {
    await initializeDatabase();

    // Get the 4 most recent MESSAGE_RECEIVED events
    const messages = await getEvents({ 
        types: ['MESSAGE_RECEIVED'],
        limit: 4,
        order: 'DESC'
    });

    console.log('\n=== RECENT MESSAGES ===\n');
    
    for (const msg of messages) {
        const m = msg as any;
        console.log(`Message: ${m.message_id}`);
        console.log(`  Subject: ${m.subject}`);
        console.log(`  From (forwarder): ${m.sender}`);
        console.log(`  Original sender: ${m.original_sender}`);
        console.log(`  Time: ${new Date(msg.timestamp).toISOString()}`);
        console.log(`  Body: ${m.body_text_extract?.substring(0, 100)}...`);
        console.log('');
    }

    // Get the 4 most recent THREAD events
    const threads = await getEvents({ 
        types: ['THREAD_OPENED', 'THREAD_ACTIVITY_OBSERVED', 'THREAD_CLOSED'],
        limit: 6,
        order: 'DESC'
    });

    console.log('\n=== RECENT THREAD EVENTS ===\n');
    
    for (const evt of threads) {
        console.log(`${evt.type}: ${(evt as any).thread_id}`);
        console.log(`  Time: ${new Date(evt.timestamp).toISOString()}`);
        if (evt.type === 'THREAD_OPENED') {
            const e = evt as any;
            console.log(`  Trigger: ${e.trigger_type}`);
            console.log(`  Subject: ${e.normalized_subject}`);
            console.log(`  Original sender: ${e.original_sender}`);
        }
        if (evt.type === 'THREAD_CLOSED') {
            const e = evt as any;
            console.log(`  Reason: ${e.closure_reason}`);
        }
        console.log('');
    }

    await closeDatabase();
}

main().catch(console.error);
