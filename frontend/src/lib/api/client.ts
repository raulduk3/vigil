/**
 * Vigil V2 API Client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export interface ApiError {
  error: string;
  details?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface User {
  user_id: string;
  account_id: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  user?: User;
  tokens?: AuthTokens;
  error?: string;
}

export interface Watcher {
  id: string;
  name: string;
  ingest_token: string;
  ingestion_address: string;
  system_prompt: string;
  tools: string[];
  silence_hours: number;
  tick_interval: number;
  reactivity: number; // 1-5, controls alert sensitivity
  status: 'active' | 'paused' | 'deleted';
  template_id: string | null;
  last_tick_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Thread {
  id: string;
  watcher_id: string;
  subject: string | null;
  participants: string[];
  status: 'active' | 'watching' | 'resolved' | 'ignored';
  first_seen: string;
  last_activity: string;
  email_count: number;
  summary: string | null;
  flags: Record<string, unknown>;
  original_date: string | null;
  created_at: string;
}

export interface Action {
  id: string;
  watcher_id: string;
  thread_id: string | null;
  email_id: string | null;
  trigger_type: 'email_received' | 'scheduled_tick' | 'user_query' | 'user_chat';
  tool: string | null;
  tool_params: Record<string, unknown> | null;
  result: 'success' | 'failed';
  decision: string | null;
  error: string | null;
  reasoning: string | null;
  model: string | null;
  memory_delta: string | null;
  context_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface Memory {
  id: string;
  watcher_id: string;
  content: string;
  importance: number;
  obsolete: boolean;
  created_at: string;
}

export interface Channel {
  id: string;
  watcher_id: string;
  type: 'email' | 'webhook';
  destination: string;
  enabled: boolean;
}

export interface CustomTool {
  id: string;
  watcher_id: string;
  name: string;
  description: string;
  webhook_url: string;
  headers: Record<string, string>;
  parameter_schema: Record<string, { type?: string; description?: string }>;
  enabled: boolean;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

export interface NewApiKey extends ApiKey {
  full_key: string;
}

// ============================================================================
// Token Management
// ============================================================================

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vigil_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vigil_refresh_token');
}

function setTokens(tokens: AuthTokens) {
  localStorage.setItem('vigil_access_token', tokens.access_token);
  localStorage.setItem('vigil_refresh_token', tokens.refresh_token);
}

function clearTokens() {
  localStorage.removeItem('vigil_access_token');
  localStorage.removeItem('vigil_refresh_token');
}

// ============================================================================
// HTTP Client
// ============================================================================

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // Handle 401 with refresh
  if (response.status === 401 && retry) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          if (data.tokens) {
            setTokens(data.tokens);
            return request<T>(path, options, false);
          }
        }
      } catch {
        // Refresh failed
      }
      clearTokens();
    }
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// API Methods
// ============================================================================

let authChangeCallback: ((user: User | null) => void) | null = null;

export const api = {
  setAuthChangeCallback(cb: (user: User | null) => void) {
    authChangeCallback = cb;
  },

  async getCurrentUser(): Promise<User | null> {
    if (!getAccessToken()) return null;
    try {
      const data = await request<{ user: User }>('/api/auth/me');
      return data.user;
    } catch {
      return null;
    }
  },

  // Auth
  async register(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.tokens) setTokens(data.tokens);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.tokens) setTokens(data.tokens);
    return data;
  },

  async getMe(): Promise<{ user: User }> {
    return request('/api/auth/me');
  },

  async logout() {
    clearTokens();
    if (authChangeCallback) authChangeCallback(null);
  },

  isAuthenticated(): boolean {
    return !!getAccessToken();
  },

  // Watchers
  async getWatchers(): Promise<{ watchers: Watcher[] }> {
    return request('/api/watchers');
  },

  async getWatcher(id: string): Promise<{ watcher: Watcher }> {
    return request(`/api/watchers/${id}`);
  },

  async createWatcher(data: {
    name: string;
    system_prompt: string;
    tools?: string[];
    silence_hours?: number;
    tick_interval?: number;
    template?: string;
  }): Promise<{ watcher: Watcher }> {
    return request('/api/watchers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateWatcher(id: string, data: Partial<Watcher>): Promise<{ watcher: Watcher }> {
    return request(`/api/watchers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteWatcher(id: string): Promise<void> {
    return request(`/api/watchers/${id}`, { method: 'DELETE' });
  },

  async invokeWatcher(id: string, query?: string): Promise<{ invoked: boolean; watcher_id: string; response: unknown }> {
    return request(`/api/watchers/${id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ query: query ?? 'Review active threads.' }),
    });
  },

  async chatWithAgent(id: string, message: string): Promise<{ watcher_id: string; message: string }> {
    return request(`/api/watchers/${id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async sendDigest(id: string): Promise<{ digest_sent: boolean }> {
    return request(`/api/watchers/${id}/digest`, { method: 'POST' });
  },

  async flushWatcher(id: string): Promise<{ flushed: boolean; deleted: { emails: number; threads: number; memories: number } }> {
    return request(`/api/watchers/${id}/flush`, { method: 'POST' });
  },

  // Threads
  async getThreads(watcherId: string): Promise<{ threads: Thread[] }> {
    return request(`/api/watchers/${watcherId}/threads`);
  },

  async getThread(watcherId: string, threadId: string): Promise<{ thread: Thread }> {
    return request(`/api/watchers/${watcherId}/threads/${threadId}`);
  },

  async updateThread(watcherId: string, threadId: string, data: Partial<Thread>): Promise<{ thread: Thread }> {
    return request(`/api/watchers/${watcherId}/threads/${threadId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async closeThread(watcherId: string, threadId: string): Promise<void> {
    return request(`/api/watchers/${watcherId}/threads/${threadId}/close`, { method: 'POST' });
  },

  async deleteThread(watcherId: string, threadId: string): Promise<void> {
    return request(`/api/watchers/${watcherId}/threads/${threadId}`, { method: 'DELETE' });
  },

  // Memory
  async getMemories(watcherId: string): Promise<{ memories: Memory[] }> {
    return request(`/api/watchers/${watcherId}/memory`);
  },

  async createMemory(watcherId: string, data: { content: string; importance?: number }): Promise<{ memory: Memory }> {
    return request(`/api/watchers/${watcherId}/memory`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMemory(watcherId: string, memoryId: string, data: Partial<Memory>): Promise<{ memory: Memory }> {
    return request(`/api/watchers/${watcherId}/memory/${memoryId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMemory(watcherId: string, memoryId: string): Promise<void> {
    return request(`/api/watchers/${watcherId}/memory/${memoryId}`, { method: 'DELETE' });
  },

  // Channels (alert destinations)
  async getChannels(watcherId: string): Promise<{ channels: Channel[] }> {
    return request(`/api/watchers/${watcherId}/channels`);
  },

  async createChannel(watcherId: string, data: { type: string; destination: string }): Promise<{ channel: Channel }> {
    return request(`/api/watchers/${watcherId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateChannel(watcherId: string, channelId: string, data: Partial<Channel>): Promise<{ channel: Channel }> {
    return request(`/api/watchers/${watcherId}/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteChannel(watcherId: string, channelId: string): Promise<void> {
    return request(`/api/watchers/${watcherId}/channels/${channelId}`, { method: 'DELETE' });
  },

  // Actions
  async getActions(
    watcherId: string,
    options?: { limit?: number; threadId?: string }
  ): Promise<{ actions: Action[] }> {
    const query = new URLSearchParams();
    if (options?.limit !== undefined) query.set('limit', String(options.limit));
    if (options?.threadId) query.set('thread_id', options.threadId);
    const suffix = query.toString();
    return request(`/api/watchers/${watcherId}/actions${suffix ? `?${suffix}` : ''}`);
  },

  // Templates
  async getTemplates(): Promise<{ templates: unknown[] }> {
    return request('/api/templates');
  },

  // Custom Tools
  async getCustomTools(watcherId: string): Promise<{ tools: CustomTool[] }> {
    return request(`/api/watchers/${watcherId}/tools`);
  },

  async createCustomTool(watcherId: string, data: {
    name: string;
    description: string;
    webhook_url: string;
    headers?: Record<string, string>;
    parameter_schema?: Record<string, { type?: string; description?: string }>;
  }): Promise<{ tool: CustomTool }> {
    return request(`/api/watchers/${watcherId}/tools`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCustomTool(watcherId: string, toolId: string, data: Partial<CustomTool>): Promise<{ tool: CustomTool }> {
    return request(`/api/watchers/${watcherId}/tools/${toolId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteCustomTool(watcherId: string, toolId: string): Promise<void> {
    return request(`/api/watchers/${watcherId}/tools/${toolId}`, { method: 'DELETE' });
  },

  async testCustomTool(watcherId: string, toolId: string): Promise<{ success: boolean; status?: number; response_body?: string; error?: string }> {
    return request(`/api/watchers/${watcherId}/tools/${toolId}/test`, { method: 'POST' });
  },

  // API Keys
  async getApiKeys(): Promise<{ keys: ApiKey[] }> {
    return request('/api/keys');
  },

  async createApiKey(data: { name: string; permissions?: string[] }): Promise<{ key: NewApiKey }> {
    return request('/api/keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteApiKey(id: string): Promise<void> {
    return request(`/api/keys/${id}`, { method: 'DELETE' });
  },

  // Skills
  async getSkillsCatalog(): Promise<{ catalog: unknown[] }> {
    return request('/api/skills/catalog');
  },

  async getSkills(watcherId: string): Promise<{ skills: unknown[] }> {
    return request(`/api/watchers/${watcherId}/skills`);
  },

  async createSkill(watcherId: string, data: { provider: string; name: string; config: Record<string, string> }): Promise<{ skill: unknown }> {
    return request(`/api/watchers/${watcherId}/skills`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateSkill(watcherId: string, skillId: string, data: Record<string, unknown>): Promise<{ skill: unknown }> {
    return request(`/api/watchers/${watcherId}/skills/${skillId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteSkill(watcherId: string, skillId: string): Promise<void> {
    return request(`/api/watchers/${watcherId}/skills/${skillId}`, { method: 'DELETE' });
  },

  async testSkill(watcherId: string, skillId: string): Promise<{ success: boolean; status?: number; error?: string }> {
    return request(`/api/watchers/${watcherId}/skills/${skillId}/test`, { method: 'POST' });
  },

  // Health
  async getHealth(): Promise<{ status: string }> {
    const response = await fetch(`${API_URL}/health`);
    return response.json();
  },

  // Billing
  async getBilling(): Promise<{ billing: {
    has_payment_method: boolean;
    stripe_configured: boolean;
    trial_emails_used: number;
    trial_emails_remaining: number;
    trial_emails_total: number;
    current_month_cost: number;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    monthly_spend_cap: number | null;
  }}> {
    return request('/api/billing');
  },

  async setupBilling(): Promise<{ checkout_url: string }> {
    return request('/api/billing/setup', { method: 'POST' });
  },

  async getBillingPortal(): Promise<{ portal_url: string }> {
    return request('/api/billing/portal', { method: 'POST' });
  },

  async getUsage(): Promise<{ usage: {
    total_cost: number;
    total_invocations: number;
    total_alerts: number;
    total_emails: number;
    current_month: { cost: number; invocations: number };
    watchers: Array<{
      watcher_id: string;
      watcher_name: string;
      cost: number;
      invocations: number;
      alerts: number;
      emails: number;
    }>;
  }}> {
    return request('/api/usage');
  },

  async getDetailedUsage(offset: number = 0): Promise<{
    period: string;
    total_billed: number;
    total_raw: number;
    total_events: number;
    spend_cap: number | null;
    spend_cap_pct: number | null;
    by_model: Array<{
      model: string;
      input_tokens: number;
      output_tokens: number;
      raw_cost: number;
      billed_cost: number;
      events: number;
    }>;
    by_event_type: Array<{
      type: string;
      count: number;
      billed_cost: number;
    }>;
    by_day: Array<{
      date: string;
      billed_cost: number;
      events: number;
    }>;
    by_watcher: Array<{
      watcher_id: string;
      watcher_name: string;
      billed_cost: number;
      events: number;
    }>;
  }> {
    return request(`/api/usage/detailed?offset=${offset}`);
  },

  async updateSpendCap(cap: number | null): Promise<{ monthly_spend_cap: number | null }> {
    return request('/api/account/spend-cap', {
      method: 'PATCH',
      body: JSON.stringify({ monthly_spend_cap: cap }),
    });
  },
};
