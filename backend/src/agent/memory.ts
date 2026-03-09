/**
 * Agent Memory
 *
 * Per-watcher markdown files at data/watchers/{id}/memory.md
 * Read before invocation, append after, compact when large.
 *
 * See docs/V2_ARCHITECTURE.md for full spec.
 */

// TODO: Implement read/write/compact
export async function readMemory(watcherId: string): Promise<string> {
  throw new Error('Not implemented');
}

export async function appendMemory(watcherId: string, content: string): Promise<void> {
  throw new Error('Not implemented');
}
