/**
 * Vigil Backend Control Plane
 *
 * Persistent HTTP server that orchestrates all backend components.
 * This is the main entry point for the Vigil backend service.
 *
 * Components:
 * - HTTP API server (Bun.serve)
 * - PostgreSQL event store
 * - Authentication (JWT + bcrypt)
 * - Scheduler worker (TIME_TICK generation)
 * - Notification worker (alert delivery)
 *
 * The control plane should never go down - it's the heart of the system.
 */

import {
    initializeDatabase,
    closeDatabase,
    checkDatabaseHealth,
} from "@/db/client";
import {
    appendEvent,
    appendEvents,
    getEventsForWatcher,
    getEventsForWatchers,
    getEvents,
    getEventById,
} from "@/db/event-store";
import {
    routeRequest,
    handleSystemHealth,
    type HttpRequest,
    type HttpResponse,
    type HandlerContext,
    type ComponentHealth,
} from "@/api/handlers";
import { parseAuthFromHeaders } from "@/auth/middleware";
import { registerUser, loginUser, refreshTokens } from "@/auth/users";
import {
    replayEvents,
    type WatcherState,
    type ThreadState,
} from "@/watcher/runtime";
import {
    startScheduler,
    stopScheduler,
    getSchedulerHealth,
} from "@/scheduler/worker";
import {
    startNotificationWorker,
    stopNotificationWorker,
    getNotificationWorkerHealth,
} from "@/worker/worker";
import { orchestrateIngestion } from "@/ingestion/orchestrator";
import type { VigilEvent } from "@/events/types";
import { initLogger, getLogger, generateCorrelationId } from "@/logging";
import {
    checkEmailUsage,
    incrementEmailUsage,
    getEffectivePlan,
} from "@/billing";

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : ["*"];

function isOriginAllowed(origin: string | null): boolean {
    if (!origin) return true;
    if (CORS_ORIGINS.includes("*")) return true;
    return CORS_ORIGINS.includes(origin);
}

// ============================================================================
// State Cache (for performance - rebuilt from events on demand)
// ============================================================================

const watcherStateCache = new Map<
    string,
    { state: WatcherState; expires: number }
>();
const CACHE_TTL_MS = 10000; // 10 second cache

/**
 * Get watcher state, using cache if available.
 */
async function getWatcherState(
    watcherId: string
): Promise<WatcherState | null> {
    const now = Date.now();
    const cached = watcherStateCache.get(watcherId);

    if (cached && cached.expires > now) {
        return cached.state;
    }

    // Rebuild from events
    const events = await getEventsForWatcher(watcherId);
    if (events.length === 0) {
        return null;
    }

    const state = replayEvents(events);
    watcherStateCache.set(watcherId, { state, expires: now + CACHE_TTL_MS });

    return state;
}

/**
 * Get watcher by ingest token.
 */
async function getWatcherByToken(token: string): Promise<WatcherState | null> {
    // Find WATCHER_CREATED event with matching ingest_token
    const events = await getEvents({ types: ["WATCHER_CREATED"] });

    for (const event of events) {
        if (event.type === "WATCHER_CREATED" && event.ingest_token === token) {
            return getWatcherState(event.watcher_id);
        }
    }

    return null;
}

/**
 * Get thread by ID within a watcher.
 */
async function getThreadById(
    watcherId: string,
    threadId: string
): Promise<ThreadState | null> {
    const watcher = await getWatcherState(watcherId);
    if (!watcher) {
        return null;
    }

    return watcher.threads.get(threadId) || null;
}

/**
 * Invalidate cache for a watcher (call after events are appended).
 */
function invalidateCache(watcherId: string): void {
    watcherStateCache.delete(watcherId);
}

// ============================================================================
// Handler Context Factory
// ============================================================================

function createHandlerContext(): HandlerContext {
    const log = getLogger();

    return {
        eventStore: {
            append: async (event: VigilEvent) => {
                // Invalidate cache BEFORE write to prevent race condition
                if (event.watcher_id) {
                    invalidateCache(event.watcher_id);
                }
                await appendEvent(event);

                // Log event creation
                log.database.debug(
                    "Event appended",
                    {
                        watcher_id: event.watcher_id,
                        event_id: event.event_id,
                    },
                    {
                        event_type: event.type,
                    }
                );
            },
            getEventsForWatcher,
            getEventsForAccount: async (accountId: string) => {
                const watcherCreateEvents = await getEvents({
                    types: ["WATCHER_CREATED"],
                });

                const watcherIds = watcherCreateEvents
                    .filter(
                        (event) =>
                            event.type === "WATCHER_CREATED" &&
                            event.account_id === accountId
                    )
                    .map((event) => event.watcher_id)
                    .filter((id): id is string => id !== undefined);

                if (watcherIds.length === 0) {
                    return [];
                }

                const eventsByWatcher = await getEventsForWatchers(watcherIds);
                const aggregated: VigilEvent[] = [];

                for (const watcherId of watcherIds) {
                    const events = eventsByWatcher.get(watcherId);
                    if (events?.length) {
                        aggregated.push(...events);
                    }
                }

                return aggregated;
            },
            getEventsByIds: async (eventIds: readonly string[]) => {
                const events = await Promise.all(
                    eventIds.map((id) => getEventById(id))
                );
                return events.filter((e): e is VigilEvent => e !== null);
            },
            getEventsSince: async (
                watcherId: string,
                sinceTimestamp: number
            ) => {
                const events = await getEventsForWatcher(watcherId);
                return events.filter((e) => e.timestamp >= sinceTimestamp);
            },
            getAllEvents: async () => {
                return getEvents({});
            },
            getEvents: async (options: Parameters<typeof getEvents>[0]) => {
                return getEvents(options);
            },
        },
        getWatcherByToken,
        getWatcherById: getWatcherState,
        getThreadById,
        validateAuth: async (authHeader: string | undefined) => {
            const result = parseAuthFromHeaders({ authorization: authHeader });
            return result.authenticated && result.context
                ? result.context
                : null;
        },
        registerUser: async (email: string, password: string) => {
            return registerUser({ email, password });
        },
        loginUser: async (email: string, password: string) => {
            return loginUser({ email, password });
        },
        refreshTokens: async (token: string) => {
            return refreshTokens(token);
        },
        orchestrateIngestion: async (
            rawEmail: string,
            watcherId: string,
            _ingestToken: string
        ) => {
            log.ingestion.info(
                "Email ingestion started",
                { watcher_id: watcherId },
                {
                    email_size: rawEmail.length,
                }
            );

            // Get watcher state for orchestration context
            const watcher = await getWatcherState(watcherId);
            if (!watcher) {
                log.ingestion.error("Watcher not found for ingestion", {
                    watcher_id: watcherId,
                });
                throw new Error(`Watcher ${watcherId} not found`);
            }

            // Check email usage limits based on subscription
            const accountId = watcher.account_id;
            if (accountId) {
                const plan = await getEffectivePlan(accountId);
                const usageCheck = await checkEmailUsage(accountId, plan);

                if (!usageCheck.allowed) {
                    log.ingestion.warn(
                        "Email limit exceeded",
                        {
                            watcher_id: watcherId,
                            account_id: accountId,
                        },
                        {
                            current_usage: usageCheck.current_usage,
                            limit: usageCheck.limit,
                            plan,
                            period_ends_at: new Date(
                                usageCheck.period_ends_at
                            ).toISOString(),
                        }
                    );
                    throw new Error(
                        `EMAIL_LIMIT_EXCEEDED: Account has used ${usageCheck.current_usage}/${usageCheck.limit} emails this week. Upgrade plan or wait until ${new Date(usageCheck.period_ends_at).toISOString()}`
                    );
                }
            }

            // Create default policy if none exists (empty allowlist = allow all)
            const policy: import("@/events/types").WatcherPolicy =
                watcher.policy || {
                    allowed_senders: [],
                    silence_threshold_hours: 72,
                    deadline_warning_hours: 24,
                    deadline_critical_hours: 2,
                    notification_channels: [],
                    reporting_cadence: "on_demand",
                    reporting_recipients: [],
                };

            // Create ingestion context
            const context = {
                watcher_id: watcherId,
                watcher_status: watcher.status,
                policy: policy,
                reference_timestamp: Date.now(),
                reference_timezone: "UTC", // TODO: get from watcher config
            };

            // Check for duplicate messages
            const checkDuplicate = async (
                messageId: string
            ): Promise<boolean> => {
                const events = await getEventsForWatcher(watcherId);
                return events.some(
                    (e) =>
                        e.type === "MESSAGE_RECEIVED" &&
                        e.message_id === messageId
                );
            };

            // Get existing threads for thread detection
            const getExistingThreads = async (): Promise<{
                threads: Map<string, ThreadState>;
                messageIdMap: Map<string, string>;
            }> => {
                const watcher = await getWatcherState(watcherId);
                // Convert ReadonlyMap to Map for compatibility
                const threads = new Map(watcher?.threads || []);

                // Get all MESSAGE_RECEIVED events to map original Message-IDs to thread IDs
                const events = await getEventsForWatcher(watcherId, {
                    types: ["MESSAGE_RECEIVED"],
                });

                // Build message ID to thread ID map (includes both vigil IDs and original IDs)
                const messageIdMap = new Map<string, string>();

                // First, map vigil message IDs from threads
                for (const [threadId, thread] of threads) {
                    for (const vigilMsgId of thread.message_ids) {
                        messageIdMap.set(vigilMsgId, threadId);

                        // Find corresponding MESSAGE_RECEIVED event to get original Message-ID
                        const msgEvent = events.find(
                            (e) =>
                                e.type === "MESSAGE_RECEIVED" &&
                                e.message_id === vigilMsgId
                        );

                        if (msgEvent && msgEvent.type === "MESSAGE_RECEIVED") {
                            const originalMsgId =
                                msgEvent.headers?.["message-id"];
                            if (originalMsgId) {
                                // Map original Message-ID (with angle brackets)
                                messageIdMap.set(originalMsgId, threadId);
                                // Also map without angle brackets in case they're stripped
                                const cleanId = originalMsgId.replace(
                                    /^<|>$/g,
                                    ""
                                );
                                messageIdMap.set(cleanId, threadId);
                            }
                        }
                    }
                }

                return { threads, messageIdMap };
            };

            // Call orchestration pipeline
            const result = await orchestrateIngestion(
                rawEmail,
                context,
                checkDuplicate,
                getExistingThreads
            );

            // Collect all events to emit in logical order:
            // 1. MESSAGE_RECEIVED (email arrives)
            // 2. ROUTE_EXTRACTION_COMPLETE (routing decision - what signals to look for)
            // 3. Detailed extraction signals (HARD_DEADLINE, SOFT_DEADLINE, URGENCY, CLOSURE)
            // 4. MESSAGE_ROUTED (thread routing decision with evidence)
            // 5. EXTRACTION_COMPLETE (summary of what was found)
            // 6. THREAD_OPENED/THREAD_ACTIVITY_OBSERVED (thread created/updated based on extraction)
            // 7. MESSAGE_THREAD_ASSOCIATED (soft association for audit trail)
            // 8. REMINDER_CREATED (portable semantic obligations from extraction)
            // 9. THREAD_CLOSED (if closure signal detected)
            const allEvents: VigilEvent[] = [];

            // Step 1: MESSAGE_RECEIVED
            if (result.message_received_event) {
                allEvents.push(result.message_received_event);
            }

            // Step 2: ROUTE_EXTRACTION_COMPLETE (routing decision)
            const routeEventFound = result.extraction_events.find(
                (e) => e.type === "ROUTE_EXTRACTION_COMPLETE"
            );
            if (routeEventFound) {
                allEvents.push(routeEventFound);
            }

            // Step 3: Detailed extraction signals (what was actually found)
            const signalEvents = result.extraction_events.filter(
                (e) =>
                    e.type === "HARD_DEADLINE_OBSERVED" ||
                    e.type === "SOFT_DEADLINE_SIGNAL_OBSERVED" ||
                    e.type === "URGENCY_SIGNAL_OBSERVED" ||
                    e.type === "CLOSURE_SIGNAL_OBSERVED"
            );
            allEvents.push(...signalEvents);

            // Step 4: MESSAGE_ROUTED (thread routing decision with evidence)
            if (result.routing_event) {
                allEvents.push(result.routing_event);
            }

            // Step 5: EXTRACTION_COMPLETE (summary)
            const extractionCompleteFinal = result.extraction_events.find(
                (e) => e.type === "EXTRACTION_COMPLETE"
            );
            if (extractionCompleteFinal) {
                // Update with thread_id if thread will be created
                if (result.thread_event && "thread_id" in extractionCompleteFinal) {
                    const threadId = "thread_id" in result.thread_event ? result.thread_event.thread_id : undefined;
                    (extractionCompleteFinal as any).thread_id = threadId;
                }
                allEvents.push(extractionCompleteFinal);
            }

            // Step 6: Thread event (THREAD_OPENED or THREAD_ACTIVITY_OBSERVED)
            // Threads are created/updated AFTER extraction completes based on found signals
            if (result.thread_event) {
                allEvents.push(result.thread_event);
            }

            // Step 7: MESSAGE_THREAD_ASSOCIATED (soft association for audit trail)
            if (result.association_event) {
                allEvents.push(result.association_event);
            }

            // Step 8: REMINDER_CREATED (portable semantic obligations from extraction)
            if (result.reminder_events && result.reminder_events.length > 0) {
                allEvents.push(...result.reminder_events);
            }

            // Step 9: THREAD_CLOSED (if closure signal detected)
            if (result.closure_event) {
                allEvents.push(result.closure_event);
            }

            // Append all events atomically
            await appendEvents(allEvents);
            invalidateCache(watcherId);

            // Log ingestion completion with details
            const eventTypes = allEvents.map((e) => e.type);
            const threadEvent = allEvents.find(
                (e) =>
                    e.type === "THREAD_OPENED" ||
                    e.type === "THREAD_ACTIVITY_OBSERVED"
            );
            const messageEvent = allEvents.find(
                (e) => e.type === "MESSAGE_RECEIVED"
            );

            // Extract IDs safely using 'in' operator for type narrowing
            const threadId =
                threadEvent && "thread_id" in threadEvent
                    ? threadEvent.thread_id
                    : undefined;
            const messageId =
                messageEvent && "message_id" in messageEvent
                    ? messageEvent.message_id
                    : undefined;

            log.ingestion.info(
                "Email ingestion completed",
                {
                    watcher_id: watcherId,
                    thread_id: threadId,
                    message_id: messageId,
                },
                {
                    events_generated: allEvents.length,
                    event_types: eventTypes,
                    thread_created: eventTypes.includes("THREAD_OPENED"),
                }
            );

            // Log extraction pipeline with detailed breakdown
            const routeEvent = allEvents.find(
                (e) => e.type === "ROUTE_EXTRACTION_COMPLETE"
            );
            const extractionCompleteEvent = allEvents.find(
                (e) => e.type === "EXTRACTION_COMPLETE"
            );

            if (routeEvent && "extract_deadline" in routeEvent) {
                log.extraction.info(
                    "Route extraction - determined which signals to extract",
                    {
                        watcher_id: watcherId,
                        message_id: messageId,
                    },
                    {
                        extract_deadline: routeEvent.extract_deadline,
                        extract_soft_deadline: routeEvent.extract_soft_deadline,
                        extract_urgency: routeEvent.extract_urgency,
                        extract_closure: routeEvent.extract_closure,
                        reasoning: (routeEvent as any).routing_reasoning,
                    }
                );
            }

            if (extractionCompleteEvent && "signals_count" in extractionCompleteEvent) {
                const signalsFound = (extractionCompleteEvent as any).signals_count > 0;
                log.extraction.info(
                    signalsFound
                        ? "Extraction complete - signals found in message body"
                        : "Extraction complete - no signals detected in message body",
                    {
                        watcher_id: watcherId,
                        message_id: messageId,
                    },
                    {
                        hard_deadline: (extractionCompleteEvent as any).hard_deadline_found,
                        soft_deadline: (extractionCompleteEvent as any).soft_deadline_found,
                        urgency_signal: (extractionCompleteEvent as any).urgency_signal_found,
                        closure_signal: (extractionCompleteEvent as any).closure_signal_found,
                        signals_count: (extractionCompleteEvent as any).signals_count,
                    }
                );
            }

            if (threadEvent) {
                const action =
                    threadEvent.type === "THREAD_OPENED"
                        ? "created based on extraction results"
                        : "updated with new activity";
                log.thread.info(
                    `Thread ${action}`,
                    {
                        watcher_id: watcherId,
                        message_id: messageId,
                        thread_id: threadId,
                    },
                    {
                        thread_type: threadEvent.type,
                        trigger_type:
                            "trigger_type" in threadEvent
                                ? threadEvent.trigger_type
                                : undefined,
                    }
                );
            }

            // Increment email usage counter after successful ingestion
            if (accountId && result.message_received_event) {
                const plan = await getEffectivePlan(accountId);
                await incrementEmailUsage(accountId, plan);
                log.ingestion.debug(
                    "Email usage incremented",
                    {
                        watcher_id: watcherId,
                        account_id: accountId,
                    },
                    {
                        plan,
                    }
                );
            }

            return allEvents;
        },
    };
}

// ============================================================================
// HTTP Server
// ============================================================================

/**
 * Parse incoming request to HttpRequest format.
 */
async function parseRequest(req: Request, url: URL): Promise<HttpRequest> {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
    });

    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
        query[key] = value;
    });

    let body: string | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
        try {
            body = await req.text();
        } catch {
            body = null;
        }
    }

    return {
        method: req.method,
        path: url.pathname,
        params: {},
        query,
        headers,
        body,
    };
}

/**
 * Convert HttpResponse to Response.
 */
function toResponse(httpResponse: HttpResponse): Response {
    return new Response(httpResponse.body, {
        status: httpResponse.status,
        headers: httpResponse.headers,
    });
}

// ============================================================================
// Health Providers
// ============================================================================

function getComponentHealthProviders(): Map<
    string,
    () => Promise<ComponentHealth>
> {
    const providers: Array<[string, () => Promise<ComponentHealth>]> = [
        [
            "database",
            async (): Promise<ComponentHealth> => {
                const health = await checkDatabaseHealth();
                return {
                    status: health.connected ? "healthy" : "unhealthy",
                    last_heartbeat: new Date().toISOString(),
                    metrics: {
                        latency_ms: health.latency_ms,
                        pool_idle: health.pool_idle,
                        pool_total: health.pool_total,
                    },
                };
            },
        ],
        [
            "scheduler",
            async (): Promise<ComponentHealth> => {
                const health = getSchedulerHealth();
                return {
                    status:
                        health.status === "degraded"
                            ? "degraded"
                            : health.status,
                    last_heartbeat: new Date(health.last_tick).toISOString(),
                    metrics: {
                        ticks_emitted: health.ticks_emitted,
                        errors: health.errors,
                    },
                };
            },
        ],
        [
            "notification_worker",
            async (): Promise<ComponentHealth> => {
                const health = getNotificationWorkerHealth();
                return {
                    status:
                        health.status === "degraded"
                            ? "degraded"
                            : health.status,
                    last_heartbeat: new Date(health.last_poll).toISOString(),
                    metrics: {
                        alerts_processed: health.alerts_processed,
                        alerts_sent: health.alerts_sent,
                        alerts_failed: health.alerts_failed,
                    },
                };
            },
        ],
    ];
    return new Map(providers);
}

// ============================================================================
// Main Server
// ============================================================================

async function main() {
    // Initialize logging first
    const validLogLevels = ["debug", "info", "warn", "error", "fatal"] as const;
    const envLogLevel = process.env.LOG_LEVEL;
    const minLevel =
        envLogLevel &&
        validLogLevels.includes(envLogLevel as (typeof validLogLevels)[number])
            ? (envLogLevel as (typeof validLogLevels)[number])
            : "info";

    const logger = initLogger({
        minLevel,
        logDir: process.env.LOG_DIR || "./logs",
        console: process.env.LOG_CONSOLE !== "false",
        file: process.env.LOG_FILE !== "false",
        perEntityLogs: true,
        prettyConsole: process.env.NODE_ENV !== "production",
    });

    console.log(
        "═══════════════════════════════════════════════════════════════"
    );
    console.log("  Vigil Backend Control Plane v0.1.0");
    console.log("  Deterministic Event-Sourced Vigilance System");
    console.log(
        "═══════════════════════════════════════════════════════════════"
    );
    console.log("");

    logger.system.info(
        "Vigil Backend starting",
        {},
        {
            version: "0.1.0",
            node_version: process.version,
            platform: process.platform,
            pid: process.pid,
        }
    );

    // Initialize database
    logger.system.info("Initializing PostgreSQL connection");
    try {
        await initializeDatabase();
        logger.database.info("Database connected and migrations applied");
    } catch (error) {
        logger.database.error(
            "Database initialization failed",
            {},
            {},
            error instanceof Error ? error : new Error(String(error))
        );
        logger.system.warn("Starting in degraded mode (no persistence)");
    }

    // Start background workers
    logger.scheduler.info(
        "Starting scheduler worker",
        {},
        { tick_interval_ms: 60000 }
    );
    startScheduler({ tick_interval_ms: 60000 });

    logger.worker.info(
        "Starting notification worker",
        {},
        { poll_interval_ms: 5000 }
    );
    startNotificationWorker({ poll_interval_ms: 5000 });

    // Create handler context
    const context = createHandlerContext();
    const healthProviders = getComponentHealthProviders();

    // Start HTTP server
    Bun.serve({
        port: PORT,
        hostname: HOST,

        async fetch(req: Request): Promise<Response> {
            const startTime = Date.now();
            const correlationId =
                req.headers.get("x-correlation-id") || generateCorrelationId();
            const url = new URL(req.url);
            const origin = req.headers.get("origin");
            const corsHeaders: Record<string, string> = {
                "X-Correlation-ID": correlationId,
            };

            if (isOriginAllowed(origin)) {
                corsHeaders["Access-Control-Allow-Origin"] = origin || "*";
                corsHeaders["Access-Control-Allow-Methods"] =
                    "GET, POST, PUT, PATCH, DELETE, OPTIONS";
                corsHeaders["Access-Control-Allow-Headers"] =
                    "Content-Type, Authorization, X-Correlation-ID";
                corsHeaders["Access-Control-Expose-Headers"] =
                    "X-Correlation-ID";
                corsHeaders["Access-Control-Max-Age"] = "86400";
                // Allow credentials when origin is specific (not wildcard)
                if (origin) {
                    corsHeaders["Access-Control-Allow-Credentials"] = "true";
                }
            }

            // CORS preflight
            if (req.method === "OPTIONS") {
                return new Response(null, {
                    status: 204,
                    headers: corsHeaders,
                });
            }

            const logCtx = { correlation_id: correlationId };

            // Log incoming request
            logger.api.info(`→ ${req.method} ${url.pathname}`, logCtx, {
                method: req.method,
                path: url.pathname,
                query: Object.fromEntries(url.searchParams),
                ip:
                    req.headers.get("x-forwarded-for") ||
                    req.headers.get("x-real-ip"),
                user_agent: req.headers.get("user-agent"),
            });

            try {
                // Special handling for system health endpoint
                if (
                    req.method === "GET" &&
                    url.pathname === "/api/system/health"
                ) {
                    const response = await handleSystemHealth(healthProviders);
                    const res = toResponse(response);
                    Object.entries(corsHeaders).forEach(([k, v]) =>
                        res.headers.set(k, v)
                    );

                    logger.api.debug(
                        `← ${req.method} ${url.pathname} ${response.status}`,
                        logCtx,
                        {
                            status: response.status,
                            duration_ms: Date.now() - startTime,
                        }
                    );

                    return res;
                }

                // Route all other requests
                const request = await parseRequest(req, url);
                const response = await routeRequest(request, context);

                const res = toResponse(response);
                Object.entries(corsHeaders).forEach(([k, v]) =>
                    res.headers.set(k, v)
                );

                // Log response
                const logMethod =
                    response.status >= 500
                        ? logger.api.error
                        : response.status >= 400
                          ? logger.api.warn
                          : logger.api.info;

                logMethod(
                    `← ${req.method} ${url.pathname} ${response.status}`,
                    logCtx,
                    {
                        status: response.status,
                        duration_ms: Date.now() - startTime,
                    }
                );

                return res;
            } catch (error) {
                const duration = Date.now() - startTime;
                logger.api.error(
                    `✗ ${req.method} ${url.pathname} - Unhandled error`,
                    logCtx,
                    { duration_ms: duration },
                    error instanceof Error ? error : new Error(String(error))
                );

                return new Response(
                    JSON.stringify({ error: "Internal server error" }),
                    {
                        status: 500,
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                            "X-Correlation-ID": correlationId,
                        },
                    }
                );
            }
        },

        error(error: Error): Response {
            logger.system.fatal("Unhandled server error", {}, {}, error);
            return new Response(
                JSON.stringify({ error: "Internal server error" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        },
    });

    console.log("");
    console.log(`[Server] Listening on http://${HOST}:${PORT}`);
    console.log("");
    console.log("API Endpoints:");
    console.log("  Health:     GET  /health");
    console.log("  System:     GET  /api/system/health");
    console.log("  Auth:");
    console.log("    Register: POST /api/auth/register");
    console.log("    Login:    POST /api/auth/login");
    console.log("    Refresh:  POST /api/auth/refresh");
    console.log("  Watchers:");
    console.log("    List:     GET  /api/watchers");
    console.log("    Create:   POST /api/watchers");
    console.log("    Get:      GET  /api/watchers/:id");
    console.log("    Delete:   DEL  /api/watchers/:id");
    console.log("    Activate: POST /api/watchers/:id/activate");
    console.log("    Pause:    POST /api/watchers/:id/pause");
    console.log("    Resume:   POST /api/watchers/:id/resume");
    console.log("    Policy:   PATCH /api/watchers/:id/policy");
    console.log("  Threads:");
    console.log("    List:     GET  /api/watchers/:id/threads");
    console.log("    Close:    POST /api/watchers/:id/threads/:tid/close");
    console.log("  Events:");
    console.log("    List:     GET  /api/watchers/:id/events");
    console.log("    Logs:     GET  /api/watchers/:id/logs");
    console.log("  Ingestion:");
    console.log("    Email:    POST /ingest/:token");
    console.log("");
    console.log("[Server] Ready to accept requests");
    console.log(`[Logging] Log files: ${process.env.LOG_DIR || "./logs"}`);

    logger.system.info(
        "Server ready",
        {},
        {
            host: HOST,
            port: PORT,
            log_dir: process.env.LOG_DIR || "./logs",
        }
    );

    // Graceful shutdown
    process.on("SIGINT", async () => {
        logger.system.info("Received SIGINT, shutting down gracefully");
        console.log(
            "\n[Shutdown] Received SIGINT, shutting down gracefully..."
        );
        stopScheduler();
        stopNotificationWorker();
        await closeDatabase();
        await logger.flush();
        await logger.close();
        console.log("[Shutdown] Goodbye!");
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        logger.system.info("Received SIGTERM, shutting down gracefully");
        console.log(
            "\n[Shutdown] Received SIGTERM, shutting down gracefully..."
        );
        stopScheduler();
        stopNotificationWorker();
        await closeDatabase();
        await logger.flush();
        await logger.close();
        console.log("[Shutdown] Goodbye!");
        process.exit(0);
    });
}

// Run
main().catch((error) => {
    console.error("[Fatal] Unrecoverable error:", error);
    process.exit(1);
});

export {};
