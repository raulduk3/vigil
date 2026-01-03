'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const OAUTH_COMING_SOON = false;

interface OAuthLink {
  provider: string;
  email: string;
  created_at: string;
}

export default function AccountSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [oauthLinks, setOauthLinks] = useState<OAuthLink[]>([]);
  const [hasPassword, setHasPassword] = useState(true);
  const [loadingLinks, setLoadingLinks] = useState(true);

  useEffect(() => {
    if (OAUTH_COMING_SOON) {
      setLoadingLinks(false);
      return;
    }

    const fetchOAuthLinks = async () => {
      try {
        const result = await api.getOAuthLinks();
        setOauthLinks(result.links);
        setHasPassword(result.has_password ?? true);
      } catch {
        // OAuth links not available, that's ok
      } finally {
        setLoadingLinks(false);
      }
    };
    fetchOAuthLinks();
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      if (result.success) {
        setSuccess(hasPassword ? 'Password changed successfully' : 'Password set successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true);
      } else {
        setError(result.error || 'Failed to change password');
      }
    } catch {
      setError('Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectOAuth = (provider: string) => {
    api.linkOAuthProvider(provider);
  };

  const handleDisconnectOAuth = async (provider: string) => {
    setError('');
    const result = await api.unlinkOAuthProvider(provider);
    if (result.success) {
      setOauthLinks(links => links.filter(l => l.provider !== provider));
      setSuccess(`${provider.charAt(0).toUpperCase() + provider.slice(1)} disconnected`);
    } else {
      setError(result.error || 'Failed to disconnect provider');
    }
  };

  const isProviderConnected = (provider: string) => {
    return oauthLinks.some(l => l.provider === provider);
  };

  const getProviderLink = (provider: string) => {
    return oauthLinks.find(l => l.provider === provider);
  };
  
  // Check if user can disconnect a provider (must have another auth method)
  const canDisconnect = (provider: string) => {
    const otherOAuthCount = oauthLinks.filter(l => l.provider !== provider).length;
    return hasPassword || otherOAuthCount > 0;
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900">Security</h2>
        <p className="mt-1 text-sm sm:text-base text-gray-500">
          Manage your password and connected accounts
        </p>
      </div>

      {/* Change Password Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                {hasPassword ? 'Change Password' : 'Set Password'}
              </h3>
              <p className="text-sm text-gray-500 hidden sm:block">
                {hasPassword 
                  ? 'Update your password to keep your account secure'
                  : 'Set a password to enable email/password login alongside OAuth'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="p-4 sm:p-6 space-y-5">
          {/* Alert Messages */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <div className="grid gap-5">
            {hasPassword && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-colors"
                  required={hasPassword}
                  placeholder="Enter your current password"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {hasPassword ? 'New Password' : 'Password'}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-colors"
                required
                minLength={8}
                placeholder={hasPassword ? 'Enter new password' : 'Create a password'}
              />
              <p className="text-xs text-gray-500">Must be at least 8 characters</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Confirm {hasPassword ? 'New ' : ''}Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-colors"
                required
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto px-6 py-3 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : hasPassword ? (
                'Update Password'
              ) : (
                'Set Password'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Connected Accounts Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Connected Accounts</h3>
              <p className="text-sm text-gray-500 hidden sm:block">
                Manage OAuth connections to your account
              </p>
            </div>
          </div>
          {OAUTH_COMING_SOON && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-700">OAuth connections are temporarily disabled. Coming soon.</p>
            </div>
          )}
          {!hasPassword && oauthLinks.length === 1 && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-amber-700">Set a password above before disconnecting your only OAuth provider.</p>
            </div>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {/* Google */}
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-200">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Google</p>
                  <p className="text-sm text-gray-500">
                    {isProviderConnected('google') 
                      ? getProviderLink('google')?.email 
                      : 'Sign in with your Google account'}
                  </p>
                </div>
              </div>
              {loadingLinks ? (
                <div className="w-24 h-10 bg-gray-100 animate-pulse rounded-lg"></div>
              ) : OAUTH_COMING_SOON ? (
                <button
                  disabled
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                >
                  Coming soon
                </button>
              ) : isProviderConnected('google') ? (
                <button 
                  onClick={() => handleDisconnectOAuth('google')}
                  disabled={!canDisconnect('google')}
                  className={`w-full sm:w-auto px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    canDisconnect('google') 
                      ? 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200' 
                      : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                  }`}
                  title={!canDisconnect('google') ? 'Set a password first' : ''}
                >
                  Disconnect
                </button>
              ) : (
                <button 
                  onClick={() => handleConnectOAuth('google')}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* GitHub */}
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">GitHub</p>
                  <p className="text-sm text-gray-500">
                    {isProviderConnected('github') 
                      ? getProviderLink('github')?.email 
                      : 'Sign in with your GitHub account'}
                  </p>
                </div>
              </div>
              {loadingLinks ? (
                <div className="w-24 h-10 bg-gray-100 animate-pulse rounded-lg"></div>
              ) : OAUTH_COMING_SOON ? (
                <button
                  disabled
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                >
                  Coming soon
                </button>
              ) : isProviderConnected('github') ? (
                <button 
                  onClick={() => handleDisconnectOAuth('github')}
                  disabled={!canDisconnect('github')}
                  className={`w-full sm:w-auto px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    canDisconnect('github') 
                      ? 'text-red-600 bg-red-50 hover:bg-red-100 border border-red-200' 
                      : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                  }`}
                  title={!canDisconnect('github') ? 'Set a password first' : ''}
                >
                  Disconnect
                </button>
              ) : (
                <button 
                  onClick={() => handleConnectOAuth('github')}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Sessions Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Active Sessions</h3>
              <p className="text-sm text-gray-500 hidden sm:block">
                Manage your active login sessions
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Current Session</p>
                <p className="text-sm text-gray-500">This device • Active now</p>
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
              Current
            </span>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors">
            Sign out of all other sessions
          </button>
        </div>
      </div>
    </div>
  );
}
