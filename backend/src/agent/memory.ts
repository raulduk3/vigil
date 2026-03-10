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

    // 20+ memories with context: use FTS5 with weighted ranking
    const ftsQuery = buildFtsQuery(context);
    if (!ftsQuery) {
        return queryMany<MemoryRow>(
            `SELECT * FROM memories
             WHERE watcher_id = ? AND obsolete = FALSE
             ORDER BY importance DESC, created_at DESC
             LIMIT 8`,
            [watcherId]
        );
    }

    try {
        return queryMany<MemoryRow>(
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
    } catch (err) {
        logger.warn("FTS5 query failed, falling back to simple retrieval", { watcherId, err });
        return queryMany<MemoryRow>(
            `SELECT * FROM memories
             WHERE watcher_id = ? AND obsolete = FALSE
             ORDER BY importance DESC, created_at DESC
             LIMIT 8`,
            [watcherId]
        );
    }
}

// ============================================================================
// Storage
// ============================================================================

export function storeMemory(
    watcherId: string,
    content: string,
    importance: number = 3
): void {
    const id = crypto.randomUUID();
    run(
        `INSERT INTO memories (id, watcher_id, content, importance, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, watcherId, content.trim(), importance]
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
    memoryAppend: string | Array<{ content: string; importance?: number }>
): void {
    if (!memoryAppend) return;

    // Handle array format (V2)
    if (Array.isArray(memoryAppend)) {
        for (const entry of memoryAppend) {
            const content = entry.content?.trim();
            if (!content || content.length < 10) continue;
            const importance = Math.max(1, Math.min(5, entry.importance ?? 3));
            storeMemory(watcherId, content, importance);
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

    const lines = memories.map((m) => {
        const age = m.created_at ? `(${daysSince(m.created_at)}d ago)` : "";
        return `- [importance:${m.importance}] ${m.content} ${age}`;
    });

    return lines.join("\n");
}

// ============================================================================
// Maintenance
// ============================================================================

export function touchMemoryAccess(memoryIds: string[]): void {
    for (const id of memoryIds) {
        run(
            `UPDATE memories SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?`,
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
    run(
        `DELETE FROM memories
         WHERE watcher_id = ? AND obsolete = TRUE
           AND importance <= 2
           AND last_accessed IS NULL
           AND created_at < ?`,
        [watcherId, cutoff]
    );
    return 0; // SQLite run doesn't return count easily, not critical for MVP
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
