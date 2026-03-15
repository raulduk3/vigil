'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

function AccountContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${apiUrl}/api/auth/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ confirm: true, password: deletePassword || undefined }),
      });
      if (res.ok) {
        await logout();
        router.push('/');
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || 'Failed to delete account');
      }
    } catch {
      setDeleteError('Something went wrong');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto lg:mx-0 space-y-8">
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900 mb-1">Profile</h2>
        <p className="text-sm text-gray-500">Your account information.</p>
      </div>

      <div className="panel p-6 space-y-4">
        <div>
          <div className="data-label mb-1">Email</div>
          <div className="text-sm text-gray-900">{user?.email || '—'}</div>
        </div>
        <div>
          <div className="data-label mb-1">Role</div>
          <div className="text-sm text-gray-900">{user?.role || '—'}</div>
        </div>
        <div>
          <div className="data-label mb-1">Account ID</div>
          <div className="text-sm font-mono text-gray-500">{user?.account_id || '—'}</div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link href="/account/security" className="btn btn-secondary">Security</Link>
        <Link href="/account/billing" className="btn btn-secondary">Billing</Link>
        <Link href="/account/developer" className="btn btn-secondary">Developer</Link>
        <Link href="/account/keys" className="btn btn-secondary">API Keys (BYOK)</Link>
      </div>

      {/* Danger zone */}
      <div className="panel p-6 border-red-200">
        <h3 className="text-sm font-semibold text-red-700 mb-2">Delete Account</h3>
        <p className="text-sm text-gray-600 mb-4">
          Permanently delete your account and all associated data. This removes all watchers, 
          threads, memories, action logs, API keys, and billing records. This cannot be undone.
        </p>

        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} className="btn btn-danger-subtle btn-sm">
            Delete my account
          </button>
        ) : (
          <div className="space-y-3 bg-red-50 rounded p-4">
            <p className="text-sm text-red-700 font-medium">Are you sure? This is permanent.</p>
            
            <div className="form-group">
              <label className="form-label text-sm text-red-700">Enter your password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                className="input py-2 border-red-200"
                placeholder="Your password"
              />
            </div>

            {deleteError && (
              <p className="text-sm text-red-600">{deleteError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowDelete(false); setDeletePassword(''); setDeleteError(''); }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="btn btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Permanently delete my account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
