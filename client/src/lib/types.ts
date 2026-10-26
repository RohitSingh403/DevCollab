export const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

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

export const LABEL_COLORS = ['#b42318', '#b54708', '#175cd3', '#0e7c66', '#6941c6', '#363f72', '#c4320a', '#067647'];

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  role: Role;
  memberCount: number;
  projectCount: number;
  openIssueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string;
  issueCount: number;
  openIssueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Issue {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  status: IssueStatus;
  statusLabel: string;
  priority: Priority;
  labels: Label[];
  assignees: User[];
  reporter: User;
  project: { id: string; name: string; key: string };
  workspaceId: string;
  dueDate: string | null;
  overdue: boolean;
  commentCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueList {
  issues: Issue[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Comment {
  id: string;
  body: string;
  author: User;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  actor: User;
  issueId: string | null;
  projectId: string | null;
}

export interface ActivityList {
  activities: Activity[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
  workspaceId: string;
}

export interface Member {
  id: string;
  role: Role;
  createdAt: string;
  user: User;
}

export interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  expiresAt: string;
  createdAt: string;
}

export interface Analytics {
  totals: {
    issues: number;
    open: number;
    inProgress: number;
    inReview: number;
    done: number;
    overdue: number;
    completedThisWeek: number;
  };
  byStatus: { status: IssueStatus; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  activityByDay: { date: string; count: number }[];
  assigneeLoad: { count: number; user: User }[];
}

export interface InvitePreview {
  email: string;
  role: Role;
  workspaceName: string;
  workspaceId: string;
  expired: boolean;
  accepted: boolean;
}
