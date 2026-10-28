import type { FilterQuery } from 'mongoose';
import {
  PRIORITY_LABEL,
  PRIORITY_RANK,
  STATUS_LABEL,
  roleRank,
  type IssueStatus,
  type Priority,
} from '../constants';
import { ApiError } from '../errors';
import { Comment } from '../models/Comment';
import { Issue } from '../models/Issue';
import { Label } from '../models/Label';
import { Project } from '../models/Project';
import type { Realtime } from '../realtime';
import { serializeComment, serializeIssue } from '../serializers';
import { escapeRegex, pageMeta } from '../utils';
import { recordActivity } from './activity';
import { assertWorkspaceMembers, membershipFor } from './membership';
import { mentionedUserIds, workspaceMembers } from './mentions';
import { notifyUsers } from './notifications';

const ISSUE_POPULATE = [
  { path: 'assignees', select: 'name email avatarColor' },
  { path: 'reporter', select: 'name email avatarColor' },
  { path: 'labels', select: 'name color' },
  { path: 'project', select: 'name key' },
];

async function loadIssue(id: string) {
  const issue = await Issue.findById(id).populate(ISSUE_POPULATE);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  return issue;
}

async function assertLabels(workspaceId: string, labelIds: string[]) {
  const unique = [...new Set(labelIds)];
  if (!unique.length) return unique;
  const count = await Label.countDocuments({ workspace: workspaceId, _id: { $in: unique } });
  if (count !== unique.length) throw new ApiError(400, 'Labels must belong to this workspace', 'invalid_labels');
  return unique;
}

function sameSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}

export async function listIssues(input: {
  projectId: string;
  status?: IssueStatus;
  priority?: Priority;
  assignee?: string;
  label?: string;
  q?: string;
  overdue?: 'true' | 'false';
  page: number;
  limit: number;
  sort: 'updated' | 'created' | 'due' | 'priority';
}) {
  const filter: FilterQuery<unknown> = { project: input.projectId };
  if (input.status) filter.status = input.status;
  if (input.priority) filter.priority = input.priority;
  if (input.assignee) filter.assignees = input.assignee;
  if (input.label) filter.labels = input.label;
  if (input.q) filter.title = { $regex: escapeRegex(input.q), $options: 'i' };
  if (input.overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    if (!input.status) filter.status = { $ne: 'done' };
  }

  const sort: Record<string, 1 | -1> =
    input.sort === 'created'
      ? { createdAt: -1 }
      : input.sort === 'due'
        ? { dueDate: 1 }
        : input.sort === 'priority'
          ? { priorityRank: -1, updatedAt: -1 }
          : { updatedAt: -1 };

  const [total, issues] = await Promise.all([
    Issue.countDocuments(filter),
    Issue.find(filter)
      .sort(sort)
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .populate(ISSUE_POPULATE),
  ]);

  return { issues: issues.map((issue) => serializeIssue(issue)), ...pageMeta(input.page, input.limit, total) };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function workBucket(dueDate: Date | null, now: Date) {
  if (!dueDate) return 'undated' as const;
  if (dueDate.getTime() < now.getTime()) return 'overdue' as const;
  if (dueDate.getTime() < now.getTime() + WEEK_MS) return 'dueSoon' as const;
  return 'later' as const;
}

export async function listMyWork(workspaceId: string, userId: string, now = new Date()) {
  const issues = await Issue.find({
    workspace: workspaceId,
    assignees: userId,
    status: { $ne: 'done' },
  }).populate(ISSUE_POPULATE);

  const groups = {
    overdue: [] as typeof issues,
    dueSoon: [] as typeof issues,
    later: [] as typeof issues,
    undated: [] as typeof issues,
  };
  for (const issue of issues) {
    groups[workBucket(issue.dueDate ?? null, now)].push(issue);
  }
  const byDue = (left: { dueDate?: Date | null }, right: { dueDate?: Date | null }) =>
    (left.dueDate?.getTime() ?? 0) - (right.dueDate?.getTime() ?? 0);
  groups.overdue.sort(byDue);
  groups.dueSoon.sort(byDue);
  groups.later.sort(byDue);
  groups.undated.sort((left, right) => right.priorityRank - left.priorityRank || right.updatedAt.getTime() - left.updatedAt.getTime());

  const sections = [
    { id: 'overdue', label: 'Overdue', issues: groups.overdue },
    { id: 'dueSoon', label: 'Due this week', issues: groups.dueSoon },
    { id: 'later', label: 'Due later', issues: groups.later },
    { id: 'undated', label: 'No due date', issues: groups.undated },
  ] as const;

  return {
    total: issues.length,
    counts: {
      overdue: groups.overdue.length,
      dueSoon: groups.dueSoon.length,
      later: groups.later.length,
      undated: groups.undated.length,
    },
    groups: sections.map((section) => ({
      id: section.id,
      label: section.label,
      issues: section.issues.map((issue) => serializeIssue(issue)),
    })),
  };
}

export async function searchWorkspaceIssues(workspaceId: string, q: string) {
  const issues = await Issue.find({
    workspace: workspaceId,
    title: { $regex: escapeRegex(q), $options: 'i' },
  })
    .sort({ updatedAt: -1 })
    .limit(8)
    .populate(ISSUE_POPULATE);
  return issues.map((issue) => serializeIssue(issue));
}

export async function getIssue(issueId: string) {
  const issue = await loadIssue(issueId);
  return serializeIssue(issue);
}

export async function createIssue(
  input: {
    projectId: string;
    actor: { id: string; name: string };
    title: string;
    description: string;
    status: IssueStatus;
    priority: Priority;
    assigneeIds: string[];
    labelIds: string[];
    dueDate?: string | null;
  },
  rt?: Realtime,
) {
  const project = await Project.findById(input.projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const workspaceId = String(project.workspace);
  const assigneeIds = await assertWorkspaceMembers(workspaceId, input.assigneeIds);
  const labelIds = await assertLabels(workspaceId, input.labelIds);
  const numbered = await Project.findOneAndUpdate({ _id: project._id }, { $inc: { nextIssueNumber: 1 } }, { new: true });
  if (!numbered) throw new ApiError(404, 'Project not found', 'not_found');

  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const issue = await Issue.create({
    workspace: workspaceId,
    project: project._id,
    number: numbered.nextIssueNumber,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    priorityRank: PRIORITY_RANK[input.priority],
    assignees: assigneeIds,
    labels: labelIds,
    reporter: input.actor.id,
    dueDate,
    completedAt: input.status === 'done' ? new Date() : null,
  });

  const dto = serializeIssue(await loadIssue(String(issue._id)));
  const message = `${input.actor.name} opened ${dto.key} ${dto.title}`;
  await recordActivity(
    {
      workspaceId,
      projectId: String(project._id),
      issueId: dto.id,
      actorId: input.actor.id,
      type: 'issue.created',
      message,
    },
    rt,
  );
  await notifyUsers(
    {
      userIds: assigneeIds,
      workspaceId,
      actorId: input.actor.id,
      type: 'issue.assigned',
      message: `${input.actor.name} assigned you to ${dto.key}`,
      link: `/w/${workspaceId}/issues/${dto.id}`,
    },
    rt,
  );
  rt?.toWorkspace(workspaceId, 'issue:created', { issueId: dto.id, projectId: String(project._id) });
  return dto;
}

export async function updateIssue(
  input: {
    issueId: string;
    actor: { id: string; name: string };
    title?: string;
    description?: string;
    status?: IssueStatus;
    priority?: Priority;
    assigneeIds?: string[];
    labelIds?: string[];
    dueDate?: string | null;
  },
  rt?: Realtime,
) {
  const issue = await Issue.findById(input.issueId);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const workspaceId = String(issue.workspace);
  const parts: string[] = [];

  if (input.title !== undefined && input.title !== issue.title) {
    issue.title = input.title;
    parts.push('title');
  }
  if (input.description !== undefined && input.description !== issue.description) {
    issue.description = input.description;
    parts.push('description');
  }
  if (input.status && input.status !== issue.status) {
    if (input.status === 'done' && issue.status !== 'done') issue.completedAt = new Date();
    if (input.status !== 'done' && issue.status === 'done') issue.completedAt = null;
    parts.push(`status to ${STATUS_LABEL[input.status]}`);
    issue.status = input.status;
  }
  if (input.priority && input.priority !== issue.priority) {
    issue.priority = input.priority;
    issue.priorityRank = PRIORITY_RANK[input.priority];
    parts.push(`priority to ${PRIORITY_LABEL[input.priority]}`);
  }
  if (input.dueDate !== undefined) {
    const next = input.dueDate ? new Date(input.dueDate).toISOString() : null;
    const current = issue.dueDate ? issue.dueDate.toISOString() : null;
    if (next !== current) {
      issue.dueDate = next ? new Date(next) : null;
      parts.push('due date');
    }
  }

  let addedAssignees: string[] = [];
  if (input.assigneeIds) {
    const next = await assertWorkspaceMembers(workspaceId, input.assigneeIds);
    const current = issue.assignees.map((id) => String(id));
    if (!sameSet(current, next)) {
      addedAssignees = next.filter((id) => !current.includes(id));
      issue.assignees = next as unknown as typeof issue.assignees;
      parts.push('assignees');
    }
  }
  if (input.labelIds) {
    const next = await assertLabels(workspaceId, input.labelIds);
    const current = issue.labels.map((id) => String(id));
    if (!sameSet(current, next)) {
      issue.labels = next as unknown as typeof issue.labels;
      parts.push('labels');
    }
  }

  if (!parts.length) return serializeIssue(await loadIssue(String(issue._id)));

  await issue.save();
  const dto = serializeIssue(await loadIssue(String(issue._id)));
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: dto.id,
      actorId: input.actor.id,
      type: 'issue.updated',
      message: `${input.actor.name} updated ${dto.key}: ${parts.join(', ')}`,
    },
    rt,
  );
  if (addedAssignees.length) {
    await notifyUsers(
      {
        userIds: addedAssignees,
        workspaceId,
        actorId: input.actor.id,
        type: 'issue.assigned',
        message: `${input.actor.name} assigned you to ${dto.key}`,
        link: `/w/${workspaceId}/issues/${dto.id}`,
      },
      rt,
    );
  }
  rt?.toWorkspace(workspaceId, 'issue:updated', { issueId: dto.id, projectId: String(issue.project) });
  return dto;
}

export async function deleteIssue(issueId: string, actor: { id: string; name: string }, role: 'owner' | 'admin' | 'member', rt?: Realtime) {
  const issue = await Issue.findById(issueId).populate('project', 'key');
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const isReporter = String(issue.reporter) === actor.id;
  if (!isReporter && roleRank(role) < roleRank('admin')) {
    throw new ApiError(403, 'You do not have permission to delete this issue', 'forbidden');
  }
  const project = issue.project as unknown as { key?: string; _id?: unknown };
  const key = `${project.key ?? 'ISSUE'}-${issue.number}`;
  const workspaceId = String(issue.workspace);
  const projectId = String(project._id ?? issue.project);
  await Comment.deleteMany({ issue: issue._id });
  await issue.deleteOne();
  await recordActivity(
    {
      workspaceId,
      projectId,
      issueId: null,
      actorId: actor.id,
      type: 'issue.deleted',
      message: `${actor.name} deleted ${key} ${issue.title}`,
    },
    rt,
  );
  rt?.toWorkspace(workspaceId, 'issue:deleted', { issueId, projectId });
}

export async function listComments(issueId: string) {
  const comments = await Comment.find({ issue: issueId }).sort({ createdAt: 1 }).populate('author', 'name email avatarColor');
  return comments.map((comment) => serializeComment(comment));
}

export async function addComment(
  input: { issueId: string; actor: { id: string; name: string }; body: string },
  rt?: Realtime,
) {
  const issue = await Issue.findById(input.issueId);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const comment = await Comment.create({
    issue: issue._id,
    project: issue.project,
    workspace: issue.workspace,
    author: input.actor.id,
    body: input.body,
  });
  await Issue.updateOne({ _id: issue._id }, { $inc: { commentCount: 1 }, $set: { updatedAt: new Date() } });
  const populated = await comment.populate('author', 'name email avatarColor');
  const dto = serializeComment(populated);
  const project = await Project.findById(issue.project).select('key');
  const key = `${project?.key ?? 'ISSUE'}-${issue.number}`;
  const workspaceId = String(issue.workspace);
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: String(issue._id),
      actorId: input.actor.id,
      type: 'comment.created',
      message: `${input.actor.name} commented on ${key}`,
    },
    rt,
  );
  await notifyComment({
    issue,
    actor: input.actor,
    key,
    body: input.body,
    previousBody: '',
    includeWatchers: true,
    rt,
  });
  rt?.toWorkspace(workspaceId, 'comment:created', { issueId: String(issue._id), commentId: dto.id });
  return dto;
}

export async function updateComment(
  commentId: string,
  actor: { id: string; name: string },
  body: string,
  rt?: Realtime,
) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found', 'not_found');
  await membershipFor(actor.id, String(comment.workspace));
  if (String(comment.author) !== actor.id) {
    throw new ApiError(403, 'You can only edit your own comments', 'forbidden');
  }
  const previousBody = comment.body;
  comment.body = body;
  comment.editedAt = new Date();
  await comment.save();
  const issue = await Issue.findById(comment.issue).select('key workspace project reporter assignees number');
  if (issue) {
    const project = await Project.findById(issue.project).select('key');
    await notifyComment({
      issue,
      actor,
      key: `${project?.key ?? 'ISSUE'}-${issue.number}`,
      body,
      previousBody,
      includeWatchers: false,
      rt,
    });
    rt?.toWorkspace(String(issue.workspace), 'comment:updated', {
      issueId: String(issue._id),
      commentId: String(comment._id),
    });
  }
  const populated = await comment.populate('author', 'name email avatarColor');
  return serializeComment(populated);
}

async function notifyComment({
  issue,
  actor,
  key,
  body,
  previousBody,
  includeWatchers,
  rt,
}: {
  issue: { _id: unknown; workspace: unknown; reporter?: unknown; assignees?: unknown[] };
  actor: { id: string; name: string };
  key: string;
  body: string;
  previousBody: string;
  includeWatchers: boolean;
  rt?: Realtime;
}) {
  const workspaceId = String(issue.workspace);
  const members = await workspaceMembers(workspaceId);
  const mentioned = mentionedUserIds(body, members);
  const already = new Set(mentionedUserIds(previousBody, members));
  const freshMentions = mentioned.filter((id) => !already.has(id));
  const mentionedNow = new Set(freshMentions);
  const link = `/w/${workspaceId}/issues/${String(issue._id)}`;
  if (includeWatchers) {
    const watchers = [issue.reporter, ...(issue.assignees ?? [])]
      .map((id) => String(id))
      .filter((id) => !mentionedNow.has(id));
    await notifyUsers(
      {
        userIds: watchers,
        workspaceId,
        actorId: actor.id,
        type: 'comment.created',
        message: `${actor.name} commented on ${key}`,
        link,
      },
      rt,
    );
  }
  await notifyUsers(
    {
      userIds: freshMentions,
      workspaceId,
      actorId: actor.id,
      type: 'comment.mentioned',
      message: `${actor.name} mentioned you on ${key}`,
      link,
    },
    rt,
  );
}

export async function deleteComment(
  commentId: string,
  actor: { id: string; name: string },
  rt?: Realtime,
) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found', 'not_found');
  const membership = await membershipFor(actor.id, String(comment.workspace));
  const isAuthor = String(comment.author) === actor.id;
  if (!isAuthor && roleRank(membership.role) < roleRank('admin')) {
    throw new ApiError(403, 'You do not have permission to delete this comment', 'forbidden');
  }
  const issueId = String(comment.issue);
  await comment.deleteOne();
  await Issue.updateOne({ _id: issueId }, { $inc: { commentCount: -1 } });
  await Issue.updateOne({ _id: issueId, commentCount: { $lt: 0 } }, { $set: { commentCount: 0 } });
  rt?.toWorkspace(String(comment.workspace), 'comment:deleted', { issueId, commentId });
}
