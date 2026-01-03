/**
 * Vigil API Client
 * 
 * Typed HTTP client for communicating with the Vigil backend API.
 * Handles authentication, request/response formatting, and error handling.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export interface ApiError {
  error: string;
  details?: string;
  errors?: string[];
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
  errors?: string[];
}

export interface Watcher {
  watcher_id: string;
  account_id?: string;
  name: string;
  status: 'created' | 'active' | 'paused' | 'deleted';
  ingest_token: string;
  ingestion_address: string;
  policy: WatcherPolicy;
  created_at: number;
}

export interface WatcherPolicy {
  // Sender Control
  allowed_senders: string[];

  // Timing Thresholds (Commercial Model: silence tracking only)
  silence_threshold_hours: number;

  // Notification Configuration
  notification_channels: NotificationChannel[];

  // Reporting Configuration
  reporting_cadence?: 'daily' | 'weekly' | 'monthly' | 'on_demand';
  reporting_recipients?: string[];
  reporting_time?: string;
  reporting_day?: string | number; // Day name for weekly, or day number (1-31) for monthly

  // Timezone for report scheduling
  timezone?: string; // IANA timezone (e.g., "America/New_York")
}

export interface NotificationChannel {
  type: 'email' | 'webhook';
  destination: string;  // Email address or HTTPS webhook URL
  urgency_filter: 'all' | 'warning' | 'critical';  // Minimum urgency to deliver
  enabled: boolean;  // Allow disabling without removing
}

export interface Thread {
  thread_id: string;
  watcher_id: string;
  status: 'open' | 'closed';
  opened_at: number;
  closed_at: number | null;
  last_activity_at: number;
  normalized_subject: string;
  original_sender: string;
  message_count: number;
  silence_alerted: boolean;
  // Alias for backwards compatibility with UI components
  subject: string;
}

export interface Reminder {
  reminder_id: string;
  thread_id: string;
  reminder_type: 'hard_deadline' | 'soft_deadline' | 'urgency_signal' | 'manual';
  deadline_utc: number | null;
  source_span: string | null;
  description: string | null;
  confidence: string | null;
  status: 'active' | 'dismissed' | 'merged';
  created_by: string | null;
  created_at: number;
  merged_into: string | null;
  email_id: string | null;
  extraction_event_id: string | null;
  // Semantic naming fields
  name: string | null;
  short_name: string | null;
  grouped_signal_ids: string[] | null;
}

export interface VigilEvent {
  event_id: string;
  type: string;
  watcher_id: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

// Signal proposal state returned by backend
export interface SignalProposal {
  proposal_id: string;
  extraction_event_id: string;
  signal_type: 'HARD_DEADLINE' | 'SOFT_DEADLINE' | 'URGENCY_SIGNAL' | 'CLOSURE_SIGNAL';
  proposed_action: {
    type: string;
    [key: string]: unknown;
  };
  target_reminder_id?: string;
  rationale: string;
  confidence: number;
  context: {
    source_excerpt: string;
    existing_reminder_summary?: string;
    thread_subject?: string;
  };
  signal_group_id?: string;
  auto_applied: boolean;
  created_at: number;
  status: 'pending' | 'accepted' | 'overridden' | 'ignored';
  responded_at?: number;
  responded_by?: string;
  override_action?: {
    type: string;
    [key: string]: unknown;
  };
}

export interface Subscription {
  plan: 'free' | 'starter' | 'pro' | 'professional' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due' | 'free' | 'trialing';
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  limits?: {
    watchers: number;
    emails_per_month: number;
  };
}

export interface Usage {
  current_period: {
    start: number;
    end: number;
  };
  emails: {
    processed: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
  };
  watchers: {
    count: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
  };
}

export interface OAuthProvider {
  id: string;
  name: string;
  enabled: boolean;
}

// ============================================================================
// API Client Class
// ============================================================================

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private onAuthChange?: (user: User | null) => void;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
    // Load tokens from localStorage on init (client-side only)
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('vigil_access_token');
      this.refreshToken = localStorage.getItem('vigil_refresh_token');
    }
  }

  setAuthChangeCallback(callback: (user: User | null) => void) {
    this.onAuthChange = callback;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      requireAuth?: boolean;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { body, requireAuth = false, headers = {} } = options;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (requireAuth && this.accessToken) {
      requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    console.log(`[API] ${method} ${path} requireAuth=${requireAuth} hasToken=${!!this.accessToken}`);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle token refresh on 401
    if (response.status === 401 && this.refreshToken && requireAuth) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        // Retry the request with new token
        requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
        return this.handleResponse<T>(retryResponse);
      } else {
        // Refresh failed, clear auth
        this.clearAuth();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json();
    console.log(`[API] Response status=${response.status}`, data);

    if (!response.ok) {
      const error = data as ApiError;
      throw new Error(error.details || error.error || 'Request failed');
    }

    return data as T;
  }

  private setTokens(tokens: AuthTokens) {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vigil_access_token', tokens.access_token);
      localStorage.setItem('vigil_refresh_token', tokens.refresh_token);
      localStorage.setItem('vigil_token_expires', String(Date.now() + tokens.expires_in * 1000));
    }
  }

  private clearAuth() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vigil_access_token');
      localStorage.removeItem('vigil_refresh_token');
      localStorage.removeItem('vigil_token_expires');
    }
    this.onAuthChange?.(null);
  }

  private async refreshTokens(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json() as AuthResponse;
      if (data.tokens) {
        this.setTokens(data.tokens);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  async register(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await this.request<AuthResponse>('POST', '/api/auth/register', {
        body: { email, password },
      });

      if (response.tokens) {
        this.setTokens(response.tokens);
        this.onAuthChange?.(response.user || null);
      }

      return response;
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Registration failed' };
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await this.request<AuthResponse>('POST', '/api/auth/login', {
        body: { email, password },
      });

      if (response.tokens) {
        this.setTokens(response.tokens);
        this.onAuthChange?.(response.user || null);
      }

      return response;
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Login failed' };
    }
  }

  async logout(): Promise<void> {
    this.clearAuth();
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.accessToken) return null;

    try {
      const response = await this.request<{ user: User }>('GET', '/api/auth/me', {
        requireAuth: true,
      });
      return response.user;
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // ============================================================================
  // Password Management
  // ============================================================================

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('POST', '/api/auth/change-password', {
        body: { current_password: currentPassword, new_password: newPassword },
        requireAuth: true,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to change password' };
    }
  }

  async deleteAccount(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('DELETE', '/api/account', {
        requireAuth: true,
      });
      // Clear auth after successful deletion
      this.clearAuth();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete account' };
    }
  }

  // ============================================================================
  // Password Reset
  // ============================================================================

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    return this.request('POST', '/api/auth/password-reset/request', {
      body: { email },
    });
  }

  async verifyResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
    return this.request('POST', '/api/auth/password-reset/verify', {
      body: { token },
    });
  }

  async resetPassword(token: string, password: string): Promise<{ success: boolean }> {
    return this.request('POST', '/api/auth/password-reset/confirm', {
      body: { token, password },
    });
  }

  // ============================================================================
  // OAuth
  // ============================================================================

  async getOAuthProviders(): Promise<{ providers: OAuthProvider[] }> {
    return this.request('GET', '/api/auth/oauth/providers');
  }

  getOAuthStartUrl(provider: string): string {
    // This redirects to the backend OAuth endpoint which then redirects to the provider
    return `${this.baseUrl}/api/auth/oauth/${provider}`;
  }

  /**
   * Handle OAuth callback by storing tokens.
   * Called from the callback page after backend redirects with tokens.
   */
  handleOAuthCallback(accessToken: string, refreshToken: string): void {
    this.setTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 86400, // 24 hours default
    });
  }

  /**
   * Get linked OAuth accounts for the current user.
   */
  async getOAuthLinks(): Promise<{ 
    links: Array<{ provider: string; email: string; created_at: string }>; 
    has_password: boolean;
  }> {
    return this.request('GET', '/api/auth/oauth/links', { requireAuth: true });
  }

  /**
   * Link an OAuth provider to the current account (initiates OAuth flow).
   */
  linkOAuthProvider(provider: string): void {
    // Redirect to OAuth with link intent
    window.location.href = `${this.baseUrl}/api/auth/oauth/${provider}?action=link`;
  }

  /**
   * Unlink an OAuth provider from the current account.
   */
  async unlinkOAuthProvider(provider: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('DELETE', `/api/auth/oauth/links/${provider}`, { requireAuth: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to unlink provider' };
    }
  }

  // ============================================================================
  // Watchers
  // ============================================================================

  async createWatcher(name: string, policy: Partial<WatcherPolicy>): Promise<{ watcher: Watcher }> {
    return this.request('POST', '/api/watchers', {
      body: { name, policy },
      requireAuth: true,
    });
  }

  async getWatchers(): Promise<{ watchers: Watcher[] }> {
    return this.request('GET', '/api/watchers', { requireAuth: true });
  }

  async getWatcher(watcherId: string): Promise<{ watcher: Watcher }> {
    return this.request('GET', `/api/watchers/${watcherId}`, { requireAuth: true });
  }

  async updateWatcher(watcherId: string, updates: { name?: string }): Promise<{ watcher: Watcher }> {
    return this.request('PATCH', `/api/watchers/${watcherId}`, {
      body: updates,
      requireAuth: true,
    });
  }

  async deleteWatcher(watcherId: string): Promise<{ deleted: boolean; watcher_id: string }> {
    return this.request('DELETE', `/api/watchers/${watcherId}`, {
      requireAuth: true,
    });
  }

  async updateWatcherPolicy(watcherId: string, policy: Partial<WatcherPolicy>): Promise<{ updated: boolean; policy: WatcherPolicy }> {
    return this.request('PATCH', `/api/watchers/${watcherId}/policy`, {
      body: policy,
      requireAuth: true,
    });
  }

  async activateWatcher(watcherId: string): Promise<{ watcher: Watcher }> {
    return this.request('POST', `/api/watchers/${watcherId}/activate`, { requireAuth: true });
  }

  async pauseWatcher(watcherId: string): Promise<{ watcher: Watcher }> {
    return this.request('POST', `/api/watchers/${watcherId}/pause`, { requireAuth: true });
  }

  async resumeWatcher(watcherId: string): Promise<{ watcher: Watcher }> {
    return this.request('POST', `/api/watchers/${watcherId}/resume`, { requireAuth: true });
  }

  // ============================================================================
  // Threads
  // ============================================================================

  private normalizeThread(thread: Omit<Thread, 'subject'> & { subject?: string }): Thread {
    return {
      ...thread,
      // Map normalized_subject to subject for backwards compatibility with UI components
      subject: thread.subject ?? thread.normalized_subject ?? 'No subject',
    };
  }

  async getThreads(watcherId: string): Promise<{ threads: Thread[] }> {
    const result = await this.request<{ threads: Array<Omit<Thread, 'subject'> & { subject?: string }> }>(
      'GET',
      `/api/watchers/${watcherId}/threads`,
      { requireAuth: true }
    );
    return {
      threads: (result.threads || []).map(t => this.normalizeThread(t)),
    };
  }

  async getThread(watcherId: string, threadId: string): Promise<{ thread: Thread }> {
    const result = await this.request<{ thread: Omit<Thread, 'subject'> & { subject?: string } }>(
      'GET',
      `/api/watchers/${watcherId}/threads/${threadId}`,
      { requireAuth: true }
    );
    return {
      thread: this.normalizeThread(result.thread),
    };
  }

  async closeThread(watcherId: string, threadId: string): Promise<{ closed: boolean; thread_id: string; closed_at: number }> {
    return this.request('POST', `/api/watchers/${watcherId}/threads/${threadId}/close`, { requireAuth: true });
  }

  // ============================================================================
  // Reminders
  // ============================================================================

  async getReminders(watcherId: string, options?: { status?: string; thread_id?: string }): Promise<{ reminders: Reminder[] }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.thread_id) params.set('thread_id', options.thread_id);
    const query = params.toString() ? `?${params}` : '';
    return this.request('GET', `/api/watchers/${watcherId}/reminders${query}`, { requireAuth: true });
  }

  async createReminder(
    watcherId: string,
    data: {
      thread_id: string;
      reminder_type?: 'hard_deadline' | 'soft_deadline' | 'urgency_signal' | 'manual';
      deadline_utc?: number | null;
      description: string;
    }
  ): Promise<{ reminder_id: string; thread_id: string; status: string; created_at: number }> {
    return this.request('POST', `/api/watchers/${watcherId}/reminders`, {
      body: data,
      requireAuth: true,
    });
  }

  async editReminder(
    watcherId: string,
    reminderId: string,
    changes: {
      deadline_utc?: number | null;
      description?: string;
      reminder_type?: 'hard_deadline' | 'soft_deadline' | 'urgency_signal' | 'manual';
    }
  ): Promise<{ reminder_id: string; edited: boolean; edited_at: number }> {
    return this.request('PATCH', `/api/watchers/${watcherId}/reminders/${reminderId}`, {
      body: changes,
      requireAuth: true,
    });
  }

  async dismissReminder(
    watcherId: string,
    reminderId: string,
    reason?: string
  ): Promise<{ reminder_id: string; dismissed: boolean; dismissed_at: number }> {
    return this.request('POST', `/api/watchers/${watcherId}/reminders/${reminderId}/dismiss`, {
      body: reason ? { reason } : undefined,
      requireAuth: true,
    });
  }

  async mergeReminder(
    watcherId: string,
    sourceReminderId: string,
    data: {
      target_reminder_id: string;
      merge_reason?: 'duplicate' | 'pulse' | 'related' | 'superset' | 'manual';
      merge_justification?: string;
      deadline_resolution?: 'keep_target' | 'keep_source' | 'manual';
      final_deadline_utc?: number;
      combined_description?: string;
    }
  ): Promise<{ source_reminder_id: string; target_reminder_id: string; merged: boolean; merged_at: number }> {
    return this.request('POST', `/api/watchers/${watcherId}/reminders/${sourceReminderId}/merge`, {
      body: data,
      requireAuth: true,
    });
  }

  async reassignReminder(
    watcherId: string,
    reminderId: string,
    toThreadId: string
  ): Promise<{ reminder_id: string; from_thread_id: string; to_thread_id: string; reassigned: boolean; reassigned_at: number }> {
    return this.request('POST', `/api/watchers/${watcherId}/reminders/${reminderId}/reassign`, {
      body: { to_thread_id: toThreadId },
      requireAuth: true,
    });
  }

  /**
   * Rename a reminder with a new semantic name.
   */
  async renameReminder(
    watcherId: string,
    reminderId: string,
    newName: string
  ): Promise<{ reminder_id: string; old_name: string; new_name: string; renamed: boolean; renamed_at: number }> {
    return this.request('PATCH', `/api/watchers/${watcherId}/reminders/${reminderId}/rename`, {
      body: { name: newName },
      requireAuth: true,
    });
  }

  /**
   * Get extraction signals for a reminder.
   * Returns the full traceability chain: Reminder → Signal (extraction event) → Message
   */
  async getReminderSignals(
    watcherId: string,
    reminderId: string
  ): Promise<{
    reminder_id: string;
    signals: Array<{
      event_id: string;
      type: string;
      timestamp: number;
      email_id: string | null;
      payload: Record<string, unknown>;
    }>;
    source_message: {
      event_id: string;
      type: string;
      timestamp: number;
      email_id: string | null;
      sender: string | null;
      subject: string | null;
    } | null;
  }> {
    return this.request('GET', `/api/watchers/${watcherId}/reminders/${reminderId}/signals`, {
      requireAuth: true,
    });
  }

  // ============================================================================
  // Events
  // ============================================================================

  async getEvents(
    watcherId: string,
    options?: { limit?: number; before?: number; type?: string }
  ): Promise<{ events: VigilEvent[]; pagination?: { total?: number; limit: number; has_more: boolean } }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', String(options.before));
    if (options?.type) params.set('type', options.type);

    const query = params.toString() ? `?${params}` : '';
    return this.request('GET', `/api/watchers/${watcherId}/events${query}`, { requireAuth: true });
  }

  async getThreadEvents(
    watcherId: string,
    threadId: string,
    options?: { limit?: number }
  ): Promise<{ events: VigilEvent[] }> {
    // Fetch all events and filter by thread_id in payload
    // Also include signal extraction events by email_id for emails in this thread
    const limit = options?.limit || 200;
    const result = await this.getEvents(watcherId, { limit });
    const events = result.events || [];

    // Helper to get field from event (handles both payload and flat structure)
    const getField = (event: VigilEvent, field: string): unknown => {
      const payload = (event.payload || {}) as Record<string, unknown>;
      const eventAny = event as unknown as Record<string, unknown>;
      return payload[field] ?? eventAny[field];
    };

    // First pass: find all events directly associated with this thread
    // and collect email_ids from those events
    const threadEmailIds = new Set<string>();
    const threadEvents: VigilEvent[] = [];

    for (const event of events) {
      const eventThreadId = getField(event, 'thread_id') as string | undefined;
      const eventEmailId = getField(event, 'email_id') as string | undefined;
      
      if (eventThreadId === threadId) {
        threadEvents.push(event);
        if (eventEmailId) {
          threadEmailIds.add(eventEmailId);
        }
      }
    }

    // Second pass: include signal extraction events that belong to emails in this thread
    // Signal events (HARD_DEADLINE_EXTRACTED, etc.) don't have thread_id but have email_id
    const signalEventTypes = [
      'HARD_DEADLINE_EXTRACTED',
      'SOFT_DEADLINE_EXTRACTED',
      'URGENCY_SIGNAL_EXTRACTED',
      'CLOSURE_SIGNAL_EXTRACTED',
      'EXTRACTION_STARTED',
      'EXTRACTION_COMPLETED',
    ];

    for (const event of events) {
      if (signalEventTypes.includes(event.type)) {
        const eventEmailId = getField(event, 'email_id') as string | undefined;
        if (eventEmailId && threadEmailIds.has(eventEmailId)) {
          // Only add if not already included
          if (!threadEvents.find(e => e.event_id === event.event_id)) {
            threadEvents.push(event);
          }
        }
      }
    }

    // Sort by timestamp
    threadEvents.sort((a, b) => b.timestamp - a.timestamp);

    return { events: threadEvents };
  }

  /**
   * Get messages (EMAIL_RECEIVED events) for a thread.
   * Returns emails that belong to the thread along with any extraction events.
   */
  async getThreadMessages(
    watcherId: string,
    threadId: string
  ): Promise<{
    messages: Array<{
      email_id: string;
      event_id: string;
      timestamp: number;
      sender: string;
      subject: string;
      body_excerpt: string;
      sent_at: number;
    }>;
  }> {
    // First get all EMAIL_RECEIVED events
    const result = await this.getEvents(watcherId, { limit: 500, type: 'EMAIL_RECEIVED' });
    const allEmails = result.events || [];

    // Get thread events to find email_ids in this thread
    const threadResult = await this.getThreadEvents(watcherId, threadId, { limit: 500 });
    const threadEvents = threadResult.events || [];

    // Collect email_ids from THREAD_OPENED and THREAD_EMAIL_ADDED events
    const threadEmailIds = new Set<string>();
    for (const event of threadEvents) {
      if (event.type === 'THREAD_OPENED' || event.type === 'THREAD_EMAIL_ADDED') {
        const payload = (event.payload || event) as Record<string, unknown>;
        const emailId = payload.email_id as string;
        if (emailId) threadEmailIds.add(emailId);
      }
    }

    // Also check the event itself for email_id (for flat events)
    for (const event of threadEvents) {
      const eventAny = event as unknown as Record<string, unknown>;
      if (eventAny.email_id) {
        threadEmailIds.add(eventAny.email_id as string);
      }
    }

    // Filter EMAIL_RECEIVED to only those in this thread
    const messages = allEmails
      .filter(event => {
        const payload = (event.payload || event) as Record<string, unknown>;
        const emailId = (payload.email_id as string) || (event as unknown as Record<string, unknown>).email_id as string;
        return emailId && threadEmailIds.has(emailId);
      })
      .map(event => {
        const payload = (event.payload || event) as Record<string, unknown>;
        return {
          email_id: (payload.email_id as string) || (event as unknown as Record<string, unknown>).email_id as string || '',
          event_id: event.event_id,
          timestamp: event.timestamp,
          sender: (payload.original_sender as string) || (payload.sender as string) || 'Unknown',
          subject: (payload.subject as string) || 'No subject',
          body_excerpt: (payload.body_excerpt as string) || '',
          sent_at: (payload.sent_at as number) || event.timestamp,
        };
      })
      .sort((a, b) => a.sent_at - b.sent_at); // Chronological order

    return { messages };
  }

  // ============================================================================
  // Proposals
  // ============================================================================

  async getProposals(
    watcherId: string,
    status: 'pending' | 'all' = 'pending'
  ): Promise<{
    watcher_id: string;
    proposals: SignalProposal[];
    total: number;
    user_threshold?: number;
    summary?: { pending: number; auto_applied_today: number };
  }> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const query = params.toString() ? `?${params}` : '';
    return this.request('GET', `/api/watchers/${watcherId}/proposals${query}`, {
      requireAuth: true,
    });
  }

  async respondToProposal(
    watcherId: string,
    proposalId: string,
    body: {
      response: 'accepted' | 'overridden' | 'ignored';
      override_action?: { type: string; [key: string]: unknown };
      override_target_reminder_id?: string;
    }
  ): Promise<{
    proposal_id: string;
    response: 'accepted' | 'overridden' | 'ignored';
    responded_at: number;
    message: string;
  }> {
    return this.request('POST', `/api/watchers/${watcherId}/proposals/${proposalId}/respond`, {
      body,
      requireAuth: true,
    });
  }

  // ============================================================================
  // Billing
  // ============================================================================

  async getSubscription(): Promise<{ subscription: Subscription | null }> {
    return this.request('GET', '/api/billing/subscription', { requireAuth: true });
  }

  async getUsage(): Promise<{ usage: Usage }> {
    return this.request('GET', '/api/billing/usage', { requireAuth: true });
  }

  async getBillingConfig(): Promise<{ stripe_configured: boolean; publishable_key: string | null }> {
    return this.request('GET', '/api/billing/config', { requireAuth: true });
  }

  async createCheckoutSession(plan: string): Promise<{ checkout_url: string; session_id: string }> {
    const successUrl = `${window.location.origin}/account/billing?success=true`;
    const cancelUrl = `${window.location.origin}/account/billing?canceled=true`;
    
    return this.request('POST', '/api/billing/checkout', {
      body: { 
        plan,
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      requireAuth: true,
    });
  }

  async createBillingPortalSession(): Promise<{ portal_url: string | null; error?: string }> {
    try {
      return await this.request('POST', '/api/billing/portal', {
        body: {
          return_url: `${window.location.origin}/account/billing`,
        },
        requireAuth: true,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to open billing portal';
      return { portal_url: null, error: errorMessage };
    }
  }

  async cancelSubscription(): Promise<{ success: boolean }> {
    return this.request('POST', '/api/billing/cancel', { requireAuth: true });
  }

  async resumeSubscription(): Promise<{ success: boolean }> {
    return this.request('POST', '/api/billing/resume', { requireAuth: true });
  }

  async getInvoices(): Promise<{
    invoices: Array<{
      id: string;
      number: string | null;
      status: string | null;
      amount_due: number;
      amount_paid: number;
      currency: string;
      created: number;
      period_start: number;
      period_end: number;
      hosted_invoice_url: string | null;
      invoice_pdf: string | null;
    }>;
  }> {
    return this.request('GET', '/api/billing/invoices', { requireAuth: true });
  }

  // ============================================================================
  // System
  // ============================================================================

  async getHealth(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }

  // ============================================================================
  // Developer Tools
  // ============================================================================

  /**
   * Send a test email of the specified type for a watcher.
   *
   * Available types:
   * - alert: Urgency alert notification
   * - digest: Daily/weekly digest report
   * - report: Activity report
   * - thread_state: Thread state change notification
   * - reminder_alert: Reminder deadline alert
   * - signal_proposal: Signal proposal for review
   */
  async sendTestEmail(
    watcherId: string,
    emailType: 'alert' | 'digest' | 'report' | 'thread_state' | 'reminder_alert' | 'signal_proposal'
  ): Promise<{ success: boolean; message?: string; message_id?: string; error?: string }> {
    return this.request('POST', `/api/watchers/${watcherId}/dev/test-email`, {
      body: { email_type: emailType },
      requireAuth: true,
    });
  }

  /**
   * Simulate email ingestion with test data.
   */
  async testIngest(
    watcherId: string,
    data: {
      from?: string;
      subject?: string;
      body?: string;
    }
  ): Promise<{ success: boolean; events_generated?: number; event_types?: string[]; error?: string }> {
    return this.request('POST', `/api/watchers/${watcherId}/dev/ingest-test`, {
      body: data,
      requireAuth: true,
    });
  }

  /**
   * Run a predefined test scenario.
   *
   * Available scenarios (aligned with commercial model):
   * - action_request: Email containing an explicit actionable request
   * - simple_info: Informational email, no action required
   * - closure_signal: Email indicating issue is resolved
   * - followup: Follow-up email on existing conversation
   * - bump: Simple "any update?" email (tests silence tracking)
   */
  async testScenario(
    watcherId: string,
    scenario: 'action_request' | 'simple_info' | 'closure_signal' | 'followup' | 'bump'
  ): Promise<{ success: boolean; scenario?: string; events_generated?: number; event_types?: string[]; error?: string }> {
    return this.request('POST', `/api/watchers/${watcherId}/dev/test-scenario`, {
      body: { scenario },
      requireAuth: true,
    });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing
export { ApiClient };
