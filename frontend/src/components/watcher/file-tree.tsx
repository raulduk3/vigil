'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Thread, Reminder, VigilEvent } from '@/lib/api';
import { formatReminderType, formatFriendlyDate, formatConfidence } from '@/lib/format';

// ============================================================================
// Types
// ============================================================================

export type SelectionType = 'thread' | 'reminder' | 'signal' | 'message';

export interface Selection {
  type: SelectionType;
  id: string;
}

interface FileTreeProps {
  watcherId: string;
  threads: Thread[];
  reminders: Reminder[];
  events: VigilEvent[];
  onMoveReminder: (reminderId: string, toThreadId: string) => Promise<void>;
  onDismissReminder: (reminderId: string) => Promise<void>;
  onCloseThread: (threadId: string) => Promise<void>;
  selection?: Selection | null;
  onSelectionChange?: (selection: Selection | null) => void;
}

interface DragData {
  type: 'reminder';
  reminder: Reminder;
  fromThreadId: string;
}

// Signal event types we care about
const SIGNAL_EVENT_TYPES = [
  'HARD_DEADLINE_EXTRACTED',
  'SOFT_DEADLINE_EXTRACTED',
  'URGENCY_SIGNAL_EXTRACTED',
  'CLOSURE_SIGNAL_EXTRACTED',
];

// Format timestamp to locale string
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ============================================================================
// Icons
// ============================================================================

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FolderIcon({ open, silenceAlerted }: { open: boolean; silenceAlerted?: boolean }) {
  // Use silence-based coloring: amber if silence alerted, else default
  const colorClass = silenceAlerted ? 'text-amber-500' : 'text-vigil-500';

  if (open) {
    return (
      <svg className={`w-5 h-5 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z"
          clipRule="evenodd"
        />
        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
      </svg>
    );
  }
  return (
    <svg className={`w-5 h-5 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function ReminderIcon({ type, urgency }: { type: string; urgency?: 'ok' | 'warning' | 'critical' | 'overdue' }) {
  // Color based on urgency for deadlines, or fixed colors for other types
  const getColorClass = () => {
    if (type === 'urgency_signal') return 'text-orange-500';
    if (type === 'soft_deadline') return 'text-purple-500';
    if (type === 'manual') return 'text-blue-500';
    
    // For hard deadline types, color by urgency
    if (urgency === 'overdue') return 'text-red-600';
    if (urgency === 'critical') return 'text-red-500';
    if (urgency === 'warning') return 'text-amber-500';
    if (type === 'hard_deadline') return 'text-red-400';
    return 'text-gray-400';
  };

  const colorClass = getColorClass();

  // Urgency signals get exclamation/alert triangle icon
  if (type === 'urgency_signal') {
    return (
      <svg className={`w-4 h-4 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }

  // Hard deadlines get calendar icon
  if (type === 'hard_deadline') {
    return (
      <svg className={`w-4 h-4 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        {(urgency === 'critical' || urgency === 'overdue') && (
          <circle cx="16" cy="4" r="3" fill="currentColor" className="text-red-500" />
        )}
      </svg>
    );
  }

  // Soft deadlines get bell/notification icon
  if (type === 'soft_deadline') {
    return (
      <svg className={`w-4 h-4 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    );
  }

  // Manual reminders get bookmark icon
  if (type === 'manual') {
    return (
      <svg className={`w-4 h-4 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
      </svg>
    );
  }

  // Default clock icon
  return (
    <svg className={`w-4 h-4 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SignalIcon({ type }: { type: string }) {
  // Different icons for different signal types
  if (type.includes('HARD_DEADLINE')) {
    return (
      <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
      </svg>
    );
  }
  if (type.includes('SOFT_DEADLINE')) {
    return (
      <svg className="w-3.5 h-3.5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    );
  }
  if (type.includes('URGENCY')) {
    // Flame/fire icon for urgency signals
    return (
      <svg className="w-3.5 h-3.5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
      </svg>
    );
  }
  if (type.includes('CLOSURE')) {
    return (
      <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
      <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
    </svg>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a field from a VigilEvent, checking both payload and root level.
 * The backend spreads payload fields into the event root, so we need to check both.
 */
function getEventField(event: VigilEvent, field: string): unknown {
  const payload = event.payload as Record<string, unknown> | undefined;
  const root = event as unknown as Record<string, unknown>;
  return payload?.[field] ?? root?.[field];
}

function formatSignalType(type: string): string {
  const map: Record<string, string> = {
    'HARD_DEADLINE_EXTRACTED': 'Hard Deadline',
    'SOFT_DEADLINE_EXTRACTED': 'Soft Deadline',
    'URGENCY_SIGNAL_EXTRACTED': 'Urgency Signal',
    'CLOSURE_SIGNAL_EXTRACTED': 'Closure Signal',
  };
  return map[type] || type.replace(/_/g, ' ').toLowerCase();
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Calculate urgency level for a reminder based on its deadline
 */
function calculateReminderUrgency(deadline_utc: number | null): 'ok' | 'warning' | 'critical' | 'overdue' {
  if (!deadline_utc) return 'ok';
  
  const now = Date.now();
  const hoursUntilDeadline = (deadline_utc - now) / (1000 * 60 * 60);
  
  if (hoursUntilDeadline < 0) return 'overdue';
  if (hoursUntilDeadline < 2) return 'critical';  // Less than 2 hours
  if (hoursUntilDeadline < 24) return 'warning';  // Less than 24 hours
  return 'ok';
}

/**
 * Get urgency-based color classes for deadline display
 */
function getDeadlineColorClass(urgency: 'ok' | 'warning' | 'critical' | 'overdue'): string {
  switch (urgency) {
    case 'overdue':
      return 'text-red-600 font-semibold';
    case 'critical':
      return 'text-red-500 font-medium';
    case 'warning':
      return 'text-amber-600';
    default:
      return 'text-gray-500';
  }
}

// ============================================================================
// Message Leaf Node
// ============================================================================

interface MessageNodeProps {
  event: VigilEvent;
  watcherId: string;
  compact?: boolean;
}

function MessageNode({ event, compact = false }: MessageNodeProps) {
  const sender = String(getEventField(event, 'original_sender') || getEventField(event, 'sender') || 'Unknown');
  const subject = String(getEventField(event, 'subject') || 'No subject');

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-1 pl-4 text-xs text-gray-500">
        <MessageIcon />
        <span className="truncate max-w-xs" title={`From: ${sender}\nSubject: ${subject}`}>
          {sender.split('@')[0]}: {subject}
        </span>
        <span className="text-gray-400 flex-shrink-0">{formatRelativeTime(event.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-2 pl-4 pr-2 bg-gray-50/50 rounded-md">
      <MessageIcon />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-gray-700 truncate" title={sender}>
            {sender}
          </span>
          <span className="text-gray-400 flex-shrink-0">{formatRelativeTime(event.timestamp)}</span>
        </div>
        <p className="text-xs text-gray-600 truncate mt-0.5" title={subject}>
          {subject}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Signal Node (under Reminder)
// ============================================================================

interface SignalNodeProps {
  event: VigilEvent;
  message?: VigilEvent;
  watcherId: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

function SignalNode({ event, message, isSelected, onSelect }: SignalNodeProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract fields using helper
  const sourceSpan = String(
    getEventField(event, 'source_span') ||
    getEventField(event, 'signal_text') ||
    getEventField(event, 'deadline_text') ||
    ''
  );
  const confidence = getEventField(event, 'confidence') as string | undefined;
  const deadlineUtc = getEventField(event, 'deadline_utc') as number | undefined;

  return (
    <div className="ml-2">
      <div
        className={`flex items-center gap-2 py-1.5 pl-2 pr-2 rounded cursor-pointer group transition-colors ${
          isSelected ? 'bg-vigil-50 ring-1 ring-vigil-200' : 'hover:bg-gray-50'
        }`}
        onClick={(e) => {
          // If clicking the chevron, toggle expand; otherwise select the signal
          if ((e.target as HTMLElement).closest('button')) {
            setExpanded(!expanded);
          } else {
            onSelect?.();
          }
        }}
      >
        {message ? (
          <button className="p-0.5 opacity-50 group-hover:opacity-100">
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <div className="w-5" />
        )}
        <SignalIcon type={event.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700">{formatSignalType(event.type)}</span>
            {confidence && (
              <span className="text-xs text-gray-400">({confidence})</span>
            )}
            <span className="text-xs text-gray-400">{formatRelativeTime(event.timestamp)}</span>
          </div>
          {sourceSpan && (
            <p className="text-xs text-gray-500 italic truncate mt-0.5" title={sourceSpan}>
              &ldquo;{sourceSpan.slice(0, 60)}{sourceSpan.length > 60 ? '...' : ''}&rdquo;
            </p>
          )}
          {deadlineUtc && typeof deadlineUtc === 'number' && (
            <p className="text-xs text-gray-500 mt-0.5">
              Deadline: <span className="font-mono">{formatFriendlyDate(deadlineUtc)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Message source */}
      {expanded && message && (
        <div className="ml-6 border-l border-gray-200 pl-2 mt-1 mb-1">
          <MessageNode event={message} watcherId="" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Draggable Reminder Item with Signals
// ============================================================================

interface DraggableReminderProps {
  reminder: Reminder;
  watcherId: string;
  signals: VigilEvent[];
  messages: Map<string, VigilEvent>;
  onDismiss: (reminderId: string) => Promise<void>;
  isDragging?: boolean;
  onSignalSelect: (signal: VigilEvent) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  // Signal selection
  selectedSignalId?: string | null;
  onSignalSelectionChange?: (signalId: string) => void;
}

function DraggableReminder({
  reminder,
  watcherId,
  signals,
  messages,
  onDismiss,
  isDragging = false,
  onSignalSelect,
  isSelected = false,
  onSelect,
  selectedSignalId,
  onSignalSelectionChange,
}: DraggableReminderProps) {
  // Calculate urgency based on deadline (only for active reminders)
  const isDismissed = reminder.status === 'dismissed';
  const urgency = isDismissed ? 'ok' : calculateReminderUrgency(reminder.deadline_utc);
  const deadlineColorClass = isDismissed ? 'text-gray-400' : getDeadlineColorClass(urgency);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: reminder.reminder_id,
    data: {
      type: 'reminder',
      reminder,
      fromThreadId: reminder.thread_id,
    } as DragData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const isBeingDragged = isDragging || isSortableDragging;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
          onSelect?.();
        }}
        className={`group flex items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 pl-8 sm:pl-10 border-b border-gray-100 transition-all cursor-pointer ${
          isDismissed
            ? 'opacity-50 bg-gray-50/50 hover:bg-gray-100/50'
            : isSelected
            ? 'bg-vigil-50 ring-1 ring-vigil-200'
            : isBeingDragged
            ? 'bg-blue-50 shadow-lg'
            : urgency === 'overdue'
            ? 'bg-red-50/40 hover:bg-red-50/60'
            : urgency === 'critical'
            ? 'bg-orange-50/30 hover:bg-orange-50/50'
            : 'hover:bg-white'
        }`}
      >
        {/* Spacer for alignment */}
        <div className="w-5 flex-shrink-0" />

        {/* Drag Handle - hidden on mobile */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 hidden sm:block"
          title="Drag to move to another thread"
        >
          <GripIcon />
        </button>

        {/* Icon + Description */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <ReminderIcon type={reminder.reminder_type} urgency={isDismissed ? 'ok' : urgency} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm truncate ${isDismissed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
              {reminder.description || reminder.source_span || formatReminderType(reminder.reminder_type)}
            </p>
            {/* Mobile: show type and deadline inline */}
            <p className="text-xs text-gray-500 sm:hidden truncate">
              {formatReminderType(reminder.reminder_type)}
              {reminder.deadline_utc && ` • ${formatFriendlyDate(reminder.deadline_utc)}`}
            </p>
          </div>
        </div>

        {/* Type - hidden on mobile */}
        <div className="w-16 sm:w-20 flex-shrink-0 text-center hidden sm:block">
          <span className={`text-xs ${isDismissed ? 'text-gray-400' : 'text-gray-500'}`}>
            {formatReminderType(reminder.reminder_type).replace(' Deadline', '')}
          </span>
        </div>

        {/* Deadline - hidden on small */}
        <div className="w-20 sm:w-24 flex-shrink-0 text-right hidden md:block">
          {reminder.deadline_utc ? (
            <span className={`text-xs font-mono ${deadlineColorClass}`}>
              {formatFriendlyDate(reminder.deadline_utc)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </div>

        {/* Status/Urgency Badge */}
        <div className="w-14 sm:w-16 flex-shrink-0 text-center">
          {isDismissed ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">
              ✓
            </span>
          ) : (urgency === 'critical' || urgency === 'overdue') ? (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              urgency === 'overdue' 
                ? 'bg-red-100 text-red-700' 
                : 'bg-orange-100 text-orange-700'
            }`}>
              {urgency === 'overdue' ? '!' : '!!'}
            </span>
          ) : urgency === 'warning' ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              ⚠
            </span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">●</span>
          )}
        </div>

        {/* Actions */}
        <div className="w-8 sm:w-12 flex-shrink-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {!isDismissed && (
            <button
              onClick={() => onDismiss(reminder.reminder_id)}
              className="text-gray-400 hover:text-red-600 p-1"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Reminder Overlay (shown while dragging)
// ============================================================================

function ReminderDragOverlay({ reminder }: { reminder: Reminder }) {
  const urgency = calculateReminderUrgency(reminder.deadline_utc);
  
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 bg-white rounded-md shadow-xl ring-2 ring-blue-400 max-w-md">
      <ReminderIcon type={reminder.reminder_type} urgency={urgency} />
      <span className="text-sm text-gray-900 truncate">
        {reminder.description || reminder.source_span || formatReminderType(reminder.reminder_type)}
      </span>
      {urgency !== 'ok' && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          urgency === 'overdue' 
            ? 'bg-red-100 text-red-700' 
            : urgency === 'critical'
            ? 'bg-orange-100 text-orange-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {urgency === 'overdue' ? 'Overdue' : urgency === 'critical' ? 'Due soon' : 'Warning'}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Thread Folder (droppable)
// ============================================================================

interface ThreadFolderProps {
  thread: Thread;
  watcherId: string;
  reminders: Reminder[];
  signalsByReminder: Map<string, VigilEvent[]>;
  messages: Map<string, VigilEvent>;
  onDismissReminder: (reminderId: string) => Promise<void>;
  onCloseThread: (threadId: string) => Promise<void>;
  isDropTarget: boolean;
  defaultExpanded?: boolean;
  onSignalSelect: (signal: VigilEvent) => void;
  // Selection props
  selectedId?: string | null;
  selectedType?: SelectionType | null;
  onSelectionChange?: (selection: Selection | null) => void;
}

function ThreadFolder({
  thread,
  watcherId,
  reminders,
  signalsByReminder,
  messages,
  onDismissReminder,
  onCloseThread,
  isDropTarget,
  defaultExpanded = true,
  onSignalSelect,
  selectedId,
  selectedType,
  onSelectionChange,
}: ThreadFolderProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  // Get ALL reminders for this thread (active and dismissed)
  const allThreadReminders = reminders.filter(
    (r) => r.thread_id === thread.thread_id
  );
  const activeReminders = allThreadReminders.filter(r => r.status === 'active');
  const dismissedReminders = allThreadReminders.filter(r => r.status === 'dismissed');
  const threadReminders = [...activeReminders, ...dismissedReminders]; // Active first, then dismissed

  const {
    setNodeRef,
    isOver,
  } = useSortable({
    id: `thread-${thread.thread_id}`,
    data: {
      type: 'thread',
      thread,
    },
  });

  const isHighlighted = isOver || isDropTarget;
  const isThreadSelected = selectedType === 'thread' && selectedId === thread.thread_id;

  // Count total signals across all reminders in this thread
  const totalSignals = threadReminders.reduce((sum, r) => {
    return sum + (signalsByReminder.get(r.reminder_id)?.length || 0);
  }, 0);

  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${
        isHighlighted ? 'bg-blue-50' : ''
      }`}
    >
      {/* Thread Row - Responsive Table Style */}
      <div
        className={`group flex items-center gap-2 sm:gap-3 py-2 sm:py-2.5 px-2 sm:px-3 border-b border-gray-200 cursor-pointer transition-all ${
          isThreadSelected
            ? 'bg-vigil-100 border-l-4 border-l-vigil-500'
            : isHighlighted 
            ? 'bg-blue-100' 
            : 'hover:bg-gray-50'
        }`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          onSelectionChange?.({ type: 'thread', id: thread.thread_id });
        }}
      >
        {/* Expand Toggle */}
        <button className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          <ChevronIcon expanded={expanded} />
        </button>

        {/* Drag handle spacer - hidden on mobile */}
        <div className="w-5 flex-shrink-0 hidden sm:block" />

        {/* Thread Info */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <FolderIcon open={expanded} silenceAlerted={thread.silence_alerted} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {thread.subject || 'No subject'}
            </p>
            <p className="text-xs text-gray-500 sm:hidden">
              {activeReminders.length} active
            </p>
          </div>
        </div>

        {/* Type/Count - hidden on mobile */}
        <div className="w-16 sm:w-20 flex-shrink-0 text-center hidden sm:block">
          <span className="text-xs text-gray-500">
            {activeReminders.length}{dismissedReminders.length > 0 ? `/${allThreadReminders.length}` : ''} reminders
          </span>
        </div>

        {/* Last Activity - hidden on small */}
        <div className="w-20 sm:w-24 flex-shrink-0 text-right hidden md:block">
          <span className="text-xs text-gray-400 font-mono">
            {formatRelativeTime(thread.last_activity_at)}
          </span>
        </div>

        {/* Status Badge */}
        <div className="w-14 sm:w-16 flex-shrink-0 text-center">
          <span
            className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
              thread.status === 'closed'
                ? 'bg-gray-100 text-gray-600'
                : thread.silence_alerted
                ? 'bg-amber-100 text-amber-700'
                : 'bg-green-100 text-green-700'
            }`}
          >
            {thread.status === 'closed' ? 'closed' : thread.silence_alerted ? 'silent' : '✓'}
          </span>
        </div>

        {/* Actions */}
        <div className="w-8 sm:w-12 flex-shrink-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {thread.status === 'open' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseThread(thread.thread_id);
              }}
              className="text-gray-400 hover:text-green-600 p-1"
              title="Close thread"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Reminders (children) */}
      {expanded && (
        <div className="bg-gray-50/30">
          {/* Reminder Sub-header */}
          {allThreadReminders.length > 0 && (
            <div className="flex items-center gap-2 sm:gap-3 py-1.5 px-2 sm:px-3 pl-8 sm:pl-10 bg-gray-100/80 border-b border-gray-200 text-xs text-gray-500">
              <div className="w-5 flex-shrink-0 hidden sm:block" /> {/* Drag spacer */}
              <div className="flex-1 min-w-0 font-medium">
                Reminders ({activeReminders.length} active{dismissedReminders.length > 0 ? `, ${dismissedReminders.length} dismissed` : ''})
              </div>
              <div className="w-16 sm:w-20 text-center flex-shrink-0 hidden sm:block">Type</div>
              <div className="w-20 sm:w-24 text-right flex-shrink-0 hidden md:block">Deadline</div>
              <div className="w-14 sm:w-16 text-center flex-shrink-0">Status</div>
              <div className="w-8 sm:w-12 flex-shrink-0" />
            </div>
          )}
          
          {threadReminders.length > 0 ? (
            <SortableContext
              items={threadReminders.map((r) => r.reminder_id)}
              strategy={verticalListSortingStrategy}
            >
              {threadReminders
                .sort((a, b) => (a.deadline_utc || Infinity) - (b.deadline_utc || Infinity))
                .map((reminder) => (
                  <DraggableReminder
                    key={reminder.reminder_id}
                    reminder={reminder}
                    watcherId={watcherId}
                    signals={signalsByReminder.get(reminder.reminder_id) || []}
                    messages={messages}
                    onDismiss={onDismissReminder}
                    onSignalSelect={onSignalSelect}
                    isSelected={selectedType === 'reminder' && selectedId === reminder.reminder_id}
                    onSelect={() => onSelectionChange?.({ type: 'reminder', id: reminder.reminder_id })}
                    selectedSignalId={selectedType === 'signal' ? selectedId : null}
                    onSignalSelectionChange={(signalId) => onSelectionChange?.({ type: 'signal', id: signalId })}
                  />
                ))}
            </SortableContext>
          ) : (
            <div className="py-3 px-6 pl-10 text-xs text-gray-400 italic border-b border-gray-100">
              No active reminders
            </div>
          )}

          {/* Drop zone hint when dragging over */}
          {isHighlighted && (
            <div className="py-2 px-6 text-xs text-blue-500 flex items-center gap-1 bg-blue-50 border-b border-blue-200">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              Drop here to move reminder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main File Tree Component
// ============================================================================

export function WatcherFileTree({
  watcherId,
  threads,
  reminders,
  events,
  onMoveReminder,
  onDismissReminder,
  onCloseThread,
  selection,
  onSelectionChange,
}: FileTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<VigilEvent | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Build indexes for efficient lookup
  const { signalsByReminder, messagesByEmailId } = useMemo(() => {
    const signalMap = new Map<string, VigilEvent[]>();
    const messageMap = new Map<string, VigilEvent>();

    // Index messages by email_id
    for (const event of events) {
      if (event.type === 'EMAIL_RECEIVED') {
        const emailId = getEventField(event, 'email_id') as string | undefined;
        if (emailId) {
          messageMap.set(emailId, event);
        }
      }
    }

    // Index signals by extraction_event_id (which reminders reference)
    const signalEvents = events.filter((e) => SIGNAL_EVENT_TYPES.includes(e.type));

    // Create a map of event_id -> signal event
    const signalById = new Map<string, VigilEvent>();
    for (const signal of signalEvents) {
      signalById.set(signal.event_id, signal);
    }

    // Associate signals with reminders using grouped_signal_ids (authoritative source)
    for (const reminder of reminders) {
      const reminderSignals: VigilEvent[] = [];

      // Use grouped_signal_ids as the authoritative source
      if (reminder.grouped_signal_ids && reminder.grouped_signal_ids.length > 0) {
        for (const signalId of reminder.grouped_signal_ids) {
          const signal = signalById.get(signalId);
          if (signal) {
            reminderSignals.push(signal);
          }
        }
      } else if (reminder.extraction_event_id) {
        // Fallback to extraction_event_id for older reminders without grouped_signal_ids
        const signal = signalById.get(reminder.extraction_event_id);
        if (signal) {
          reminderSignals.push(signal);
        }
      }

      signalMap.set(reminder.reminder_id, reminderSignals);
    }

    return { signalsByReminder: signalMap, messagesByEmailId: messageMap };
  }, [events, reminders]);

  const activeReminder = activeId
    ? reminders.find((r) => r.reminder_id === activeId)
    : null;

  // Filter threads
  const openThreads = threads.filter((t) => t.status === 'open');
  const closedThreads = threads.filter((t) => t.status === 'closed');

  // Find reminders without valid threads
  const threadIds = new Set(threads.map((t) => t.thread_id));
  const orphanReminders = reminders.filter(
    (r) => r.status === 'active' && !threadIds.has(r.thread_id)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      setOverId(over.id as string);
    } else {
      setOverId(null);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveId(null);
      setOverId(null);

      if (!over) return;

      const activeData = active.data.current as DragData | undefined;
      if (!activeData || activeData.type !== 'reminder') return;

      // Check if dropping on a thread
      const overId = over.id as string;
      let targetThreadId: string | null = null;

      if (overId.startsWith('thread-')) {
        targetThreadId = overId.replace('thread-', '');
      } else {
        // Might be dropping on another reminder - find its thread
        const targetReminder = reminders.find((r) => r.reminder_id === overId);
        if (targetReminder) {
          targetThreadId = targetReminder.thread_id;
        }
      }

      // Only move if target thread is different
      if (targetThreadId && targetThreadId !== activeData.fromThreadId) {
        setIsMoving(true);
        try {
          await onMoveReminder(activeData.reminder.reminder_id, targetThreadId);
        } catch (error) {
          console.error('Failed to move reminder:', error);
        } finally {
          setIsMoving(false);
        }
      }
    },
    [reminders, onMoveReminder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  // Determine which thread is being hovered
  const getDropTargetThreadId = (): string | null => {
    if (!overId) return null;
    if (overId.startsWith('thread-')) {
      return overId.replace('thread-', '');
    }
    const targetReminder = reminders.find((r) => r.reminder_id === overId);
    return targetReminder?.thread_id || null;
  };

  const dropTargetThreadId = getDropTargetThreadId();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full">
        {/* Loading overlay */}
        {isMoving && (
          <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
              <span className="spinner" />
              <span className="text-sm text-gray-700">Moving reminder...</span>
            </div>
          </div>
        )}

        {/* Table Header - Responsive */}
        <div className="flex items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 bg-gray-100 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide sticky top-0 z-10">
          <div className="w-5 flex-shrink-0" /> {/* Expand */}
          <div className="w-5 flex-shrink-0 hidden sm:block" /> {/* Drag - hide on mobile */}
          <div className="flex-1 min-w-0">Item</div>
          <div className="w-16 sm:w-20 text-center flex-shrink-0 hidden sm:block">Type</div>
          <div className="w-20 sm:w-24 text-right flex-shrink-0 hidden md:block">Due</div>
          <div className="w-14 sm:w-16 text-center flex-shrink-0">Status</div>
          <div className="w-8 sm:w-12 flex-shrink-0" /> {/* Actions */}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Open Threads */}
          {openThreads.length > 0 ? (
          <SortableContext
            items={openThreads.map((t) => `thread-${t.thread_id}`)}
            strategy={verticalListSortingStrategy}
          >
            {openThreads
              .sort((a, b) => {
                // Sort by silence_alerted first (silent threads at top), then by last_activity_at
                if (a.silence_alerted && !b.silence_alerted) return -1;
                if (!a.silence_alerted && b.silence_alerted) return 1;
                return b.last_activity_at - a.last_activity_at;
              })
              .map((thread) => (
                <ThreadFolder
                  key={thread.thread_id}
                  thread={thread}
                  watcherId={watcherId}
                  reminders={reminders}
                  signalsByReminder={signalsByReminder}
                  messages={messagesByEmailId}
                  onDismissReminder={onDismissReminder}
                  onCloseThread={onCloseThread}
                  isDropTarget={dropTargetThreadId === thread.thread_id}
                  onSignalSelect={setSelectedSignal}
                  selectedId={selection?.id}
                  selectedType={selection?.type}
                  onSelectionChange={onSelectionChange}
                />
              ))}
          </SortableContext>
        ) : (
          <div className="flex items-center justify-center py-16 text-center text-gray-500">
            <div>
              <svg
                className="w-10 h-10 mx-auto text-gray-300 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <p className="text-sm font-medium">Inbox empty</p>
              <p className="text-xs text-gray-400 mt-1">
                Forward emails to start tracking conversations
              </p>
            </div>
          </div>
        )}

          {/* Orphan Reminders */}
          {orphanReminders.length > 0 && (
            <OrphanRemindersSection
              reminders={orphanReminders}
              watcherId={watcherId}
              signalsByReminder={signalsByReminder}
              messages={messagesByEmailId}
              onDismissReminder={onDismissReminder}
              selectedId={selection?.id}
              selectedType={selection?.type}
              onSelectionChange={onSelectionChange}
            />
          )}

          {/* Closed Threads (collapsed section) */}
          {closedThreads.length > 0 && (
            <ClosedThreadsSection
              threads={closedThreads}
              watcherId={watcherId}
              selectedId={selection?.id}
              selectedType={selection?.type}
              onSelectionChange={onSelectionChange}
            />
          )}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeReminder ? <ReminderDragOverlay reminder={activeReminder} /> : null}
      </DragOverlay>

      {/* Signal Details Modal */}
      {selectedSignal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SignalIcon type={selectedSignal.type} />
                <h2 className="text-lg font-semibold text-gray-900">
                  {formatSignalType(selectedSignal.type)}
                </h2>
              </div>
              <button
                onClick={() => setSelectedSignal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Signal Details */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Signal Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="font-mono text-gray-900">{selectedSignal.type}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Timestamp</p>
                    <p className="text-gray-900">{formatDate(selectedSignal.timestamp)}</p>
                  </div>
                  {(() => {
                    const sourceSpan = getEventField(selectedSignal, 'source_span') || 
                                      getEventField(selectedSignal, 'signal_text') ||
                                      getEventField(selectedSignal, 'deadline_text');
                    return sourceSpan ? (
                      <div>
                        <p className="text-gray-500">Source Text</p>
                        <p className="text-gray-900 italic bg-gray-50 p-3 rounded">
                          &ldquo;{String(sourceSpan)}&rdquo;
                        </p>
                      </div>
                    ) : null;
                  })()}
                  {(() => {
                    const confidence = getEventField(selectedSignal, 'confidence');
                    return confidence ? (
                      <div>
                        <p className="text-gray-500">Confidence</p>
                        <p className="text-gray-900">{String(confidence)}</p>
                      </div>
                    ) : null;
                  })()}
                  {(() => {
                    const deadlineUtc = getEventField(selectedSignal, 'deadline_utc') as number | undefined;
                    return deadlineUtc ? (
                      <div>
                        <p className="text-gray-500">Extracted Deadline</p>
                        <p className="font-mono text-gray-900">{formatDate(deadlineUtc)}</p>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Associated Message */}
              {(() => {
                const emailId = getEventField(selectedSignal, 'email_id') as string | undefined;
                const message = emailId ? messagesByEmailId.get(emailId) : undefined;
                
                if (!message) return null;
                
                // Get message fields using the helper
                const msgSender = String(getEventField(message, 'original_sender') || getEventField(message, 'sender') || 'Unknown');
                const msgSubject = String(getEventField(message, 'subject') || 'No subject');
                const msgExcerpt = String(getEventField(message, 'body_excerpt') || '');
                
                return (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Associated Message</h3>
                    <div className="bg-gray-50 p-4 rounded space-y-2 text-sm">
                      <div>
                        <p className="text-gray-500">From</p>
                        <p className="text-gray-900">{msgSender}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Subject</p>
                        <p className="text-gray-900">{msgSubject}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Received</p>
                        <p className="text-gray-900">{formatDate(message.timestamp)}</p>
                      </div>
                      {msgExcerpt && (
                        <div>
                          <p className="text-gray-500">Preview</p>
                          <p className="text-gray-900 line-clamp-3">{msgExcerpt}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Raw Payload - show all signal data */}
              <div>
                <details className="cursor-pointer">
                  <summary className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Raw Payload
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto text-gray-700">
                    {JSON.stringify(
                      // Merge payload and root-level fields for complete view
                      { 
                        ...selectedSignal.payload,
                        ...((() => {
                          const { payload, ...rest } = selectedSignal as VigilEvent & Record<string, unknown>;
                          return rest;
                        })())
                      }, 
                      null, 
                      2
                    )}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}

// ============================================================================
// Orphan Reminders Section
// ============================================================================

interface OrphanRemindersSectionProps {
  reminders: Reminder[];
  watcherId: string;
  signalsByReminder: Map<string, VigilEvent[]>;
  messages: Map<string, VigilEvent>;
  onDismissReminder: (reminderId: string) => Promise<void>;
  selectedId?: string | null;
  selectedType?: SelectionType | null;
  onSelectionChange?: (selection: Selection | null) => void;
}

function OrphanRemindersSection({
  reminders,
  watcherId,
  signalsByReminder,
  messages,
  onDismissReminder,
  selectedId,
  selectedType,
  onSelectionChange,
}: OrphanRemindersSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-t border-gray-200">
      {/* Orphan section header row */}
      <div
        className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 cursor-pointer hover:bg-amber-50 bg-amber-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="p-0.5 flex-shrink-0">
          <ChevronIcon expanded={expanded} />
        </button>
        <div className="w-5 flex-shrink-0 hidden sm:block" /> {/* Drag spacer */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
            <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
            <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
          </svg>
          <span className="text-sm font-medium text-amber-700">
            Unassigned Reminders
          </span>
          <span className="text-xs text-amber-600">({reminders.length})</span>
        </div>
        <div className="w-16 sm:w-20 flex-shrink-0 hidden sm:block" />
        <div className="w-20 sm:w-24 flex-shrink-0 hidden md:block" />
        <div className="w-14 sm:w-16 flex-shrink-0" />
        <div className="w-8 sm:w-12 flex-shrink-0" />
      </div>

      {expanded && (
        <div className="bg-amber-50/20">
          <SortableContext
            items={reminders.map((r) => r.reminder_id)}
            strategy={verticalListSortingStrategy}
          >
            {reminders.map((reminder) => (
              <DraggableReminder
                key={reminder.reminder_id}
                reminder={reminder}
                watcherId={watcherId}
                signals={signalsByReminder.get(reminder.reminder_id) || []}
                messages={messages}
                onDismiss={onDismissReminder}
                onSignalSelect={() => {}}
                isSelected={selectedType === 'reminder' && selectedId === reminder.reminder_id}
                onSelect={() => onSelectionChange?.({ type: 'reminder', id: reminder.reminder_id })}
                selectedSignalId={selectedType === 'signal' ? selectedId : null}
                onSignalSelectionChange={(signalId) => onSelectionChange?.({ type: 'signal', id: signalId })}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Closed Threads Section
// ============================================================================

interface ClosedThreadsSectionProps {
  threads: Thread[];
  watcherId: string;
  selectedId?: string | null;
  selectedType?: SelectionType | null;
  onSelectionChange?: (selection: Selection | null) => void;
}

function ClosedThreadsSection({
  threads,
  watcherId,
  selectedId,
  selectedType,
  onSelectionChange,
}: ClosedThreadsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-gray-200">
      {/* Closed section header row */}
      <div
        className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 cursor-pointer hover:bg-gray-100 bg-gray-50/80"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="p-0.5 flex-shrink-0">
          <ChevronIcon expanded={expanded} />
        </button>
        <div className="w-5 flex-shrink-0 hidden sm:block" /> {/* Drag spacer */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-gray-500">
            Closed Threads
          </span>
          <span className="text-xs text-gray-400">({threads.length})</span>
        </div>
        <div className="w-16 sm:w-20 flex-shrink-0 hidden sm:block" />
        <div className="w-20 sm:w-24 flex-shrink-0 hidden md:block" />
        <div className="w-14 sm:w-16 flex-shrink-0" />
        <div className="w-8 sm:w-12 flex-shrink-0" />
      </div>

      {expanded && (
        <div className="bg-gray-50/30">
          {threads.slice(0, 15).map((thread) => {
            const isSelected = selectedType === 'thread' && selectedId === thread.thread_id;
            return (
              <div
                key={thread.thread_id}
                onClick={() => onSelectionChange?.({ type: 'thread', id: thread.thread_id })}
                className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 pl-8 sm:pl-10 border-b border-gray-100 cursor-pointer transition-colors ${
                  isSelected ? 'bg-vigil-50 ring-1 ring-vigil-200' : 'hover:bg-gray-100'
                }`}
              >
                <div className="w-5 flex-shrink-0 hidden sm:block" /> {/* Drag spacer */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderIcon open={false} silenceAlerted={false} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-600 truncate">
                      {thread.subject || 'No subject'}
                    </p>
                    <p className="text-xs text-gray-400 sm:hidden">
                      {thread.last_activity_at ? new Date(thread.last_activity_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
                <div className="w-20 sm:w-24 flex-shrink-0 text-right hidden md:block">
                  <span className="text-xs text-gray-400 font-mono">
                    {thread.last_activity_at ? new Date(thread.last_activity_at).toLocaleDateString() : '-'}
                  </span>
                </div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0">
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">✓</span>
                </div>
                <div className="w-8 sm:w-12 flex-shrink-0" />
              </div>
            );
          })}
          {threads.length > 15 && (
            <div className="py-2 px-4 text-xs text-gray-400 text-center border-t border-gray-100">
              + {threads.length - 15} more closed threads
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WatcherFileTree;
