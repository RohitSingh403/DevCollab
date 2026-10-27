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
      q: '',
      layout: 'list',
    });
    expect(currentFilters(params, 'someone-else').assignee).toBe('user-1');
  });

  it('knows when a filter set is worth saving', () => {
    const empty = { status: '', priority: '', assignee: '', overdue: false, q: '', layout: 'board' as const };
    expect(hasViewFilter(empty)).toBe(false);
    expect(hasViewFilter({ ...empty, overdue: true })).toBe(true);
    expect(sameFilters(empty, { ...empty })).toBe(true);
    expect(sameFilters(empty, { ...empty, q: 'auth' })).toBe(false);
  });
});