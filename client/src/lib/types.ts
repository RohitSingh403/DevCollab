export const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export type IssueStatus = (typeof STATUSES)[number];

export const ESTIMATES = [1, 2, 3, 5, 8] as const;
export type Estimate = (typeof ESTIMATES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REACTIONS = ['+1', 'eyes', 'tada', 'check', 'heart'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_GLYPH: Record<Reaction, string> = {
  '+1': '👍',
  eyes: '👀',
  tada: '🎉',
  check: '✅',
  heart: '❤️',
};

export const REACTION_LABEL: Record<Reaction, string> = {
  '+1': 'thumbs up',
  eyes: 'eyes',
  tada: 'celebrate',
  check: 'check',
  heart: 'heart',
};

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

export interface ViewFilters {
  status: string;
  priority: string;
  assignee: string;
  overdue: boolean;
  quiet: boolean;
  dueSoon: boolean;
  blocked: boolean;
  unestimated: boolean;
  q: string;
  layout: 'board' | 'list';
  label: string;
  sort: 'updated' | 'created' | 'due' | 'priority';
}

export interface IssueTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  estimate: number | null;
  labels: Label[];
  checklist: string[];
  mine: boolean;
  canDelete: boolean;
  createdBy: { id: string; name: string };
}

export interface SavedView {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  canDelete: boolean;
  createdBy: { id: string; name: string };
  filters: ViewFilters;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string;
  archived: boolean;
  archivedAt: string | null;
  issueCount: number;
  openIssueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Favorite {
  id: string;
  kind: 'project' | 'issue';
  targetId: string;
  label: string;
  hint: string;
}

export interface RecentIssue {
  id: string;
  issueId: string;
  key: string;
  title: string;
  projectId: string;
  projectName: string;
}

export interface RoadmapMilestone {
  id: string;
  name: string;
  targetDate: string | null;
  total: number;
  done: number;
  state: 'overdue' | 'upcoming' | 'undated' | 'complete';
  project: { id: string; name: string; key: string };
}

export interface Milestone {
  id: string;
  name: string;
  targetDate: string | null;
  total: number;
  done: number;
  canDelete: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface IssueLink {
  id: string;
  key: string;
  title: string;
  status: IssueStatus;
  statusLabel: string;
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
  estimate: number | null;
  labels: Label[];
  assignees: User[];
  reporter: User;
  watchers?: User[];
  watching?: boolean;
  snoozedUntil?: string | null;
  project: { id: string; name: string; key: string };
  workspaceId: string;
  dueDate: string | null;
  overdue: boolean;
  commentCount: number;
  blocked: boolean;
  checklist: ChecklistItem[];
  cycle: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  blockedBy?: IssueLink[];
  blocking?: IssueLink[];
  related?: IssueLink[];
  parent?: IssueLink | null;
  children?: IssueLink[];
  subissues?: { total: number; done: number };
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyWorkGroup {
  id: 'overdue' | 'dueSoon' | 'later' | 'undated';
  label: string;
  issues: Issue[];
}

export interface UnassignedWork {
  total: number;
  issues: Issue[];
}

export interface UnestimatedWork {
  total: number;
  issues: Issue[];
}

export interface QuietWork {
  total: number;
  days: number;
  issues: Issue[];
}

export interface DueWork {
  total: number;
  days: number;
  issues: Issue[];
}

export interface BlockedWork {
  total: number;
  issues: Issue[];
}

export interface WorkloadPerson {
  user: User;
  open: number;
  overdue: number;
  blocked: number;
  points: number;
  issues: Issue[];
}

export interface Workload {
  people: WorkloadPerson[];
}

export interface MyWork {
  total: number;
  counts: { overdue: number; dueSoon: number; later: number; undated: number };
  groups: MyWorkGroup[];
  snoozed: { until: string; issue: Issue }[];
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
  pinned: boolean;
  reactions: { emoji: Reaction; count: number; mine: boolean }[];
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

export interface Cycle {
  id: string;
  name: string;
  status: 'active' | 'completed';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  total: number;
  done: number;
  points: number;
  pointsDone: number;
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
  cycle: Cycle | null;
}

export interface InvitePreview {
  email: string;
  role: Role;
  workspaceName: string;
  workspaceId: string;
  expired: boolean;
  accepted: boolean;
}
