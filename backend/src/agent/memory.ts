/**
 * Agent Memory — V2
 *
 * Per-watcher memory stored in the memories SQLite table.
 * MVP: load all non-obsolete memories (skip embeddings).
 * Scaling: semantic retrieval kicks in over 50 entries.
 */

import { queryMany, queryOne, run } from "../db/client";
import { logger } from "../logger";
import type { MemoryRow } from "./schema";

export interface EmailContext {
    from?: string;
    subject?: string;
    body?: string;
}

export interface MemoryChunk {
    id: string;
    content: string;
    importance: number;
    score?: number;
    createdAt: string;
}

// ============================================================================
// Retrieval
// ============================================================================

export function retrieveMemories(
    watcherId: string,
    context?: EmailContext
): MemoryRow[] {
    // Count non-obsolete memories for this watcher
    const countRow = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM memories WHERE watcher_id = ? AND obsolete = FALSE`,
        [watcherId]
    );
    const total = countRow?.count ?? 0;

    // Under 20 memories: load all, simple sort
    if (total < 20 || !context) {
        return queryMany<MemoryRow>(
            `SELECT * FROM memories
             WHERE watcher_id = ? AND obsolete = FALSE
             ORDER BY importance DESC, created_at DESC`,
            [watcherId]
        );
    }

    // Always load rules (importance 5 + starts with RULE:) — these are behavioral directives
    const rules = queryMany<MemoryRow>(
        `SELECT * FROM memories
         WHERE watcher_id = ? AND obsolete = FALSE
         AND (content LIKE 'RULE:%' OR importance >= 5)
         ORDER BY created_at DESC`,
        [watcherId]
    );

    // 20+ memories with context: use FTS5 with weighted ranking
    const ftsQuery = buildFtsQuery(context);
    if (!ftsQuery) {
        const general = queryMany<MemoryRow>(
            `SELECT * FROM memories
             WHERE watcher_id = ? AND obsolete = FALSE
             AND content NOT LIKE 'RULE:%'
             ORDER BY importance DESC, created_at DESC
             LIMIT 8`,
            [watcherId]
        );
        // Merge rules + general, deduplicate by id
        const seen = new Set(rules.map(r => r.id));
        return [...rules, ...general.filter(m => !seen.has(m.id))];
    }

    try {
        const ftsResults = queryMany<MemoryRow>(
            `SELECT m.*,
               (-bm25(memories_fts)) * m.importance *
                 CASE
                   WHEN (julianday('now') - julianday(m.created_at)) < 7  THEN 1.0
                   WHEN (julianday('now') - julianday(m.created_at)) < 30 THEN 0.8
                   WHEN (julianday('now') - julianday(m.created_at)) < 90 THEN 0.6
                   ELSE 0.4
                 END AS combined_score
             FROM memories_fts
             JOIN memories m ON memories_fts.rowid = m.rowid
             WHERE memories_fts MATCH ?
               AND m.watcher_id = ?
               AND m.obsolete = FALSE
             ORDER BY combined_score DESC
             LIMIT 8`,
            [ftsQuery, watcherId]
        );
        // Merge rules + FTS results, deduplicate
        const seen = new Set(rules.map(r => r.id));
        return [...rules, ...ftsResults.filter(m => !seen.has(m.id))];
    } catch (err) {
        logger.warn("FTS5 query failed, falling back to simple retrieval", { watcherId, err });
        const fallback = queryMany<MemoryRow>(
            `SELECT * FROM memories
             WHERE watcher_id = ? AND obsolete = FALSE
             AND content NOT LIKE 'RULE:%'
             ORDER BY importance DESC, created_at DESC
             LIMIT 8`,
            [watcherId]
        );
        const seen = new Set(rules.map(r => r.id));
        return [...rules, ...fallback.filter(m => !seen.has(m.id))];
    }
}

// ============================================================================
// Storage
// ============================================================================

export function storeMemory(
    watcherId: string,
    content: string,
    importance: number = 3,
    sourceQuote?: string,
    confidence: number = 5,
    threadId?: string | null
): void {
    // Dedup: if a memory with very similar content already exists for this thread, update instead of insert
    if (threadId) {
        const existing = queryOne<{ id: string; content: string }>(
            `SELECT id, content FROM memories WHERE watcher_id = ? AND thread_id = ? AND obsolete = FALSE ORDER BY created_at DESC LIMIT 1`,
            [watcherId, threadId]
        );
        if (existing) {
            // If the new content is substantially similar or supersedes the old, update in place
            run(
                `UPDATE memories SET content = ?, importance = ?, source_quote = ?, confidence = ?, last_accessed = CURRENT_TIMESTAMP WHERE id = ?`,
                [content.trim(), importance, sourceQuote?.trim() ?? null, Math.max(1, Math.min(5, confidence)), existing.id]
            );
            return;
        }
    }

    const id = crypto.randomUUID();
    run(
        `INSERT INTO memories (id, watcher_id, content, importance, source_quote, confidence, thread_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, watcherId, content.trim(), importance, sourceQuote?.trim() ?? null, Math.max(1, Math.min(5, confidence)), threadId ?? null]
    );
}

/**
 * Parse agent's memory_append and store each chunk.
 * Accepts either:
 * - Array of { content, importance } objects (V2 format)
 * - Plain string with newlines (legacy fallback)
 */
export function storeMemories(
    watcherId: string,
    memoryAppend: string | Array<{ content: string; importance?: number; source_quote?: string; confidence?: number }>,
    threadId?: string | null
): void {
    if (!memoryAppend) return;

    // Handle array format (V2)
    if (Array.isArray(memoryAppend)) {
        for (const entry of memoryAppend) {
            const content = entry.content?.trim();
            if (!content || content.length < 10) continue;
            const importance = Math.max(1, Math.min(5, entry.importance ?? 3));
            const confidence = Math.max(1, Math.min(5, entry.confidence ?? 5));
            storeMemory(watcherId, content, importance, entry.source_quote, confidence, threadId);
        }
        logger.debug("Stored memory chunks", { watcherId, count: memoryAppend.length });
        return;
    }

    // Legacy string fallback
    if (typeof memoryAppend !== "string" || !memoryAppend.trim()) return;

    const chunks = memoryAppend
        .split(/\n+/)
        .map((line) => line.replace(/^[-*•#+]\s*/, "").trim())
        .filter((line) => line.length > 10);

    for (const chunk of chunks) {
        storeMemory(watcherId, chunk);
    }

    logger.debug("Stored memory chunks (legacy)", { watcherId, count: chunks.length });
}

// ============================================================================
// Formatting
// ============================================================================

export function formatMemoriesForContext(memories: MemoryRow[]): string {
    if (memories.length === 0) {
        return "No prior memory. This is the first time processing for this watcher.";
    }

    // Separate rules from regular memories
    const rules = memories.filter((m: any) => m.content?.startsWith("RULE:") || m.importance >= 5);
    const regular = memories.filter((m: any) => !m.content?.startsWith("RULE:") && m.importance < 5);

    const parts: string[] = [];

    if (rules.length > 0) {
        parts.push("RULES (always follow these):");
        rules.forEach((m: any) => {
            parts.push(`  - ${m.content}`);
        });
        parts.push("");
    }

    if (regular.length > 0) {
        parts.push("MEMORIES:");
    }

    const lines = regular.map((m: any) => {
        const age = m.created_at ? `(${daysSince(m.created_at)}d ago)` : "";
        const conf = m.confidence && m.confidence < 5 ? ` [confidence:${m.confidence}/5]` : "";
        const thread = m.thread_id ? ` [thread:${m.thread_id.substring(0, 8)}]` : "";
        return `- [id:${m.id}] [importance:${m.importance}]${conf}${thread} ${m.content} ${age}`;
    });

    return [...parts, ...lines].join("\n");
}

// ============================================================================
// Maintenance
// ============================================================================

export function touchMemoryAccess(memoryIds: string[]): void {
    for (const id of memoryIds) {
        run(
            `UPDATE memories SET last_accessed = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE id = ?`,
            [id]
        );
    }
}

export function markObsolete(memoryId: string): void {
    run(`UPDATE memories SET obsolete = TRUE WHERE id = ?`, [memoryId]);
}

export async function pruneMemories(
    watcherId: string,
    pruneAfterDays: number = 90
): Promise<number> {
    const cutoff = new Date(
        Date.now() - pruneAfterDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Prune obsolete + low-importance + old + never-accessed
    run(
        `DELETE FROM memories
         WHERE watcher_id = ? AND obsolete = TRUE
           AND importance <= 2
           AND last_accessed IS NULL
           AND created_at < ?`,
        [watcherId, cutoff]
    );

    // Auto-mark memories as obsolete when their associated thread is resolved or ignored
    // Low-importance memories (<=3) tied to closed threads are noise
    run(
        `UPDATE memories SET obsolete = TRUE
         WHERE watcher_id = ? AND obsolete = FALSE AND importance <= 3
           AND thread_id IS NOT NULL
           AND thread_id IN (SELECT id FROM threads WHERE status IN ('resolved', 'ignored'))`,
        [watcherId]
    );

    return 0;
}

// ============================================================================
// Helpers
// ============================================================================

function daysSince(timestamp: string): number {
    const ms = Date.now() - new Date(timestamp).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "can", "could", "did", "do", "does", "for", "from", "had", "has", "have",
    "he", "her", "him", "his", "how", "i", "if", "in", "into", "is", "it",
    "its", "just", "may", "me", "might", "my", "not", "now", "of", "on", "or",
    "our", "out", "re", "she", "should", "so", "some", "that", "the", "their",
    "them", "then", "there", "these", "they", "this", "those", "to", "was",
    "we", "were", "what", "when", "which", "who", "will", "with", "would",
    "you", "your",
]);

/**
 * Build an FTS5 MATCH query string from email context.
 * Extracts meaningful terms from sender, subject, and body.
 */
function buildFtsQuery(context: EmailContext): string {
    const terms = new Set<string>();

    // From address — split on @, ., and whitespace
    if (context.from) {
        const stripped = context.from.replace(/<[^>]+>/g, "").replace(/[^a-zA-Z0-9@.\s]/g, " ");
        stripped.split(/[@.\s]+/).forEach((p) => {
            const w = p.toLowerCase();
            if (w.length > 2 && !STOPWORDS.has(w)) terms.add(w);
        });
    }

    // Subject words
    if (context.subject) {
        context.subject
            .replace(/[^a-zA-Z0-9\s]/g, " ")
            .split(/\s+/)
            .forEach((p) => {
                const w = p.toLowerCase();
                if (w.length > 2 && !STOPWORDS.has(w)) terms.add(w);
            });
    }

    // Body key terms (first 200 chars)
    if (context.body) {
        context.body
            .slice(0, 200)
            .replace(/[^a-zA-Z0-9\s]/g, " ")
            .split(/\s+/)
            .forEach((p) => {
                const w = p.toLowerCase();
                if (w.length > 3 && !STOPWORDS.has(w)) terms.add(w);
            });
    }

    return [...terms].slice(0, 15).join(" OR ");
}
