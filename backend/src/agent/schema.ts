/**
 * Agent Schema — V2 Types
 *
 * Core data types for the agent engine, tools, and DB rows.
 */

// ============================================================================
// Database Row Types
// ============================================================================

export interface WatcherRow {
    id: string;
    account_id: string;
    name: string;
    ingest_token: string;
    system_prompt: string;
    tools: string; // JSON array string
    silence_hours: number;
    tick_interval: number;
    model: string | null;
    status: string;
    template_id: string | null;
    last_tick_at: string | null;
    reactivity: number; // 1-5, controls alert sensitivity
    memory_sensitivity: number; // 1-5, controls how much the agent remembers
    created_at: string;
    updated_at: string;
}

export interface ThreadRow {
    id: string;
    watcher_id: string;
    subject: string | null;
    participants: string; // JSON array string
    status: string; // active | watching | resolved | ignored
    first_seen: string | null;
    last_activity: string | null;
    email_count: number;
    summary: string | null;
    flags: string | null; // JSON object string
    created_at: string;
}

export interface EmailRow {
    id: string;
    watcher_id: string;
    thread_id: string | null;
    message_id: string | null;
    from_addr: string | null;
    to_addr: string | null;
    subject: string | null;
    received_at: string | null;
    body_hash: string | null;
    analysis: string | null; // JSON string
    processed: number; // SQLite BOOLEAN = 0/1
    created_at: string;
}

export interface MemoryRow {
    id: string;
    watcher_id: string;
    content: string;
    importance: number;
    last_accessed: string | null;
    obsolete: number; // SQLite BOOLEAN = 0/1
    created_at: string;
}

export interface ChannelRow {
    id: string;
    watcher_id: string;
    type: string; // email | webhook
    destination: string;
    enabled: number; // SQLite BOOLEAN = 0/1
}

export interface AccountRow {
    id: string;
    email: string;
    name: string | null;
    password_hash: string | null;
    oauth_provider: string | null;
    oauth_id: string | null;
    plan: string;
    created_at: string;
}

// ============================================================================
// Agent Invocation Types
// ============================================================================

export interface ParsedEmail {
    messageId: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    headers: Record<string, string>;
    receivedAt: number;
    originalFrom?: string; // original sender when email was auto-forwarded
}

export type InvocationTrigger =
    | { type: "email_received"; email: ParsedEmail }
    | { type: "scheduled_tick"; timestamp: number }
    | { type: "weekly_digest"; timestamp: number }
    | { type: "user_query"; query: string }
    | { type: "user_chat"; message: string };

// ============================================================================
// Agent Response (LLM output)
// ============================================================================

export interface AgentResponse {
    actions: Array<{
        tool: string;
        params: Record<string, any>;
        reasoning: string;
    }>;
    memory_append: string | Array<{ content: string; importance?: number; source_quote?: string; confidence?: number }> | null;
    memory_obsolete: string[] | null;
    thread_updates: Array<{
        thread_id: string;
        status?: "active" | "watching" | "resolved" | "ignored";
        summary?: string;
        flags?: Record<string, any>;
    }> | null;
    email_analysis: {
        summary: string;
        intent: string;
        urgency: "low" | "normal" | "high";
        entities: string[];
    } | null;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolResult {
    success: boolean;
    message?: string;
    error?: string;
}

export interface WatcherContext {
    watcher: WatcherRow;
    channels: ChannelRow[];
    accountEmail: string;
}

// ============================================================================
// Notification Channel (local type — replaces events/types import)
// ============================================================================

export interface NotificationChannel {
    type: "email" | "webhook";
    destination: string;
    enabled: boolean;
}
