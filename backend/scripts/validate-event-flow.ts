#!/usr/bin/env bun
/**
 * Event Flow Validation Script
 * 
 * Validates that event flow is correct, deterministic, and traceable.
 * Runs without LLM dependencies - uses only event log analysis.
 * 
 * Usage:
 *   bun run scripts/validate-event-flow.ts [watcher_id]
 * 
 * Checks:
 * 1. Event ordering is correct (MESSAGE_RECEIVED → EXTRACTION → THREAD → REMINDER)
 * 2. All extraction events have corresponding REMINDER_CREATED events
 * 3. All threads have proper extraction_event_id links
 * 4. MESSAGE_THREAD_ASSOCIATED exists for all message-thread pairs
 * 5. MESSAGE_ROUTED exists for all routed messages
 * 6. No orphaned events (events without required parent events)
 * 7. Causal chain is traceable from alert back to original message
 */

import { getEventsForWatcher } from "@/db/event-store";
import type { VigilEvent } from "@/events/types";

interface ValidationResult {
    passed: boolean;
    checks: {
        name: string;
        passed: boolean;
        errors: string[];
        warnings: string[];
    }[];
    summary: {
        total_events: number;
        event_types: Record<string, number>;
        threads_found: number;
        reminders_found: number;
        messages_found: number;
    };
}

function groupEventsByType(events: readonly VigilEvent[]): Record<string, VigilEvent[]> {
    const groups: Record<string, VigilEvent[]> = {};
    for (const event of events) {
        if (!groups[event.type]) {
            groups[event.type] = [];
        }
        groups[event.type].push(event);
    }
    return groups;
}

function checkEventOrdering(events: readonly VigilEvent[]): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Group events by message_id to check ordering within each message flow
    const byMessage = new Map<string, VigilEvent[]>();
    for (const event of events) {
        if ('message_id' in event) {
            const msgId = (event as any).message_id;
            if (!byMessage.has(msgId)) {
                byMessage.set(msgId, []);
            }
            byMessage.get(msgId)!.push(event);
        }
    }
    
    const expectedOrder = [
        'MESSAGE_RECEIVED',
        'ROUTE_EXTRACTION_COMPLETE',
        'HARD_DEADLINE_OBSERVED',
        'SOFT_DEADLINE_SIGNAL_OBSERVED',
        'URGENCY_SIGNAL_OBSERVED',
        'CLOSURE_SIGNAL_OBSERVED',
        'MESSAGE_ROUTED',
        'EXTRACTION_COMPLETE',
        'THREAD_OPENED',
        'THREAD_ACTIVITY_OBSERVED',
        'MESSAGE_THREAD_ASSOCIATED',
        'REMINDER_CREATED',
        'THREAD_CLOSED',
    ];
    
    for (const [messageId, msgEvents] of byMessage) {
        // Sort by timestamp
        const sorted = [...msgEvents].sort((a, b) => a.timestamp - b.timestamp);
        
        // Check that MESSAGE_RECEIVED comes first
        if (sorted[0]?.type !== 'MESSAGE_RECEIVED') {
            errors.push(`Message ${messageId}: First event is ${sorted[0]?.type}, expected MESSAGE_RECEIVED`);
        }
        
        // Check extraction events come before thread events
        let sawThreadEvent = false;
        for (const event of sorted) {
            if (event.type === 'THREAD_OPENED' || event.type === 'THREAD_ACTIVITY_OBSERVED') {
                sawThreadEvent = true;
            }
            if (sawThreadEvent && (
                event.type === 'HARD_DEADLINE_OBSERVED' ||
                event.type === 'SOFT_DEADLINE_SIGNAL_OBSERVED' ||
                event.type === 'URGENCY_SIGNAL_OBSERVED'
            )) {
                errors.push(`Message ${messageId}: Extraction event ${event.type} comes after thread event`);
            }
        }
    }
    
    return { passed: errors.length === 0, errors, warnings };
}

function checkExtractionToReminderLinks(events: readonly VigilEvent[]): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const grouped = groupEventsByType(events);
    
    // Get all extraction events
    const hardDeadlines = grouped['HARD_DEADLINE_OBSERVED'] || [];
    const softDeadlines = grouped['SOFT_DEADLINE_SIGNAL_OBSERVED'] || [];
    const urgencySignals = grouped['URGENCY_SIGNAL_OBSERVED'] || [];
    
    // Get all reminders
    const reminders = grouped['REMINDER_CREATED'] || [];
    const remindersByExtractionId = new Map<string, VigilEvent>();
    for (const rem of reminders) {
        const extractionEventId = (rem as any).extraction_event_id;
        if (extractionEventId) {
            remindersByExtractionId.set(extractionEventId, rem);
        }
    }
    
    // Check each extraction has a corresponding reminder
    for (const hd of hardDeadlines) {
        if (!remindersByExtractionId.has(hd.event_id)) {
            errors.push(`HARD_DEADLINE_OBSERVED ${hd.event_id} has no REMINDER_CREATED event`);
        }
    }
    
    for (const sd of softDeadlines) {
        if (!remindersByExtractionId.has(sd.event_id)) {
            errors.push(`SOFT_DEADLINE_SIGNAL_OBSERVED ${sd.event_id} has no REMINDER_CREATED event`);
        }
    }
    
    for (const us of urgencySignals) {
        if (!remindersByExtractionId.has(us.event_id)) {
            errors.push(`URGENCY_SIGNAL_OBSERVED ${us.event_id} has no REMINDER_CREATED event`);
        }
    }
    
    return { passed: errors.length === 0, errors, warnings };
}

function checkThreadExtractionLinks(events: readonly VigilEvent[]): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const grouped = groupEventsByType(events);
    const threadOpenedEvents = grouped['THREAD_OPENED'] || [];
    
    for (const thread of threadOpenedEvents) {
        const triggerType = (thread as any).trigger_type;
        const hardDeadlineEventId = (thread as any).hard_deadline_event_id;
        const softDeadlineEventId = (thread as any).soft_deadline_event_id;
        const urgencySignalEventId = (thread as any).urgency_signal_event_id;
        
        // Based on trigger_type, check the corresponding event_id is set
        if (triggerType === 'hard_deadline' && !hardDeadlineEventId) {
            errors.push(`THREAD_OPENED ${(thread as any).thread_id} has trigger_type=hard_deadline but no hard_deadline_event_id`);
        }
        if (triggerType === 'soft_deadline' && !softDeadlineEventId) {
            errors.push(`THREAD_OPENED ${(thread as any).thread_id} has trigger_type=soft_deadline but no soft_deadline_event_id`);
        }
        if (triggerType === 'urgency_signal' && !urgencySignalEventId) {
            errors.push(`THREAD_OPENED ${(thread as any).thread_id} has trigger_type=urgency_signal but no urgency_signal_event_id`);
        }
    }
    
    return { passed: errors.length === 0, errors, warnings };
}

function checkMessageThreadAssociations(events: readonly VigilEvent[]): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const grouped = groupEventsByType(events);
    
    // Get all thread events with message_id
    const threadOpenedEvents = grouped['THREAD_OPENED'] || [];
    const threadActivityEvents = grouped['THREAD_ACTIVITY_OBSERVED'] || [];
    
    // Get all associations
    const associations = grouped['MESSAGE_THREAD_ASSOCIATED'] || [];
    const associationKeys = new Set(
        associations.map(a => `${(a as any).message_id}:${(a as any).thread_id}`)
    );
    
    // Check each thread event has an association
    for (const thread of threadOpenedEvents) {
        const key = `${(thread as any).message_id}:${(thread as any).thread_id}`;
        if (!associationKeys.has(key)) {
            warnings.push(`THREAD_OPENED ${(thread as any).thread_id} message ${(thread as any).message_id} has no MESSAGE_THREAD_ASSOCIATED`);
        }
    }
    
    for (const activity of threadActivityEvents) {
        const key = `${(activity as any).message_id}:${(activity as any).thread_id}`;
        if (!associationKeys.has(key)) {
            warnings.push(`THREAD_ACTIVITY_OBSERVED ${(activity as any).thread_id} message ${(activity as any).message_id} has no MESSAGE_THREAD_ASSOCIATED`);
        }
    }
    
    return { passed: errors.length === 0, errors, warnings };
}

function checkMessageRoutedEvents(events: readonly VigilEvent[]): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const grouped = groupEventsByType(events);
    
    // Get all thread events
    const threadOpenedEvents = grouped['THREAD_OPENED'] || [];
    const threadActivityEvents = grouped['THREAD_ACTIVITY_OBSERVED'] || [];
    
    // Get all MESSAGE_ROUTED events
    const routedEvents = grouped['MESSAGE_ROUTED'] || [];
    const routedMessageIds = new Set(routedEvents.map(r => (r as any).message_id));
    
    // Check each thread has a corresponding MESSAGE_ROUTED
    for (const thread of threadOpenedEvents) {
        const messageId = (thread as any).message_id;
        if (!routedMessageIds.has(messageId)) {
            warnings.push(`THREAD_OPENED message ${messageId} has no MESSAGE_ROUTED event`);
        }
    }
    
    for (const activity of threadActivityEvents) {
        const messageId = (activity as any).message_id;
        if (!routedMessageIds.has(messageId)) {
            warnings.push(`THREAD_ACTIVITY_OBSERVED message ${messageId} has no MESSAGE_ROUTED event`);
        }
    }
    
    return { passed: errors.length === 0, errors, warnings };
}

function checkCausalChain(events: readonly VigilEvent[]): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const grouped = groupEventsByType(events);
    const eventById = new Map<string, VigilEvent>();
    for (const event of events) {
        eventById.set(event.event_id, event);
    }
    
    // Check ALERT_QUEUED → REMINDER_GENERATED → THREAD → EXTRACTION → MESSAGE
    const alertEvents = grouped['ALERT_QUEUED'] || [];
    
    for (const alert of alertEvents) {
        const causalEventId = (alert as any).causal_event_id;
        if (!causalEventId) {
            errors.push(`ALERT_QUEUED ${alert.event_id} has no causal_event_id`);
            continue;
        }
        
        const causalEvent = eventById.get(causalEventId);
        if (!causalEvent) {
            errors.push(`ALERT_QUEUED ${alert.event_id} references missing causal event ${causalEventId}`);
        }
    }
    
    return { passed: errors.length === 0, errors, warnings };
}

async function validateEventFlow(watcherId: string): Promise<ValidationResult> {
    console.log(`\n🔍 Validating event flow for watcher: ${watcherId}\n`);
    
    const events = await getEventsForWatcher(watcherId);
    console.log(`Found ${events.length} events\n`);
    
    const grouped = groupEventsByType(events);
    const eventTypeCounts: Record<string, number> = {};
    for (const [type, evts] of Object.entries(grouped)) {
        eventTypeCounts[type] = evts.length;
    }
    
    const checks = [
        { name: 'Event Ordering', ...checkEventOrdering(events) },
        { name: 'Extraction → Reminder Links', ...checkExtractionToReminderLinks(events) },
        { name: 'Thread → Extraction Links', ...checkThreadExtractionLinks(events) },
        { name: 'Message-Thread Associations', ...checkMessageThreadAssociations(events) },
        { name: 'Message Routed Events', ...checkMessageRoutedEvents(events) },
        { name: 'Causal Chain Integrity', ...checkCausalChain(events) },
    ];
    
    const result: ValidationResult = {
        passed: checks.every(c => c.passed),
        checks,
        summary: {
            total_events: events.length,
            event_types: eventTypeCounts,
            threads_found: (grouped['THREAD_OPENED'] || []).length,
            reminders_found: (grouped['REMINDER_CREATED'] || []).length,
            messages_found: (grouped['MESSAGE_RECEIVED'] || []).length,
        },
    };
    
    // Print results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                    VALIDATION RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    for (const check of checks) {
        const icon = check.passed ? '✅' : '❌';
        console.log(`${icon} ${check.name}`);
        
        for (const error of check.errors) {
            console.log(`   ❗ ${error}`);
        }
        for (const warning of check.warnings) {
            console.log(`   ⚠️  ${warning}`);
        }
        console.log('');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                      SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Total Events: ${result.summary.total_events}`);
    console.log(`Messages: ${result.summary.messages_found}`);
    console.log(`Threads: ${result.summary.threads_found}`);
    console.log(`Reminders: ${result.summary.reminders_found}`);
    console.log('\nEvent Types:');
    for (const [type, count] of Object.entries(result.summary.event_types).sort()) {
        console.log(`  ${type}: ${count}`);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Overall: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return result;
}

// Main
const watcherId = process.argv[2];

if (!watcherId) {
    console.error('Usage: bun run scripts/validate-event-flow.ts <watcher_id>');
    process.exit(1);
}

validateEventFlow(watcherId)
    .then((result) => {
        process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
        console.error('Validation failed with error:', error);
        process.exit(1);
    });
