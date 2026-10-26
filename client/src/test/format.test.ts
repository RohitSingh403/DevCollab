import { describe, expect, it } from 'vitest';
import { groupIssues, safeNext, suggestKey, timeAgo } from '../lib/format';
import type { Issue } from '../lib/types';

describe('format helpers', () => {
  it('suggests short project keys', () => {
    expect(suggestKey('API Platform')).toBe('AP');
    expect(suggestKey('Web')).toBe('WEB');
    expect(suggestKey('A')).toBe('AP');
  });

  it('keeps every status column, including empty ones', () => {
    const issues = [{ status: 'todo' }, { status: 'done' }, { status: 'todo' }] as Issue[];
    const grouped = groupIssues(issues);
    expect(grouped.todo).toHaveLength(2);
    expect(grouped.done).toHaveLength(1);
    expect(grouped.backlog).toHaveLength(0);
    expect(grouped.in_progress).toHaveLength(0);
  });

  it('formats recent timestamps', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(timeAgo('2026-10-26T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-10-26T11:00:00Z', now)).toBe('1h ago');
    expect(timeAgo('2026-10-24T12:00:00Z', now)).toBe('2d ago');
  });

  it('only allows in-app redirects', () => {
    expect(safeNext('/w/123')).toBe('/w/123');
    expect(safeNext('https://evil.test')).toBe('/app');
    expect(safeNext('//evil.test')).toBe('/app');
  });
});
