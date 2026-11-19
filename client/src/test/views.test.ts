import { describe, expect, it } from 'vitest';
import { currentFilters, hasViewFilter, sameFilters } from '../lib/views';

describe('saved view filters', () => {
  it('turns the signed-in user into the me assignee', () => {
    const params = new URLSearchParams('priority=high&assignee=user-1&view=list');
    expect(currentFilters(params, 'user-1')).toEqual({
      status: '',
      priority: 'high',
      assignee: 'me',
      overdue: false,
      quiet: false,
      dueSoon: false,
      blocked: false,
      unestimated: false,
      q: '',
      layout: 'list',
      label: '',
      sort: 'updated',
    });
    expect(currentFilters(new URLSearchParams('label=bug&sort=priority'), 'user-1')).toMatchObject({ label: 'bug', sort: 'priority' });
    expect(currentFilters(new URLSearchParams('sort=nope'), 'user-1').sort).toBe('updated');
    expect(currentFilters(params, 'someone-else').assignee).toBe('user-1');
  });

  it('knows when a filter set is worth saving', () => {
    const empty = { status: '', priority: '', assignee: '', overdue: false, quiet: false, dueSoon: false, blocked: false, unestimated: false, q: '', layout: 'board' as const, label: '', sort: 'updated' as const };
    expect(hasViewFilter(empty)).toBe(false);
    expect(hasViewFilter({ ...empty, overdue: true })).toBe(true);
    expect(hasViewFilter({ ...empty, quiet: true })).toBe(true);
    expect(hasViewFilter({ ...empty, dueSoon: true })).toBe(true);
    expect(hasViewFilter({ ...empty, blocked: true })).toBe(true);
    expect(hasViewFilter({ ...empty, unestimated: true })).toBe(true);
    expect(hasViewFilter({ ...empty, label: 'bug' })).toBe(true);
    expect(hasViewFilter({ ...empty, sort: 'priority' })).toBe(true);
    expect(sameFilters(empty, { ...empty })).toBe(true);
    expect(sameFilters(empty, { ...empty, q: 'auth' })).toBe(false);
  });
});