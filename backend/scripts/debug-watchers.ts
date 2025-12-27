/**
 * Debug watchers for an account
 */
import { initializeDatabase, closeDatabase, queryMany } from "@/db/client";
import { getEvents, getEventsForWatcher, getEventsForWatchers } from "@/db/event-store";
import { replayEvents } from "@/watcher/runtime";

async function main() {
    await initializeDatabase();

    const accountId = "c39161d8-0523-479c-a1bc-1dccf50cf246";

    // Step 1: Get all WATCHER_CREATED events
    const watcherCreateEvents = await getEvents({ types: ["WATCHER_CREATED"] });
    console.log("All WATCHER_CREATED events:", watcherCreateEvents.length);

    // Step 2: Filter for this account
    const accountWatcherEvents = watcherCreateEvents.filter(
        (event) =>
            event.type === "WATCHER_CREATED" && event.account_id === accountId
    );
    console.log("WATCHER_CREATED for account:", accountWatcherEvents.length);

    // Step 3: Get watcher IDs
    const watcherIds = accountWatcherEvents
        .map((e) => e.watcher_id)
        .filter((id): id is string => id !== undefined);
    console.log("Watcher IDs:", watcherIds);

    // Step 4: Get all events for these watchers
    if (watcherIds.length > 0) {
        const eventsByWatcher = await getEventsForWatchers(watcherIds);
        console.log("Events by watcher:", eventsByWatcher.size);

        for (const [watcherId, events] of eventsByWatcher) {
            console.log(
                "  Watcher:",
                watcherId.slice(0, 8),
                "- events:",
                events.length
            );
            for (const e of events) {
                console.log("    ", e.type);
            }

            // Replay events to get state
            const state = replayEvents(events);
            console.log("    Status:", state.status, "Account:", state.account_id?.slice(0, 8));
        }
    }

    await closeDatabase();
}

main().catch(console.error);
