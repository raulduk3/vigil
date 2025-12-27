import { orchestrateIngestion, type IngestionContext } from "@/ingestion/orchestrator";
import { DEFAULT_POLICY } from "@/watcher/urgency";

const policy = {
  ...DEFAULT_POLICY,
  allowed_senders: ["sender@example.com"],
};

const context: IngestionContext = {
  watcher_id: "test-watcher",
  watcher_status: "active",
  policy,
  reference_timestamp: Date.now(),
  reference_timezone: "UTC",
};

const seenIds = new Set<string>();
const checkDuplicate = async (id: string) => seenIds.has(id);
const getExistingThreads = async () => ({
  threads: new Map(),
  messageIdMap: new Map(),
});

async function testEmail(name: string, body: string) {
  const msgId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const rawEmail = `From: sender@example.com
To: test@ingest.email.vigil.run
Subject: ${name}
Date: Thu, 26 Dec 2024 10:00:00 GMT
Message-ID: <${msgId}@example.com>

${body}`;

  const result = await orchestrateIngestion(rawEmail, context, checkDuplicate, getExistingThreads);

  const extractionTypes = result.extraction_events.map(e => e.type);
  const hasThread = result.thread_event !== null && result.thread_event !== undefined;

  const extractStr = extractionTypes.length > 0
    ? extractionTypes.map(t => t.replace("_OBSERVED", "").replace("_SIGNAL", "")).join(", ")
    : "none";

  const status = hasThread ? "YES" : "NO";

  console.log(`| ${name.padEnd(28)} | ${extractStr.padEnd(35)} | ${status.padEnd(4)} |`);

  return { name, extractionTypes, hasThread };
}

async function main() {
  console.log("\n=== Thread Creation Test Results ===\n");
  console.log("| Email Type                   | Extractions                         | Thread |");
  console.log("|------------------------------|-------------------------------------|--------|");

  // Emails that should NOT create threads
  const noThreadTests = [
    { name: "Simple Greeting", body: "Hi! Just wanted to say hello." },
    { name: "FYI Informational", body: "Here are the notes. No action required." },
    { name: "Newsletter", body: "Welcome to this week's newsletter!" },
    { name: "Thank You", body: "Thanks for your help yesterday!" },
    { name: "Simple Question", body: "Do you know where the file is?" },
    { name: "Status Update", body: "Just letting you know the server is back up." },
    { name: "Casual Chat", body: "How was your weekend? Mine was great." },
  ];

  for (const test of noThreadTests) {
    await testEmail(test.name, test.body);
  }

  console.log("|------------------------------|-------------------------------------|--------|");

  // Emails that SHOULD create threads (controls) - using patterns that match regex
  const threadTests = [
    { name: "Hard Deadline", body: "The report is due by Friday at 5pm." },
    { name: "Urgent Request", body: "URGENT: Server is down, need help ASAP!" },
    { name: "Soft Deadline", body: "Would be great to have this by end of week." },
    { name: "Action Required", body: "This is due by tomorrow at noon." },
  ];

  for (const test of threadTests) {
    await testEmail(test.name, test.body);
  }

  console.log("\n");
  console.log("Expected: Top group (NO thread), Bottom group (YES thread)");
}

main().catch(console.error);
