export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const INVITE_ROLES = ['admin', 'member'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const ESTIMATES = [1, 2, 3, 5, 8] as const;
export type Estimate = (typeof ESTIMATES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REACTIONS = ['+1', 'eyes', 'tada', 'check', 'heart'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const ACTIVITY_KINDS = ['issues', 'comments', 'blockers', 'cycles', 'milestones', 'members'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const ACTIVITY_TYPES: Record<ActivityKind, string[]> = {
  issues: [
    'issue.created',
    'issue.updated',
    'issue.deleted',
    'issue.moved',
    'issue.duplicated',
    'issue.status',
    'issue.assigned',
    'issue.subissue',
    'issue.checklist',
    'issue.related',
    'issue.unrelated',
  ],
  comments: ['comment.created', 'comment.pinned', 'comment.mentioned'],
  blockers: ['issue.blocked', 'issue.unblocked'],
  cycles: ['cycle.started', 'cycle.ended', 'cycle.updated'],
  milestones: ['milestone.created', 'milestone.updated', 'milestone.deleted'],
  members: ['member.joined', 'member.role_changed', 'member.removed'],
};

export function activityTypesForKind(kind: ActivityKind) {
  return ACTIVITY_TYPES[kind];
}

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
