import type { ViewFilters } from './types';

export function currentFilters(params: URLSearchParams, userId: string): ViewFilters {
  const assignee = params.get('assignee') ?? '';
  return {
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    assignee: assignee && assignee === userId ? 'me' : assignee,
    overdue: params.get('overdue') === 'true',
    q: params.get('q') ?? '',
    layout: params.get('view') === 'list' ? 'list' : 'board',
  };
}

export function sameFilters(left: ViewFilters, right: ViewFilters) {
  return (
    left.status === right.status &&
    left.priority === right.priority &&
    left.assignee === right.assignee &&
    left.overdue === right.overdue &&
    left.q === right.q &&
    left.layout === right.layout
  );
}

export function hasViewFilter(filters: ViewFilters) {
  return Boolean(filters.status || filters.priority || filters.assignee || filters.overdue || filters.q || filters.layout === 'list');
}
