'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function AccountProfilePage() {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [email] = useState(user?.email || '');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-semibold text-gray-900">Profile</h1>
        <p className="text-base text-gray-600 mt-2">
          Manage your account details and preferences.
        </p>
      </div>

      {/* Account Information */}
      <div className="panel">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
        </div>

        <div className="p-5 space-y-6">
          {/* Email */}
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="flex items-center gap-4">
              <input
                type="email"
                value={email}
                disabled={!isEditing}
                className="input max-w-sm disabled:bg-surface-sunken disabled:text-gray-600"
              />
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-base link"
                >
                  Change
                </button>
              )}
            </div>
            <p className="form-hint">This is the email associated with your Vigil account.</p>
          </div>

          {/* Account ID */}
          <div className="form-group">
            <label className="form-label">Account ID</label>
            <code className="block px-4 py-3 bg-surface-sunken border border-gray-200 rounded-md text-base font-mono text-gray-700 max-w-sm">
              {user?.account_id || '...'}
            </code>
            <p className="form-hint">Your unique account identifier for API access.</p>
          </div>

          {/* User ID */}
          <div className="form-group">
            <label className="form-label">User ID</label>
            <code className="block px-4 py-3 bg-surface-sunken border border-gray-200 rounded-md text-base font-mono text-gray-700 max-w-sm">
              {user?.user_id || '...'}
            </code>
          </div>

          {/* Role */}
          <div className="form-group">
            <label className="form-label">Role</label>
            <span className="badge badge-inactive">
              {user?.role || 'member'}
            </span>
          </div>
        </div>

        {isEditing && (
          <div className="px-4 py-3 bg-surface-sunken border-t border-gray-200 flex justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button className="btn btn-primary">Save changes</button>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="panel border-status-critical/30">
        <div className="px-4 py-3 border-b border-status-critical/20">
          <h2 className="font-semibold text-status-critical">Danger Zone</h2>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Delete Account</h3>
              <p className="text-sm text-gray-600">
                Permanently delete your account and all associated data.
              </p>
            </div>
            <button className="btn btn-danger">Delete Account</button>
          </div>
        </div>
      </div>
    </div>
  );
}
