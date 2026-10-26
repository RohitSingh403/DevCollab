import { STATUS_LABEL, type IssueStatus, type Priority, type Role } from './constants';
import { asId } from './utils';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
}

export interface LabelDto {
  id: string;
  name: string;
  color: string;
}

export interface ProjectRef {
  id: string;
  name: string;
  key: string;
}

export interface IssueDto {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  status: IssueStatus;
  statusLabel: string;
  priority: Priority;
  labels: LabelDto[];
  assignees: UserDto[];
  reporter: UserDto;
  project: ProjectRef;
  workspaceId: string;
  dueDate: string | null;
  overdue: boolean;
  commentCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Ref = {
  _id?: unknown;
  name?: string;
  email?: string;
  avatarColor?: string;
  color?: string;
  key?: string;
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function serializeUser(user: Ref): UserDto {
  return {
    id: asId(user),
    name: user.name ?? 'Unknown',
    email: user.email ?? '',
    avatarColor: user.avatarColor ?? '#94a3b8',
  };
}

export function serializeLabel(label: Ref): LabelDto {
  return { id: asId(label), name: label.name ?? '', color: label.color ?? '#94a3b8' };
}

export function serializeProjectRef(project: Ref): ProjectRef {
  return { id: asId(project), name: project.name ?? '', key: project.key ?? '' };
}

export function serializeIssue(issue: {
  _id: unknown;
  number: number;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: Priority;
  labels?: unknown[];
  assignees?: unknown[];
  reporter: unknown;
  project: unknown;
  workspace: unknown;
  dueDate?: Date | string | null;
  commentCount?: number;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): IssueDto {
  const project = serializeProjectRef(issue.project as Ref);
  const dueDate = iso(issue.dueDate);
  const status = issue.status;
  return {
    id: asId(issue),
    number: issue.number,
    key: `${project.key}-${issue.number}`,
    title: issue.title,
    description: issue.description ?? '',
    status,
    statusLabel: STATUS_LABEL[status],
    priority: issue.priority,
    labels: (issue.labels ?? []).map((label) => serializeLabel(label as Ref)),
    assignees: (issue.assignees ?? []).map((user) => serializeUser(user as Ref)),
    reporter: serializeUser(issue.reporter as Ref),
    project,
    workspaceId: asId(issue.workspace),
    dueDate,
    overdue: Boolean(dueDate && status !== 'done' && new Date(dueDate).getTime() < Date.now()),
    commentCount: issue.commentCount ?? 0,
    completedAt: iso(issue.completedAt),
    createdAt: iso(issue.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(issue.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function serializeComment(comment: {
  _id: unknown;
  body: string;
  author: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  editedAt?: Date | string | null;
}) {
  const createdAt = iso(comment.createdAt) ?? new Date(0).toISOString();
  const updatedAt = iso(comment.updatedAt) ?? createdAt;
  return {
    id: asId(comment),
    body: comment.body,
    author: serializeUser(comment.author as Ref),
    createdAt,
    updatedAt,
    edited: Boolean(comment.editedAt),
  };
}

export function serializeActivity(activity: {
  _id: unknown;
  type: string;
  message: string;
  createdAt: Date | string;
  actor: unknown;
  issue?: unknown;
  project?: unknown;
}) {
  return {
    id: asId(activity),
    type: activity.type,
    message: activity.message,
    createdAt: iso(activity.createdAt),
    actor: serializeUser(activity.actor as Ref),
    issueId: activity.issue ? asId(activity.issue) : null,
    projectId: activity.project ? asId(activity.project) : null,
  };
}

export function serializeNotification(notification: {
  _id: unknown;
  type: string;
  message: string;
  link?: string;
  read?: boolean;
  createdAt: Date | string;
  workspace: unknown;
}) {
  return {
    id: asId(notification),
    type: notification.type,
    message: notification.message,
    link: notification.link ?? '',
    read: Boolean(notification.read),
    createdAt: iso(notification.createdAt),
    workspaceId: asId(notification.workspace),
  };
}

export function serializeWorkspace(
  workspace: { _id: unknown; name: string; slug: string; description?: string; createdAt: Date | string; updatedAt: Date | string },
  extra: { role: Role; memberCount?: number; projectCount?: number; openIssueCount?: number },
) {
  return {
    id: asId(workspace),
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description ?? '',
    role: extra.role,
    memberCount: extra.memberCount ?? 0,
    projectCount: extra.projectCount ?? 0,
    openIssueCount: extra.openIssueCount ?? 0,
    createdAt: iso(workspace.createdAt),
    updatedAt: iso(workspace.updatedAt),
  };
}
