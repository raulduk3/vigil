/**
 * Formatting utilities for human-readable display
 */

/**
 * Format reminder type as a human-friendly title
 */
export function formatReminderType(type: string): string {
  const typeLabels: Record<string, string> = {
    'hard_deadline': 'Deadline',
    'soft_deadline': 'Timeline',
    'urgency_signal': 'Action Needed',
    'manual': 'Manual Reminder',
  };
  return typeLabels[type] || type.replace(/_/g, ' ');
}

/**
 * Get a short description for reminder type
 */
export function getReminderTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    'hard_deadline': 'Specific due date',
    'soft_deadline': 'Flexible timeline',
    'urgency_signal': 'Requires attention',
    'manual': 'Added manually',
  };
  return descriptions[type] || '';
}

/**
 * Format urgency state as human-friendly text
 */
export function formatUrgencyState(state: string): string {
  const stateLabels: Record<string, string> = {
    'ok': 'On Track',
    'warning': 'Due Soon',
    'critical': 'Urgent',
    'overdue': 'Overdue',
  };
  return stateLabels[state] || state;
}

/**
 * Format confidence level
 */
export function formatConfidence(confidence: string | null | undefined): string | null {
  if (!confidence) return null;
  const confidenceLabels: Record<string, string> = {
    'high': 'High confidence',
    'medium': 'Medium confidence', 
    'low': 'Low confidence',
  };
  return confidenceLabels[confidence.toLowerCase()] || confidence;
}

/**
 * Format relative time in a human-friendly way
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 0) {
    // Future time
    const futureDiff = Math.abs(diff);
    const futureHours = Math.floor(futureDiff / 3600000);
    const futureDays = Math.floor(futureDiff / 86400000);
    if (futureDays > 0) return `in ${futureDays}d`;
    if (futureHours > 0) return `in ${futureHours}h`;
    return 'soon';
  }

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date in a friendly way
 */
export function formatFriendlyDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  if (isToday) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format watcher status in a friendly way
 */
export function formatWatcherStatus(status: string): string {
  const statusLabels: Record<string, string> = {
    'created': 'Not Started',
    'active': 'Active',
    'paused': 'Paused',
    'deleted': 'Deleted',
  };
  return statusLabels[status] || status;
}

/**
 * Format thread status
 */
export function formatThreadStatus(status: string): string {
  const statusLabels: Record<string, string> = {
    'open': 'Open',
    'closed': 'Resolved',
  };
  return statusLabels[status] || status;
}

/**
 * Calculate urgency level based on deadline
 */
export function calculateUrgencyFromDeadline(deadline_utc: number | null): 'ok' | 'warning' | 'critical' | 'overdue' {
  if (!deadline_utc) return 'ok';
  
  const now = Date.now();
  const hoursUntilDeadline = (deadline_utc - now) / (1000 * 60 * 60);
  
  if (hoursUntilDeadline < 0) return 'overdue';
  if (hoursUntilDeadline < 2) return 'critical';
  if (hoursUntilDeadline < 24) return 'warning';
  return 'ok';
}

/**
 * Get urgency badge color class
 */
export function getUrgencyColorClass(urgency: string): string {
  switch (urgency) {
    case 'overdue':
      return 'bg-red-100 text-red-700';
    case 'critical':
      return 'bg-orange-100 text-orange-700';
    case 'warning':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-green-100 text-green-700';
  }
}

/**
 * Format signal type to human readable
 */
export function formatSignalType(type: string): string {
  const typeLabels: Record<string, string> = {
    'HARD_DEADLINE_EXTRACTED': 'Hard Deadline',
    'SOFT_DEADLINE_EXTRACTED': 'Soft Deadline', 
    'URGENCY_SIGNAL_EXTRACTED': 'Urgency Signal',
    'CLOSURE_SIGNAL_EXTRACTED': 'Closure Signal',
  };
  return typeLabels[type] || type.replace(/_/g, ' ').toLowerCase();
}
