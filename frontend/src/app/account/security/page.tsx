'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

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
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Security</h1>

      {/* Change Password */}
      <div className="card mb-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {hasPassword ? 'Change Password' : 'Set Password'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {hasPassword 
              ? 'Update your password to keep your account secure.'
              : 'Set a password to enable email/password login alongside OAuth.'}
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              {success}
            </div>
          )}

          {hasPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input max-w-md"
                required={hasPassword}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {hasPassword ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input max-w-md"
              required
              minLength={8}
            />
            <p className="text-sm text-gray-500 mt-1">At least 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm {hasPassword ? 'New ' : ''}Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input max-w-md"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? 'Saving...' : hasPassword ? 'Change Password' : 'Set Password'}
          </button>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div className="card mb-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h2>
          <p className="text-sm text-gray-500 mt-1">
            Add an extra layer of security to your account.
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Status</p>
              <p className="text-sm text-gray-500">
                Two-factor authentication is not enabled.
              </p>
            </div>
            <button className="btn btn-secondary">Enable 2FA</button>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Connected Accounts</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage OAuth connections to your account.
          </p>
          {!hasPassword && oauthLinks.length === 1 && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ Set a password above before disconnecting your only OAuth provider.
            </p>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {/* Google */}
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                    : 'Not connected'}
                </p>
              </div>
            </div>
            {loadingLinks ? (
              <div className="w-20 h-8 bg-gray-100 animate-pulse rounded"></div>
            ) : isProviderConnected('google') ? (
              <button 
                onClick={() => handleDisconnectOAuth('google')}
                disabled={!canDisconnect('google')}
                className={`btn btn-outline text-sm ${
                  canDisconnect('google') 
                    ? 'text-red-600 border-red-200 hover:bg-red-50' 
                    : 'text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
                title={!canDisconnect('google') ? 'Set a password first' : ''}
              >
                Disconnect
              </button>
            ) : (
              <button 
                onClick={() => handleConnectOAuth('google')}
                className="btn btn-outline text-sm"
              >
                Connect
              </button>
            )}
          </div>

          {/* GitHub */}
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">GitHub</p>
                <p className="text-sm text-gray-500">
                  {isProviderConnected('github') 
                    ? getProviderLink('github')?.email 
                    : 'Not connected'}
                </p>
              </div>
            </div>
            {loadingLinks ? (
              <div className="w-20 h-8 bg-gray-100 animate-pulse rounded"></div>
            ) : isProviderConnected('github') ? (
              <button 
                onClick={() => handleDisconnectOAuth('github')}
                disabled={!canDisconnect('github')}
                className={`btn btn-outline text-sm ${
                  canDisconnect('github') 
                    ? 'text-red-600 border-red-200 hover:bg-red-50' 
                    : 'text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
                title={!canDisconnect('github') ? 'Set a password first' : ''}
              >
                Disconnect
              </button>
            ) : (
              <button 
                onClick={() => handleConnectOAuth('github')}
                className="btn btn-outline text-sm"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="card mt-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Active Sessions</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage your active login sessions.
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Current Session</p>
                <p className="text-sm text-gray-500">This device • Active now</p>
              </div>
            </div>
            <span className="badge badge-ok">Current</span>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button className="text-red-600 hover:text-red-700 text-sm font-medium">
            Sign out of all other sessions
          </button>
        </div>
      </div>
    </div>
  );
}
