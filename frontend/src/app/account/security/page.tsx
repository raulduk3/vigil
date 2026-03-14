'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api/client';

export default function SecurityPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(`${apiUrl}/api/auth/oauth/providers`)
      .then(r => r.json())
      .then(data => setProviders(data.providers || []))
      .catch(() => {});
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }

    setSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Password updated.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: data.error || 'Failed to update password.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  return (
    <main className="max-w-3xl mx-auto lg:mx-0 space-y-8">
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900 mb-1">Security</h2>
        <p className="text-sm text-gray-500">Manage your password and connected accounts.</p>
      </div>

      {/* Password Change */}
      <div className="panel p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Change Password</h3>

        {message && (
          <div className={`notice ${message.type === 'success' ? 'notice-info' : 'notice-error'} mb-4 text-sm`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="form-group">
            <label className="form-label text-sm">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="input py-2"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label text-sm">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input py-2"
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-sm">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="input py-2"
              required
              minLength={8}
            />
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* OAuth Connections */}
      {providers.length > 0 && (
        <div className="panel p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Connected Accounts</h3>
          <p className="text-sm text-gray-500 mb-4">Link external accounts for faster sign-in.</p>

          <div className="space-y-3">
            {providers.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-surface-sunken rounded">
                <div className="flex items-center gap-3">
                  {p.id === 'google' && (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  {p.id === 'github' && (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                  )}
                  <span className="text-sm font-medium text-gray-900">{p.name}</span>
                </div>
                <a
                  href={`${apiUrl}/api/auth/oauth/${p.id}`}
                  className="btn btn-secondary btn-sm"
                >
                  Connect
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions */}
      <div className="panel p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Active Session</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="status-indicator status-indicator-ok" />
          <span className="text-gray-700">{user?.email}</span>
          <span className="text-gray-400">· Current session</span>
        </div>
      </div>
    </main>
  );
}
