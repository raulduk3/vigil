/**
 * Agent Memory — V2
 *
 * Per-watcher memory stored in the memories SQLite table.
 * MVP: load all non-obsolete memories (skip embeddings).
 * Scaling: semantic retrieval kicks in over 50 entries.
 */

import { queryMany, run } from "../db/client";
import { logger } from "../logger";
import type { MemoryRow } from "./schema";

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

export function retrieveMemories(watcherId: string): MemoryRow[] {
    // MVP: load all non-obsolete memories, ordered by importance then recency
    return queryMany<MemoryRow>(
        `SELECT * FROM memories
         WHERE watcher_id = ? AND obsolete = FALSE
         ORDER BY importance DESC, created_at DESC
         LIMIT 50`,
        [watcherId]
    );
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
 * Parse agent's memory_append string into chunks and store each.
 * Splits on newlines, strips bullet markers.
 */
export function storeMemories(watcherId: string, memoryAppend: string): void {
    if (!memoryAppend?.trim()) return;

    const chunks = memoryAppend
        .split(/\n+/)
        .map((line) => line.replace(/^[-*•#+]\s*/, "").trim())
        .filter((line) => line.length > 10);

    for (const chunk of chunks) {
        storeMemory(watcherId, chunk);
    }

    logger.debug("Stored memory chunks", { watcherId, count: chunks.length });
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
