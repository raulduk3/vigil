/**
 * Agent Memory — Semantic Retrieval
 *
 * Write: agent appends notes → chunked → embedded → stored
 * Read: email context → embedded → similarity search → top K returned
 *
 * Under 50 entries: load all (no embeddings needed)
 * Over 50 entries: semantic retrieval, top 8 by relevance
 *
 * See docs/V2_ARCHITECTURE.md (Semantic Memory addendum)
 */

export interface MemoryChunk {
  id: string;
  content: string;
  importance: number;
  score?: number;
  createdAt: string;
}

export interface MemoryConfig {
  maxChunks: number;       // max chunks to retrieve (default 8)
  simpleThreshold: number; // below this count, load all (default 50)
  pruneAfterDays: number;  // prune obsolete entries older than (default 90)
}

const DEFAULT_CONFIG: MemoryConfig = {
  maxChunks: 8,
  simpleThreshold: 50,
  pruneAfterDays: 90,
};

/**
 * Retrieve relevant memories for a given context.
 * Under simpleThreshold: returns all non-obsolete memories.
 * Over simpleThreshold: embeds query, similarity search, returns top K.
 */
export async function retrieveMemories(
  watcherId: string,
  queryText: string,
  config: MemoryConfig = DEFAULT_CONFIG
): Promise<MemoryChunk[]> {
  // TODO: implement
  // 1. COUNT non-obsolete memories for this watcher
  // 2. If count < simpleThreshold: SELECT all, return
  // 3. Else: embed queryText, vector search, return top maxChunks
  throw new Error('Not implemented');
}

/**
 * Store new memory chunks from agent's memory_append output.
 * Splits text into chunks, embeds each, inserts into memories table.
 */
export async function storeMemories(
  watcherId: string,
  memoryAppend: string,
  importance: number = 3
): Promise<void> {
  // TODO: implement
  // 1. Split memoryAppend by line/bullet
  // 2. Filter empty lines
  // 3. For each chunk: generate embedding, INSERT into memories
  throw new Error('Not implemented');
}

/**
 * Mark a memory as obsolete (agent says "this is no longer true").
 */
export async function markObsolete(memoryId: string): Promise<void> {
  // TODO: UPDATE memories SET obsolete = true WHERE id = ?
  throw new Error('Not implemented');
}

/**
 * Prune old, low-value memories.
 * Deletes: obsolete + importance <= 2 + never accessed + older than pruneAfterDays.
 */
export async function pruneMemories(
  watcherId: string,
  config: MemoryConfig = DEFAULT_CONFIG
): Promise<number> {
  // TODO: implement
  // DELETE FROM memories
  // WHERE watcher_id = ? AND obsolete = true
  //   AND importance <= 2
  //   AND last_accessed IS NULL
  //   AND created_at < datetime('now', '-N days')
  throw new Error('Not implemented');
}

/**
 * Format retrieved memories for inclusion in agent context.
 */
export function formatMemoriesForContext(memories: MemoryChunk[]): string {
  if (memories.length === 0) return 'No relevant memories.';
  return memories
    .map(m => {
      const score = m.score ? `[${m.score.toFixed(2)}] ` : '';
      return `${score}${m.content}`;
    })
    .join('\n');
}
