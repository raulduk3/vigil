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
  account_id: string;
  name: string;
  status: 'created' | 'active' | 'paused' | 'deleted';
  ingest_email: string;
  policy: WatcherPolicy;
  created_at: number;
}

export interface WatcherPolicy {
  // Sender Control
  allowed_senders: string[];

  // Timing Thresholds
  silence_threshold_hours: number;
  deadline_warning_hours?: number;
  deadline_critical_hours?: number;

  // Reminder Type Control
  enable_soft_deadline_reminders?: boolean;
  enable_urgency_signal_reminders?: boolean;

  // Notification Configuration
  notification_channels: NotificationChannel[];

  // Reporting Configuration
  reporting_cadence?: 'daily' | 'weekly' | 'monthly' | 'on_demand';
  reporting_recipients?: string[];
  reporting_time?: string;
  reporting_day?: string | number; // Day name for weekly, or day number (1-31) for monthly
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
  subject: string;
  status: 'open' | 'closed';
  urgency: 'ok' | 'warning' | 'critical' | 'overdue';
  first_message_at: number;
  last_activity_at: number;
  deadline?: number;
  message_count: number;
}

export interface VigilEvent {
  event_id: string;
  type: string;
  watcher_id: string;
  timestamp: number;
  payload: Record<string, unknown>;
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

  async getThreads(watcherId: string): Promise<{ threads: Thread[] }> {
    return this.request('GET', `/api/watchers/${watcherId}/threads`, { requireAuth: true });
  }

  async getThread(watcherId: string, threadId: string): Promise<{ thread: Thread }> {
    return this.request('GET', `/api/watchers/${watcherId}/threads/${threadId}`, { requireAuth: true });
  }

  async closeThread(watcherId: string, threadId: string): Promise<{ closed: boolean; thread_id: string; closed_at: number }> {
    return this.request('POST', `/api/watchers/${watcherId}/threads/${threadId}/close`, { requireAuth: true });
  }

  // ============================================================================
  // Events
  // ============================================================================

  async getEvents(
    watcherId: string,
    options?: { limit?: number; before?: number; type?: string }
  ): Promise<{ events: VigilEvent[] }> {
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
    // Backend may add dedicated endpoint later
    const limit = options?.limit || 200;
    const result = await this.getEvents(watcherId, { limit });

    // Filter events that belong to this thread
    const threadEvents = result.events.filter(event => {
      const payload = event.payload as Record<string, unknown>;
      return payload.thread_id === threadId ||
             (event.type === 'THREAD_OPENED' && payload.thread_id === threadId) ||
             (event.type === 'THREAD_CLOSED' && payload.thread_id === threadId) ||
             (event.type === 'REMINDER_GENERATED' && payload.thread_id === threadId) ||
             (event.type === 'REMINDER_EVALUATED' && payload.thread_id === threadId) ||
             (event.type === 'ALERT_QUEUED' && payload.thread_id === threadId) ||
             (event.type === 'ALERT_SENT' && payload.thread_id === threadId);
    });

    return { events: threadEvents };
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

  async createBillingPortalSession(): Promise<{ portal_url: string }> {
    return this.request('POST', '/api/billing/portal', {
      body: {
        return_url: `${window.location.origin}/account/billing`,
      },
      requireAuth: true,
    });
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
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing
export { ApiClient };
