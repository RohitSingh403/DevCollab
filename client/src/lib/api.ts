import type {
  ActivityList,
  Analytics,
  Comment,
  Invite,
  InvitePreview,
  Issue,
  IssueTemplate,
  ActiveCycles,
  Cycle,
  Milestone,
  RoadmapMilestone,
  IssueList,
  MyWork,
  QuietWork,
  DueWork,
  BlockedWork,
  Workload,
  UnassignedWork,
  UnestimatedWork,
  IssueStatus,
  Reaction,
  Favorite,
  RecentIssue,
  Label,
  Member,
  Notification,
  NotificationPreferences,
  Priority,
  Project,
  SavedView,
  ViewFilters,
  Role,
  User,
  Workspace,
} from './types';

const base = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Try again.';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${base}${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? (JSON.parse(text) as { error?: { message?: string; code?: string; details?: unknown } }) : null;
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.message || 'Request failed', data?.error?.code, data?.error?.details);
  }
  return data as T;
}

export interface IssueInput {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: Priority;
  assigneeIds?: string[];
  labelIds?: string[];
  dueDate?: string | null;
  estimate?: number | null;
  cycleId?: string | null;
  milestoneId?: string | null;
  projectId?: string;
  parentId?: string | null;
  checklist?: string[];
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me').then((data) => data.user),
  register: (input: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }).then((data) => data.user),
  login: (input: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }).then((data) => data.user),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  updateProfile: (name: string) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }).then((data) => data.user),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<void>('/api/auth/password', { method: 'POST', body: JSON.stringify(input) }),

  workspaces: () => request<{ workspaces: Workspace[] }>('/api/workspaces').then((data) => data.workspaces),
  workspace: (id: string) => request<{ workspace: Workspace }>(`/api/workspaces/${id}`).then((data) => data.workspace),
  myWork: (id: string) => request<MyWork>(`/api/workspaces/${id}/my-work`),
  unassigned: (id: string) => request<UnassignedWork>(`/api/workspaces/${id}/unassigned`),
  unestimated: (id: string) => request<UnestimatedWork>(`/api/workspaces/${id}/unestimated`),
  activeCycles: (id: string) => request<ActiveCycles>(`/api/workspaces/${id}/cycles`),
  quiet: (id: string) => request<QuietWork>(`/api/workspaces/${id}/quiet`),
  due: (id: string) => request<DueWork>(`/api/workspaces/${id}/due`),
  blocked: (id: string) => request<BlockedWork>(`/api/workspaces/${id}/blocked`),
  workload: (id: string) => request<Workload>(`/api/workspaces/${id}/workload`),
  createWorkspace: (input: { name: string; description?: string }) =>
    request<{ workspace: Workspace }>('/api/workspaces', { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.workspace,
    ),
  updateWorkspace: (id: string, input: { name?: string; description?: string }) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then(
      (data) => data.workspace,
    ),
  deleteWorkspace: (id: string) => request<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),
  members: (id: string) => request<{ members: Member[] }>(`/api/workspaces/${id}/members`).then((data) => data.members),
  updateMember: (workspaceId: string, userId: string, role: Role) =>
    request<{ members: Member[] }>(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }).then((data) => data.members),
  removeMember: (workspaceId: string, userId: string) =>
    request<void>(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
  invites: (id: string) => request<{ invites: Invite[] }>(`/api/workspaces/${id}/invites`).then((data) => data.invites),
  invite: (id: string, input: { email: string; role: 'admin' | 'member' }) =>
    request<{ kind: 'member' | 'invite'; email: string; role: string; url?: string; invite?: Invite }>(
      `/api/workspaces/${id}/invites`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  revokeInvite: (workspaceId: string, inviteId: string) =>
    request<void>(`/api/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' }),
  previewInvite: (token: string) => request<{ invite: InvitePreview }>(`/api/invites/${token}`).then((data) => data.invite),
  acceptInvite: (token: string) => request<{ workspaceId: string; role: Role }>(`/api/invites/${token}/accept`, { method: 'POST' }),

  labels: (workspaceId: string) => request<{ labels: Label[] }>(`/api/workspaces/${workspaceId}/labels`).then((data) => data.labels),
  createLabel: (workspaceId: string, input: { name: string; color: string }) =>
    request<{ label: Label }>(`/api/workspaces/${workspaceId}/labels`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.label,
    ),
  updateLabel: (workspaceId: string, labelId: string, input: { name?: string; color?: string }) =>
    request<{ label: Label }>(`/api/workspaces/${workspaceId}/labels/${labelId}`, { method: 'PATCH', body: JSON.stringify(input) }).then(
      (data) => data.label,
    ),
  deleteLabel: (workspaceId: string, labelId: string) =>
    request<void>(`/api/workspaces/${workspaceId}/labels/${labelId}`, { method: 'DELETE' }),

  roadmap: (workspaceId: string) =>
    request<{ milestones: RoadmapMilestone[] }>(`/api/workspaces/${workspaceId}/roadmap`).then((data) => data.milestones),
  projects: (workspaceId: string) =>
    request<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`).then((data) => data.projects),
  project: (id: string) => request<{ project: Project }>(`/api/projects/${id}`).then((data) => data.project),
  createProject: (workspaceId: string, input: { name: string; key: string; description?: string; color?: string }) =>
    request<{ project: Project }>(`/api/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((data) => data.project),
  updateProject: (id: string, input: { name?: string; description?: string; archived?: boolean; color?: string }) =>
    request<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((data) => data.project),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  templates: (projectId: string) =>
    request<{ templates: IssueTemplate[] }>(`/api/projects/${projectId}/templates`).then((data) => data.templates),
  createTemplate: (
    projectId: string,
    input: {
      name: string;
      title?: string;
      description?: string;
      status?: IssueStatus;
      priority?: Priority;
      estimate?: number | null;
      labelIds?: string[];
      checklist?: string[];
    },
  ) =>
    request<{ template: IssueTemplate }>(`/api/projects/${projectId}/templates`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.template,
    ),
  deleteTemplate: (projectId: string, templateId: string) =>
    request<void>(`/api/projects/${projectId}/templates/${templateId}`, { method: 'DELETE' }),
  views: (projectId: string) => request<{ views: SavedView[] }>(`/api/projects/${projectId}/views`).then((data) => data.views),
  createView: (projectId: string, input: { name: string; shared: boolean; filters: ViewFilters }) =>
    request<{ view: SavedView }>(`/api/projects/${projectId}/views`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.view,
    ),
  deleteView: (projectId: string, viewId: string) => request<void>(`/api/projects/${projectId}/views/${viewId}`, { method: 'DELETE' }),
  cycles: (projectId: string) => request<{ cycles: Cycle[] }>(`/api/projects/${projectId}/cycles`).then((data) => data.cycles),
  startCycle: (projectId: string, input: { name: string; startsAt: string; endsAt: string; carryOpen?: boolean; capacity?: number | null }) =>
    request<{ cycle: Cycle }>(`/api/projects/${projectId}/cycles`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.cycle,
    ),
  endCycle: (projectId: string) =>
    request<{ cycle: Cycle }>(`/api/projects/${projectId}/cycles/end`, { method: 'POST' }).then((data) => data.cycle),
  updateCycle: (projectId: string, cycleId: string, input: { name?: string; startsAt?: string; endsAt?: string; capacity?: number | null }) =>
    request<{ cycle: Cycle }>(`/api/projects/${projectId}/cycles/${cycleId}`, { method: 'PATCH', body: JSON.stringify(input) }).then(
      (data) => data.cycle,
    ),
  milestones: (projectId: string) =>
    request<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`).then((data) => data.milestones),
  createMilestone: (projectId: string, input: { name: string; targetDate?: string | null }) =>
    request<{ milestone: Milestone }>(`/api/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.milestone,
    ),
  updateMilestone: (projectId: string, milestoneId: string, input: { name?: string; targetDate?: string | null }) =>
    request<{ milestone: Milestone }>(`/api/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }).then((data) => data.milestone),
  deleteMilestone: (projectId: string, milestoneId: string) =>
    request<void>(`/api/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' }),

  issues: (projectId: string, params: URLSearchParams) =>
    request<IssueList>(`/api/projects/${projectId}/issues?${params.toString()}`),
  exportIssues: async (projectId: string, params: URLSearchParams) => {
    const response = await fetch(`${base}/api/projects/${projectId}/issues/export?${params.toString()}`, { credentials: 'include' });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
      throw new ApiError(response.status, data?.error?.message || 'Request failed', data?.error?.code);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'issues.csv';
    return {
      blob: await response.blob(),
      filename,
      total: Number(response.headers.get('X-Export-Total') ?? '0'),
      count: Number(response.headers.get('X-Export-Count') ?? '0'),
    };
  },
  issue: (id: string) => request<{ issue: Issue }>(`/api/issues/${id}`).then((data) => data.issue),
  createIssue: (projectId: string, input: IssueInput) =>
    request<{ issue: Issue }>(`/api/projects/${projectId}/issues`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.issue,
    ),
  updateIssue: (id: string, input: Partial<IssueInput>) =>
    request<{ issue: Issue }>(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((data) => data.issue),
  bulkUpdateIssues: (input: {
    issueIds: string[];
    status?: IssueStatus;
    priority?: Priority;
    assigneeId?: string | null;
    dueDate?: string | null;
    cycleId?: string | null;
    milestoneId?: string | null;
  }) =>
    request<{ issues: Issue[] }>('/api/issues/bulk', { method: 'POST', body: JSON.stringify(input) }).then((data) => data.issues),
  deleteIssue: (id: string) => request<void>(`/api/issues/${id}`, { method: 'DELETE' }),
  snoozeIssue: (id: string, until: string) =>
    request<{ issue: Issue }>(`/api/issues/${id}/snooze`, { method: 'POST', body: JSON.stringify({ until }) }).then((data) => data.issue),
  unsnoozeIssue: (id: string) =>
    request<{ issue: Issue }>(`/api/issues/${id}/snooze`, { method: 'DELETE' }).then((data) => data.issue),
  duplicateIssue: (id: string) =>
    request<{ issue: Issue }>(`/api/issues/${id}/duplicate`, { method: 'POST' }).then((data) => data.issue),
  addBlocker: (issueId: string, blockerId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/blockers`, { method: 'POST', body: JSON.stringify({ blockerId }) }).then(
      (data) => data.issue,
    ),
  removeBlocker: (issueId: string, blockerId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/blockers/${blockerId}`, { method: 'DELETE' }).then((data) => data.issue),
  addRelated: (issueId: string, relatedId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/related`, { method: 'POST', body: JSON.stringify({ issueId: relatedId }) }).then(
      (data) => data.issue,
    ),
  removeRelated: (issueId: string, relatedId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/related/${relatedId}`, { method: 'DELETE' }).then((data) => data.issue),
  watchIssue: (issueId: string, watching: boolean) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/watch`, { method: watching ? 'POST' : 'DELETE' }).then((data) => data.issue),
  addChecklistItem: (issueId: string, text: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/checklist`, { method: 'POST', body: JSON.stringify({ text }) }).then(
      (data) => data.issue,
    ),
  updateChecklistItem: (issueId: string, itemId: string, input: { text?: string; done?: boolean }) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify(input) }).then(
      (data) => data.issue,
    ),
  deleteChecklistItem: (issueId: string, itemId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/checklist/${itemId}`, { method: 'DELETE' }).then((data) => data.issue),
  favorites: (workspaceId: string) =>
    request<{ favorites: Favorite[] }>(`/api/workspaces/${workspaceId}/favorites`).then((data) => data.favorites),
  addFavorite: (workspaceId: string, input: { kind: 'project' | 'issue'; targetId: string }) =>
    request<{ favorites: Favorite[] }>(`/api/workspaces/${workspaceId}/favorites`, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((data) => data.favorites),
  removeFavorite: (workspaceId: string, kind: 'project' | 'issue', targetId: string) =>
    request<{ favorites: Favorite[] }>(`/api/workspaces/${workspaceId}/favorites/${kind}/${targetId}`, { method: 'DELETE' }).then(
      (data) => data.favorites,
    ),
  recent: (workspaceId: string) =>
    request<{ recent: RecentIssue[] }>(`/api/workspaces/${workspaceId}/recent`).then((data) => data.recent),
  recordRecent: (workspaceId: string, issueId: string) =>
    request<{ recent: RecentIssue[] }>(`/api/workspaces/${workspaceId}/recent`, {
      method: 'POST',
      body: JSON.stringify({ issueId }),
    }).then((data) => data.recent),
  search: (workspaceId: string, q: string) =>
    request<{ issues: Issue[] }>(`/api/workspaces/${workspaceId}/search?q=${encodeURIComponent(q)}`).then((data) => data.issues),
  resolveIssueKeys: (workspaceId: string, keys: string[]) =>
    request<{ issues: { key: string; id: string; title: string }[] }>(`/api/workspaces/${workspaceId}/issue-keys`, {
      method: 'POST',
      body: JSON.stringify({ keys }),
    }).then((data) => data.issues),

  comments: (issueId: string) => request<{ comments: Comment[] }>(`/api/issues/${issueId}/comments`).then((data) => data.comments),
  addComment: (issueId: string, body: string) =>
    request<{ comment: Comment }>(`/api/issues/${issueId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }).then(
      (data) => data.comment,
    ),
  updateComment: (id: string, body: string) =>
    request<{ comment: Comment }>(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }).then((data) => data.comment),
  pinComment: (id: string, pinned: boolean) =>
    request<{ comment: Comment }>(`/api/comments/${id}/pin`, { method: 'POST', body: JSON.stringify({ pinned }) }).then((data) => data.comment),
  toggleReaction: (id: string, emoji: Reaction) =>
    request<{ comment: Comment }>(`/api/comments/${id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }).then(
      (data) => data.comment,
    ),
  deleteComment: (id: string) => request<void>(`/api/comments/${id}`, { method: 'DELETE' }),

  activity: (path: string, page = 1, projectId?: string, kind?: string) =>
    request<ActivityList>(`${path}?page=${page}&limit=20${projectId ? `&project=${projectId}` : ''}${kind ? `&kind=${kind}` : ''}`),
  analytics: (path: string) => request<{ analytics: Analytics }>(path).then((data) => data.analytics),
  notifications: () => request<{ notifications: Notification[]; unread: number }>('/api/notifications'),
  notificationPreferences: () =>
    request<{ preferences: NotificationPreferences }>('/api/notifications/preferences').then((data) => data.preferences),
  updateNotificationPreferences: (input: Partial<NotificationPreferences>) =>
    request<{ preferences: NotificationPreferences }>('/api/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }).then((data) => data.preferences),
  markRead: (id: string) => request<void>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<void>('/api/notifications/read-all', { method: 'POST' }),
};
