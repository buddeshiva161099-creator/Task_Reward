import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ensureUTC(dateString: string): string {
  if (!dateString) return dateString;
  if (dateString.includes('Z') || dateString.includes('+')) return dateString;
  return `${dateString}+05:30`;
}

export function formatDate(dateString: string): string {
  return new Date(ensureUTC(dateString)).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function formatDateTime(dateString: string): string {
  return new Date(ensureUTC(dateString)).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function formatPreciseDateTime(dateString: string): string {
  if (!dateString) return '—';
  return new Date(ensureUTC(dateString)).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/** Returns just the time part in IST (e.g. "09:32 AM") */
export function formatTimeIST(dateString: string): string {
  if (!dateString) return '—';
  return new Date(ensureUTC(dateString)).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function timeAgo(dateString: string): string {
  const date = new Date(ensureUTC(dateString));
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(dateString);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'badge-success';
    case 'completed_late': return 'badge-purple';
    case 'pending': return 'badge-warning';
    case 'in_progress': return 'badge-info';
    case 'overdue': return 'badge-danger';
    default: return 'badge-purple';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'regular': return 'priority-regular';
    case 'medium': return 'priority-medium';
    case 'high': return 'priority-high';
    case 'critical': return 'priority-critical';
    default: return '';
  }
}

export function getStatusLabel(status: string): string {
  return status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}
