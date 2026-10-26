export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const INVITE_ROLES = ['admin', 'member'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const ROLE_RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function roleRank(role: Role) {
  return ROLE_RANK[role];
}

export function canManageTarget(actor: Role, target: Role) {
  if (actor === 'owner') return true;
  return actor === 'admin' && target === 'member';
}

export function canAssignRole(actor: Role, next: Role) {
  if (actor === 'owner') return true;
  return actor === 'admin' && next === 'member';
}
