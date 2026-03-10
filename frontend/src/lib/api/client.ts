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
  created_at: string;
}

export interface Action {
  id: string;
  watcher_id: string;
  trigger_type: 'email_received' | 'scheduled_tick' | 'user_query';
  tool: string | null;
  tool_params: Record<string, unknown> | null;
  result: 'success' | 'failed';
  decision: string | null;
  memory_delta: string | null;
  context_tokens: number;
  cost_usd: number;
  duration_ms: number;
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

  async invokeWatcher(id: string): Promise<{ result: unknown }> {
    return request(`/api/watchers/${id}/invoke`, { method: 'POST' });
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

  // Actions
  async getActions(watcherId: string): Promise<{ actions: Action[] }> {
    return request(`/api/watchers/${watcherId}/actions`);
  },

  // Templates
  async getTemplates(): Promise<{ templates: unknown[] }> {
    return request('/api/templates');
  },

  // Health
  async getHealth(): Promise<{ status: string }> {
    const response = await fetch(`${API_URL}/health`);
    return response.json();
  },
};
