import { STATUSES, type Issue, type IssueStatus } from './types';

export function timeAgo(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function suggestKey(name: string) {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'PR';
  const initials = words.map((word) => word[0]).join('');
  const base = (initials.length >= 2 ? initials : words.join('')).replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return (base + 'PR').slice(0, Math.max(2, base.length));
}

export function groupIssues(issues: Issue[]) {
  return Object.fromEntries(STATUSES.map((status) => [status, issues.filter((issue) => issue.status === status)])) as Record<
    IssueStatus,
    Issue[]
  >;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function dueLabel(iso: string | null, overdue: boolean) {
  if (!iso) return null;
  if (overdue) return 'Overdue';
  const day = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return 'Due today';
  return `Due ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function toDateInput(iso: string | null) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}
