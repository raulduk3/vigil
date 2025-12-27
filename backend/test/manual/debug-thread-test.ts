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

async function main() {
  const msgId = `test-${Date.now()}`;
  const rawEmail = `From: sender@example.com
To: test@ingest.email.vigil.run
Subject: Hard Deadline Test
Date: Thu, 26 Dec 2024 10:00:00 GMT
Message-ID: <${msgId}@example.com>

The report is due by Friday at 5pm.`;

  console.log("Raw email:");
  console.log(rawEmail);
  console.log("\n---\n");

  const result = await orchestrateIngestion(rawEmail, context, checkDuplicate, getExistingThreads);

  console.log("Result:");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n--- Summary ---");
  console.log("Success:", result.success);
  console.log("Extraction events:", result.extraction_events.length);
  result.extraction_events.forEach(e => console.log(" -", e.type));
  console.log("Thread event:", result.thread_event ? result.thread_event.type : null);
}

main().catch(console.error);
