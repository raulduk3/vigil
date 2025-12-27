#!/usr/bin/env bun
/**
 * Deep debug for extraction issues
 * 
 * This script tests the full extraction pipeline on recent messages
 */

import { initializeDatabase, closeDatabase } from "@/db/client";
import { getEvents, getEventsForWatcher } from "@/db/event-store";
import { replayEvents } from "@/watcher/runtime";
import { routeEmail, getSignalDetails } from "@/llm/router";
import { 
    extractHardDeadline, 
    extractSoftDeadlineSignal, 
    detectUrgencySignal, 
    detectClosureSignal,
    validateSourceSpan
} from "@/llm/extractor";
import { orchestrateLLMExtraction, shouldRunExtraction, validateSenderAllowed } from "@/ingestion/orchestrator";

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
    console.log('\n' + '='.repeat(70));
    log('cyan', title);
    console.log('='.repeat(70));
}

async function main() {
    await initializeDatabase();

    logHeader('DEEP EXTRACTION DEBUGGING');

    // Get the problematic watcher
    const problemWatcherId = 'de5d5778-c515-4a51-bc52-62ecf51881ca';
    const workingWatcherId = 'f26ea65c-a639-4154-a4a3-51af03a1ce0b';

    // Get events for both watchers
    const problemEvents = await getEventsForWatcher(problemWatcherId);
    const workingEvents = await getEventsForWatcher(workingWatcherId);

    const problemState = replayEvents(problemEvents);
    const workingState = replayEvents(workingEvents);

    logHeader('1. WATCHER COMPARISON');
    
    console.log('\nPROBLEM WATCHER (de5d5778):');
    console.log(`  Status: ${problemState.status}`);
    console.log(`  Policy: ${JSON.stringify(problemState.policy, null, 2)}`);
    
    console.log('\nWORKING WATCHER (f26ea65c):');
    console.log(`  Status: ${workingState.status}`);
    console.log(`  Policy: ${JSON.stringify(workingState.policy, null, 2)}`);

    logHeader('2. EXTRACTION ELIGIBILITY CHECK');
    
    // Check shouldRunExtraction for each watcher
    const problemAllowedSenders = problemState.policy?.allowed_senders || [];
    const workingAllowedSenders = workingState.policy?.allowed_senders || [];
    
    console.log('\nPROBLEM WATCHER:');
    console.log(`  Allowed senders: ${JSON.stringify(problemAllowedSenders)}`);
    console.log(`  Sender "alice@client.com" allowed: ${validateSenderAllowed('alice@client.com', problemAllowedSenders)}`);
    console.log(`  shouldRunExtraction (if sender allowed): ${shouldRunExtraction(true, problemState.status)}`);
    console.log(`  shouldRunExtraction (actual): ${shouldRunExtraction(validateSenderAllowed('alice@client.com', problemAllowedSenders), problemState.status)}`);
    
    console.log('\nWORKING WATCHER:');
    console.log(`  Allowed senders: ${JSON.stringify(workingAllowedSenders)}`);
    console.log(`  Sender "alice@client.com" allowed: ${validateSenderAllowed('alice@client.com', workingAllowedSenders)}`);
    console.log(`  shouldRunExtraction (if sender allowed): ${shouldRunExtraction(true, workingState.status)}`);
    console.log(`  shouldRunExtraction (actual): ${shouldRunExtraction(validateSenderAllowed('alice@client.com', workingAllowedSenders), workingState.status)}`);

    logHeader('3. MESSAGE BODY ANALYSIS');

    // Get a recent message from problem watcher
    const problemMessages = problemEvents.filter(e => e.type === 'MESSAGE_RECEIVED');
    const workingMessages = workingEvents.filter(e => e.type === 'MESSAGE_RECEIVED');

    console.log('\nPROBLEM WATCHER - First message:');
    if (problemMessages[0]) {
        const msg = problemMessages[0] as any;
        console.log(`  Subject: "${msg.subject}"`);
        console.log(`  Sender: ${msg.sender}`);
        console.log(`  Body excerpt: "${msg.body_text_extract}"`);
        console.log(`  Body excerpt length: ${msg.body_text_extract?.length || 0}`);
        
        // Run extraction manually
        const bodyText = msg.body_text_extract || '';
        const subject = msg.subject || '';
        
        console.log('\n  MANUAL EXTRACTION TEST:');
        
        // Test routing
        const routing = routeEmail({ email_text: bodyText, subject, sender_email: msg.sender });
        console.log(`    Routing decision: ${JSON.stringify(routing)}`);
        
        // Test hard deadline
        if (routing.extract_deadline) {
            const deadline = extractHardDeadline({
                email_text: bodyText,
                reference_timestamp: Date.now(),
                reference_timezone: 'UTC'
            });
            console.log(`    Hard deadline found: ${deadline.deadline_found}`);
            if (deadline.deadline_found) {
                console.log(`      Deadline text: "${deadline.deadline_text}"`);
                console.log(`      Source span: "${deadline.source_span}"`);
                console.log(`      Span valid: ${validateSourceSpan(bodyText, deadline.source_span)}`);
            }
        }
        
        // Test urgency
        if (routing.extract_urgency) {
            const urgency = detectUrgencySignal({ email_text: bodyText });
            console.log(`    Urgency found: ${urgency.urgency_found}`);
            if (urgency.urgency_found) {
                console.log(`      Level: ${urgency.urgency_level}`);
                console.log(`      Indicators: ${urgency.indicators.join(', ')}`);
            }
        }
        
        // Full extraction
        const fullExtraction = orchestrateLLMExtraction(bodyText, Date.now(), 'UTC', msg.sender, subject);
        console.log(`    Full extraction result:`, JSON.stringify({
            hasHardDeadline: !!fullExtraction.hardDeadline?.deadline_found,
            hasSoftDeadline: !!fullExtraction.softDeadline?.signal_found,
            hasUrgency: !!fullExtraction.urgencySignal?.urgency_found,
            hasClosure: !!fullExtraction.closure?.closure_found,
            routing: fullExtraction.routing.reasoning
        }, null, 2));
    }

    console.log('\nWORKING WATCHER - First message:');
    if (workingMessages[0]) {
        const msg = workingMessages[0] as any;
        console.log(`  Subject: "${msg.subject}"`);
        console.log(`  Sender: ${msg.sender}`);
        console.log(`  Body excerpt: "${msg.body_text_extract}"`);
        console.log(`  Body excerpt length: ${msg.body_text_extract?.length || 0}`);
        
        const bodyText = msg.body_text_extract || '';
        const subject = msg.subject || '';
        
        console.log('\n  MANUAL EXTRACTION TEST:');
        
        // Full extraction
        const fullExtraction = orchestrateLLMExtraction(bodyText, Date.now(), 'UTC', msg.sender, subject);
        console.log(`    Full extraction result:`, JSON.stringify({
            hasHardDeadline: !!fullExtraction.hardDeadline?.deadline_found,
            hasSoftDeadline: !!fullExtraction.softDeadline?.signal_found,
            hasUrgency: !!fullExtraction.urgencySignal?.urgency_found,
            hasClosure: !!fullExtraction.closure?.closure_found,
            routing: fullExtraction.routing.reasoning
        }, null, 2));
    }

    logHeader('4. SENDER VALIDATION DEEP DIVE');
    
    // Get all unique senders from problem watcher messages
    const problemSenders = [...new Set(problemMessages.map((m: any) => m.sender))];
    console.log(`\nProblem watcher senders: ${problemSenders.join(', ')}`);
    console.log(`Allowed senders list: ${JSON.stringify(problemAllowedSenders)}`);
    
    for (const sender of problemSenders) {
        const allowed = validateSenderAllowed(sender, problemAllowedSenders);
        log(allowed ? 'green' : 'red', `  ${sender}: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
    }

    logHeader('DIAGNOSIS COMPLETE');
    
    await closeDatabase();
}

main().catch(console.error);
