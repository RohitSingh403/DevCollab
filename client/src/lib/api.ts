import type {
  ActivityList,
  Analytics,
  Comment,
  Invite,
  InvitePreview,
  Issue,
  IssueList,
  MyWork,
  IssueStatus,
  Label,
  Member,
  Notification,
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

  workspaces: () => request<{ workspaces: Workspace[] }>('/api/workspaces').then((data) => data.workspaces),
  workspace: (id: string) => request<{ workspace: Workspace }>(`/api/workspaces/${id}`).then((data) => data.workspace),
  myWork: (id: string) => request<MyWork>(`/api/workspaces/${id}/my-work`),
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
  deleteLabel: (workspaceId: string, labelId: string) =>
    request<void>(`/api/workspaces/${workspaceId}/labels/${labelId}`, { method: 'DELETE' }),

  projects: (workspaceId: string) =>
    request<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`).then((data) => data.projects),
  project: (id: string) => request<{ project: Project }>(`/api/projects/${id}`).then((data) => data.project),
  createProject: (workspaceId: string, input: { name: string; key: string; description?: string }) =>
    request<{ project: Project }>(`/api/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((data) => data.project),
  updateProject: (id: string, input: { name?: string; description?: string }) =>
    request<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((data) => data.project),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  views: (projectId: string) => request<{ views: SavedView[] }>(`/api/projects/${projectId}/views`).then((data) => data.views),
  createView: (projectId: string, input: { name: string; shared: boolean; filters: ViewFilters }) =>
    request<{ view: SavedView }>(`/api/projects/${projectId}/views`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.view,
    ),
  deleteView: (projectId: string, viewId: string) => request<void>(`/api/projects/${projectId}/views/${viewId}`, { method: 'DELETE' }),

  issues: (projectId: string, params: URLSearchParams) =>
    request<IssueList>(`/api/projects/${projectId}/issues?${params.toString()}`),
  issue: (id: string) => request<{ issue: Issue }>(`/api/issues/${id}`).then((data) => data.issue),
  createIssue: (projectId: string, input: IssueInput) =>
    request<{ issue: Issue }>(`/api/projects/${projectId}/issues`, { method: 'POST', body: JSON.stringify(input) }).then(
      (data) => data.issue,
    ),
  updateIssue: (id: string, input: Partial<IssueInput>) =>
    request<{ issue: Issue }>(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((data) => data.issue),
  deleteIssue: (id: string) => request<void>(`/api/issues/${id}`, { method: 'DELETE' }),
  addBlocker: (issueId: string, blockerId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/blockers`, { method: 'POST', body: JSON.stringify({ blockerId }) }).then(
      (data) => data.issue,
    ),
  removeBlocker: (issueId: string, blockerId: string) =>
    request<{ issue: Issue }>(`/api/issues/${issueId}/blockers/${blockerId}`, { method: 'DELETE' }).then((data) => data.issue),
  search: (workspaceId: string, q: string) =>
    request<{ issues: Issue[] }>(`/api/workspaces/${workspaceId}/search?q=${encodeURIComponent(q)}`).then((data) => data.issues),

  comments: (issueId: string) => request<{ comments: Comment[] }>(`/api/issues/${issueId}/comments`).then((data) => data.comments),
  addComment: (issueId: string, body: string) =>
    request<{ comment: Comment }>(`/api/issues/${issueId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }).then(
      (data) => data.comment,
    ),
  updateComment: (id: string, body: string) =>
    request<{ comment: Comment }>(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }).then((data) => data.comment),
  deleteComment: (id: string) => request<void>(`/api/comments/${id}`, { method: 'DELETE' }),

  activity: (path: string, page = 1) => request<ActivityList>(`${path}?page=${page}&limit=20`),
  analytics: (path: string) => request<{ analytics: Analytics }>(path).then((data) => data.analytics),
  notifications: () => request<{ notifications: Notification[]; unread: number }>('/api/notifications'),
  markRead: (id: string) => request<void>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<void>('/api/notifications/read-all', { method: 'POST' }),
};
