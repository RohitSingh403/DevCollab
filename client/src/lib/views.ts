import type { ViewFilters } from './types';

const sorts = ['created', 'due', 'priority'] as const;

export function currentFilters(params: URLSearchParams, userId: string): ViewFilters {
  const assignee = params.get('assignee') ?? '';
  const sort = params.get('sort');
  return {
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    assignee: assignee && assignee === userId ? 'me' : assignee,
    overdue: params.get('overdue') === 'true',
    quiet: params.get('quiet') === 'true',
    dueSoon: params.get('dueSoon') === 'true',
    blocked: params.get('blocked') === 'true',
    q: params.get('q') ?? '',
    layout: params.get('view') === 'list' ? 'list' : 'board',
    label: params.get('label') ?? '',
    sort: sorts.find((item) => item === sort) ?? 'updated',
  };
}

export function sameFilters(left: ViewFilters, right: ViewFilters) {
  return (
    left.status === right.status &&
    left.priority === right.priority &&
    left.assignee === right.assignee &&
    left.overdue === right.overdue &&
    left.quiet === right.quiet &&
    left.dueSoon === right.dueSoon &&
    left.blocked === right.blocked &&
    left.q === right.q &&
    left.layout === right.layout &&
    left.label === right.label &&
    left.sort === right.sort
  );
}

export function hasViewFilter(filters: ViewFilters) {
  return Boolean(filters.status || filters.priority || filters.assignee || filters.overdue || filters.quiet || filters.dueSoon || filters.blocked || filters.q || filters.layout === 'list' || filters.label || filters.sort !== 'updated');
}
