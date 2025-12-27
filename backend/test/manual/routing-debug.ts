/**
 * Debug script to show routing decisions for various emails
 */

import { routeEmail, getSignalDetails } from "@/llm/router";

interface TestCase {
    name: string;
    body: string;
    subject: string;
}

const testCases: TestCase[] = [
    // Should NOT trigger extraction
    { name: "Simple Greeting", body: "Hi! Just wanted to say hello.", subject: "Hello" },
    { name: "FYI Informational", body: "FYI - Here are the notes from the meeting.", subject: "Notes" },
    { name: "Newsletter", body: "Welcome to this week's newsletter!", subject: "Weekly Update" },
    { name: "Casual Chat", body: "How was your weekend? Mine was great.", subject: "Hey" },

    // SHOULD trigger extraction
    { name: "Hard Deadline", body: "The report is due by Friday at 5pm.", subject: "Report" },
    { name: "Urgent Request", body: "URGENT: Server is down, need help ASAP!", subject: "Help" },
    { name: "Soft Deadline", body: "Would be great to have this by end of week.", subject: "Request" },
    { name: "Combined Signals", body: "URGENT: This is due by tomorrow. Problem resolved.", subject: "Alert" },
];

console.log("\n=== Email Routing Debug ===\n");
console.log("| Email Type          | Deadline | Soft | Urgency | Closure | Reasoning");
console.log("|---------------------|----------|------|---------|---------|----------");

for (const test of testCases) {
    const routing = routeEmail({
        email_text: test.body,
        sender_email: "test@example.com",
        subject: test.subject,
    });

    const d = routing.extract_deadline ? "YES" : "-";
    const s = routing.extract_soft_deadline ? "YES" : "-";
    const u = routing.extract_urgency ? "YES" : "-";
    const c = routing.extract_closure ? "YES" : "-";

    console.log(
        `| ${test.name.padEnd(19)} | ${d.padEnd(8)} | ${s.padEnd(4)} | ${u.padEnd(7)} | ${c.padEnd(7)} | ${routing.reasoning?.substring(0, 40)}...`
    );
}

console.log("\n=== Detailed Signal Analysis ===\n");

// Show detailed analysis for a complex email
const complexEmail = {
    body: "URGENT: The quarterly report is due by December 15th. Please complete ASAP. Once done, mark as resolved.",
    subject: "Quarterly Report Deadline",
};

console.log("Email:", complexEmail.subject);
console.log("Body:", complexEmail.body);
console.log("");

const details = getSignalDetails(complexEmail.body, complexEmail.subject);

console.log("Signal Detection:");
console.log(`  Deadline: ${details.deadline.detected ? "YES" : "NO"}`);
if (details.deadline.matches.length > 0) {
    console.log(`    Matches: ${details.deadline.matches.join(", ")}`);
}

console.log(`  Soft Deadline: ${details.softDeadline.detected ? "YES" : "NO"}`);
if (details.softDeadline.matches.length > 0) {
    console.log(`    Matches: ${details.softDeadline.matches.join(", ")}`);
}

console.log(`  Urgency: ${details.urgency.detected ? "YES" : "NO"}`);
if (details.urgency.matches.length > 0) {
    console.log(`    Matches: ${details.urgency.matches.join(", ")}`);
}

console.log(`  Closure: ${details.closure.detected ? "YES" : "NO"}`);
if (details.closure.matches.length > 0) {
    console.log(`    Matches: ${details.closure.matches.join(", ")}`);
}

console.log(`  Informational: ${details.informational.detected ? "YES" : "NO"}`);
if (details.informational.matches.length > 0) {
    console.log(`    Matches: ${details.informational.matches.join(", ")}`);
}

console.log("");
