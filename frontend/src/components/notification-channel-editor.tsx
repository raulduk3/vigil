'use client';

import React from 'react';
import type { NotificationChannel } from '@/lib/api/client';

interface NotificationChannelEditorProps {
  channels: NotificationChannel[];
  onChange: (channels: NotificationChannel[]) => void;
  maxWebhooks?: number;
}

const DEFAULT_CHANNEL: NotificationChannel = {
  type: 'email',
  destination: '',
  urgency_filter: 'all',
  enabled: true,
};

export function NotificationChannelEditor({
  channels,
  onChange,
  maxWebhooks = 5,
}: NotificationChannelEditorProps) {
  const webhookCount = channels.filter(c => c.type === 'webhook').length;

  const handleAdd = (type: 'email' | 'webhook') => {
    if (type === 'webhook' && webhookCount >= maxWebhooks) {
      return;
    }
    onChange([...channels, { ...DEFAULT_CHANNEL, type }]);
  };

  const handleRemove = (index: number) => {
    onChange(channels.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, updates: Partial<NotificationChannel>) => {
    onChange(
      channels.map((ch, i) =>
        i === index ? { ...ch, ...updates } : ch
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Notification Channels
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleAdd('email')}
            className="btn btn-secondary text-xs px-2 py-1"
          >
            + Email
          </button>
          <button
            type="button"
            onClick={() => handleAdd('webhook')}
            disabled={webhookCount >= maxWebhooks}
            className="btn btn-secondary text-xs px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title={webhookCount >= maxWebhooks ? `Maximum ${maxWebhooks} webhooks allowed` : undefined}
          >
            + Webhook {webhookCount > 0 && `(${webhookCount}/${maxWebhooks})`}
          </button>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-300 rounded-lg">
          No notification channels configured. Add an email or webhook to receive alerts.
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((channel, index) => (
            <ChannelRow
              key={index}
              channel={channel}
              index={index}
              onUpdate={(updates) => handleUpdate(index, updates)}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Configure how you receive alerts. Each channel can filter by urgency level.
        Webhooks must use HTTPS URLs.
      </p>
    </div>
  );
}

interface ChannelRowProps {
  channel: NotificationChannel;
  index: number;
  onUpdate: (updates: Partial<NotificationChannel>) => void;
  onRemove: () => void;
}

function ChannelRow({ channel, index, onUpdate, onRemove }: ChannelRowProps) {
  const [error, setError] = React.useState<string | null>(null);

  const validateDestination = (value: string) => {
    if (!value.trim()) {
      setError('Required');
      return;
    }
    
    if (channel.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        setError('Invalid email format');
        return;
      }
    } else if (channel.type === 'webhook') {
      if (!value.startsWith('https://')) {
        setError('Must be HTTPS URL');
        return;
      }
      try {
        new URL(value);
      } catch {
        setError('Invalid URL format');
        return;
      }
    }
    
    setError(null);
  };

  return (
    <div className={`border rounded-lg p-3 ${channel.enabled ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
      <div className="flex items-start gap-3">
        {/* Enable toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onUpdate({ enabled: !channel.enabled })}
            className={`w-10 h-5 rounded-full transition-colors relative ${
              channel.enabled ? 'bg-gray-900' : 'bg-gray-300'
            }`}
            title={channel.enabled ? 'Disable channel' : 'Enable channel'}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                channel.enabled ? 'left-5' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* Channel type badge */}
        <div className="w-20 flex-shrink-0">
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${
            channel.type === 'email' 
              ? 'bg-gray-100 text-gray-700' 
              : 'bg-gray-100 text-gray-700'
          }`}>
            {channel.type === 'email' ? 'Email' : 'Webhook'}
          </span>
        </div>

        {/* Destination input */}
        <div className="flex-1 min-w-0">
          <input
            type={channel.type === 'email' ? 'email' : 'url'}
            value={channel.destination}
            onChange={(e) => {
              onUpdate({ destination: e.target.value });
              validateDestination(e.target.value);
            }}
            onBlur={(e) => validateDestination(e.target.value)}
            placeholder={channel.type === 'email' ? 'alert@example.com' : 'https://api.example.com/webhook'}
            className={`input text-sm w-full ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
            disabled={!channel.enabled}
          />
          {error && (
            <p className="text-xs text-red-500 mt-0.5">{error}</p>
          )}
        </div>

        {/* Urgency filter */}
        <div className="w-28 flex-shrink-0">
          <select
            value={channel.urgency_filter}
            onChange={(e) => onUpdate({ urgency_filter: e.target.value as NotificationChannel['urgency_filter'] })}
            className="input text-sm w-full"
            disabled={!channel.enabled}
          >
            <option value="all">All alerts</option>
            <option value="warning">Warning+</option>
            <option value="critical">Critical only</option>
          </select>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove channel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Summary display for read-only mode
export function NotificationChannelSummary({ channels }: { channels: NotificationChannel[] }) {
  if (!channels || channels.length === 0) {
    return <span className="text-yellow-600">None configured</span>;
  }

  const enabled = channels.filter(c => c.enabled);
  const disabled = channels.filter(c => !c.enabled);

  return (
    <div className="space-y-1">
      {enabled.length === 0 ? (
        <span className="text-yellow-600">All channels disabled</span>
      ) : (
        enabled.map((ch, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 rounded">
              {ch.type}
            </span>
            <span className="text-gray-700 truncate">{ch.destination}</span>
            <span className="text-gray-400 text-xs">
              ({ch.urgency_filter === 'all' ? 'all' : ch.urgency_filter + '+'})
            </span>
          </div>
        ))
      )}
      {disabled.length > 0 && (
        <div className="text-xs text-gray-400">
          +{disabled.length} disabled
        </div>
      )}
    </div>
  );
}

export default NotificationChannelEditor;
