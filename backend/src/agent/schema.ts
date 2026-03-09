/**
 * Agent Response Schema
 *
 * Structured output format for LLM agent calls.
 *
 * See docs/V2_ARCHITECTURE.md for full spec.
 */

export interface AgentResponse {
  actions: Array<{
    tool: string;
    params: Record<string, any>;
    reasoning: string;
  }>;
  memory_append: string | null;
  thread_updates: Array<{
    thread_id: string;
    status?: 'active' | 'watching' | 'resolved' | 'ignored';
    summary?: string;
    flags?: Record<string, any>;
  }> | null;
  email_analysis: {
    summary: string;
    intent: string;
    urgency: 'low' | 'normal' | 'high';
    entities: string[];
  } | null;
}
