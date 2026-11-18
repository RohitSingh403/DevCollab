import type { FilterQuery } from 'mongoose';
import {
  PRIORITY_LABEL,
  PRIORITY_RANK,
  STATUS_LABEL,
  roleRank,
  type IssueStatus,
  type Priority,
  type Reaction,
} from '../constants';
import { dayKey, utcDayStart } from '../dates';
import { ApiError } from '../errors';
import { Comment } from '../models/Comment';
import { Issue } from '../models/Issue';
import { Label } from '../models/Label';
import { Membership } from '../models/Membership';
import { Project } from '../models/Project';
import { archivedProjectIds } from './projects';
import type { Realtime } from '../realtime';
import { serializeComment, serializeIssue, serializeReactions, serializeUser } from '../serializers';
import { escapeRegex, pageMeta } from '../utils';
import { recordActivity } from './activity';
import { clearTargetFavorites } from './favorites';
import { activeSnoozes, clearIssueSnoozes, snoozedUntil } from './snooze';
import { clearBlockerRefs, relationsFor, syncDependents, toLink } from './blockers';
import { clearRelatedRefs, relatedFor } from './related';
import { activeCycleId, assertProjectCycle } from './cycles';
import { assertProjectMilestone } from './milestones';
import { assertWorkspaceMembers, membershipFor } from './membership';
import { mentionedUserIds, workspaceMembers } from './mentions';
import { notifyUsers } from './notifications';
import { assertParentIssue, detachChildren, familyFor, withSubissueCounts } from './subissues';
import { notifyAudience } from './watchers';

const ISSUE_POPULATE = [
  { path: 'assignees', select: 'name email avatarColor' },
  { path: 'reporter', select: 'name email avatarColor' },
  { path: 'labels', select: 'name color' },
  { path: 'project', select: 'name key' },
  { path: 'cycle', select: 'name' },
  { path: 'milestone', select: 'name' },
];

async function loadIssue(id: string) {
  const issue = await Issue.findById(id).populate(ISSUE_POPULATE);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  return issue;
}

export async function assertLabels(workspaceId: string, labelIds: string[]) {
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
  quiet?: 'true' | 'false';
  dueSoon?: 'true' | 'false';
  blocked?: 'true' | 'false';
  page: number;
  limit: number;
  sort: 'updated' | 'created' | 'due' | 'priority';
  cycle?: string;
  milestone?: string;
}) {
  const filter: FilterQuery<unknown> = { project: input.projectId };
  if (input.cycle === 'active') {
    const cycleId = await activeCycleId(input.projectId);
    if (!cycleId) return { issues: [], ...pageMeta(input.page, input.limit, 0) };
    filter.cycle = cycleId;
  } else if (input.cycle) {
    filter.cycle = input.cycle;
  }
  if (input.milestone) filter.milestone = input.milestone;
  if (input.status) filter.status = input.status;
  if (input.priority) filter.priority = input.priority;
  if (input.assignee === 'none') filter.assignees = { $size: 0 };
  else if (input.assignee) filter.assignees = input.assignee;
  if (input.label) filter.labels = input.label;
  if (input.q) filter.title = { $regex: escapeRegex(input.q), $options: 'i' };
  if (input.overdue === 'true') {
    filter.dueDate = { $lt: utcDayStart(new Date()) };
    if (!input.status) filter.status = { $ne: 'done' };
  }
  if (input.quiet === 'true') {
    filter.updatedAt = { $lt: new Date(Date.now() - WEEK_MS) };
    if (!input.status && input.overdue !== 'true') filter.status = { $ne: 'done' };
  }
  if (input.dueSoon === 'true' && input.overdue !== 'true') {
    filter.dueDate = { $lt: dueHorizon(new Date(), 7) };
    if (!input.status) filter.status = { $ne: 'done' };
  }
  if (input.blocked === 'true') {
    filter.blocked = true;
    if (!input.status && !filter.status) filter.status = { $ne: 'done' };
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

  return { issues: await withSubissueCounts(issues, serializeIssue), ...pageMeta(input.page, input.limit, total) };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function dueHorizon(now: Date, days: number) {
  return new Date(utcDayStart(now).getTime() + (days + 1) * DAY_MS);
}

export function workBucket(dueDate: Date | null, now: Date) {
  if (!dueDate) return 'undated' as const;
  if (dueDate.getTime() < utcDayStart(now).getTime()) return 'overdue' as const;
  if (dueDate.getTime() < now.getTime() + WEEK_MS) return 'dueSoon' as const;
  return 'later' as const;
}

export async function listUnassigned(workspaceId: string) {
  const archived = await archivedProjectIds(workspaceId);
  const filter: FilterQuery<unknown> = {
    workspace: workspaceId,
    status: { $ne: 'done' },
    assignees: { $size: 0 },
    ...(archived.length ? { project: { $nin: archived } } : {}),
  };
  const [total, issues] = await Promise.all([
    Issue.countDocuments(filter),
    Issue.find(filter).sort({ priorityRank: -1, updatedAt: -1 }).limit(8).populate(ISSUE_POPULATE),
  ]);
  return { total, issues: await withSubissueCounts(issues, serializeIssue) };
}

export async function listQuiet(workspaceId: string, days = 7, now = new Date()) {
  const archived = await archivedProjectIds(workspaceId);
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const filter: FilterQuery<unknown> = {
    workspace: workspaceId,
    status: { $ne: 'done' },
    updatedAt: { $lt: cutoff },
    ...(archived.length ? { project: { $nin: archived } } : {}),
  };
  const [total, issues] = await Promise.all([
    Issue.countDocuments(filter),
    Issue.find(filter).sort({ updatedAt: 1 }).limit(8).populate(ISSUE_POPULATE),
  ]);
  return { total, days, issues: await withSubissueCounts(issues, serializeIssue) };
}

export async function listDue(workspaceId: string, days = 7, now = new Date()) {
  const archived = await archivedProjectIds(workspaceId);
  const filter: FilterQuery<unknown> = {
    workspace: workspaceId,
    status: { $ne: 'done' },
    dueDate: { $lt: dueHorizon(now, days) },
    ...(archived.length ? { project: { $nin: archived } } : {}),
  };
  const [total, issues] = await Promise.all([
    Issue.countDocuments(filter),
    Issue.find(filter).sort({ dueDate: 1, priorityRank: -1 }).limit(8).populate(ISSUE_POPULATE),
  ]);
  return { total, days, issues: await withSubissueCounts(issues, serializeIssue) };
}

export async function listBlocked(workspaceId: string) {
  const archived = await archivedProjectIds(workspaceId);
  const filter: FilterQuery<unknown> = {
    workspace: workspaceId,
    status: { $ne: 'done' },
    blocked: true,
    ...(archived.length ? { project: { $nin: archived } } : {}),
  };
  const [total, issues] = await Promise.all([
    Issue.countDocuments(filter),
    Issue.find(filter).sort({ priorityRank: -1, updatedAt: -1 }).limit(8).populate(ISSUE_POPULATE),
  ]);
  const blockerIds = [...new Set(issues.flatMap((issue) => issue.blockedBy.map((id) => String(id))))];
  const blockers = blockerIds.length
    ? await Issue.find({ _id: { $in: blockerIds }, status: { $ne: 'done' } }).populate('project', 'key')
    : [];
  const byId = new Map(blockers.map((doc) => [String(doc._id), toLink(doc)]));
  const serialized = await withSubissueCounts(issues, serializeIssue);
  return {
    total,
    issues: serialized.map((issue, index) => ({
      ...issue,
      blockedBy: issues[index].blockedBy.flatMap((id) => {
        const link = byId.get(String(id));
        return link ? [link] : [];
      }),
    })),
  };
}

export async function listMyWork(workspaceId: string, userId: string, now = new Date()) {
  const archived = await archivedProjectIds(workspaceId);
  const issues = await Issue.find({
    workspace: workspaceId,
    assignees: userId,
    status: { $ne: 'done' },
    ...(archived.length ? { project: { $nin: archived } } : {}),
  }).populate(ISSUE_POPULATE);

  const snoozes = await activeSnoozes(userId, workspaceId, now);
  const untilByIssue = new Map(snoozes.map((snooze) => [String(snooze.issue), snooze.until]));
  const visible = issues.filter((issue) => !untilByIssue.has(String(issue._id)));
  const hidden = issues
    .filter((issue) => untilByIssue.has(String(issue._id)))
    .sort((left, right) => (untilByIssue.get(String(left._id))?.getTime() ?? 0) - (untilByIssue.get(String(right._id))?.getTime() ?? 0));

  const groups = {
    overdue: [] as typeof issues,
    dueSoon: [] as typeof issues,
    later: [] as typeof issues,
    undated: [] as typeof issues,
  };
  for (const issue of visible) {
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

  const snoozed = await withSubissueCounts(hidden, serializeIssue);
  return {
    total: visible.length,
    counts: {
      overdue: groups.overdue.length,
      dueSoon: groups.dueSoon.length,
      later: groups.later.length,
      undated: groups.undated.length,
    },
    groups: await Promise.all(
      sections.map(async (section) => ({
        id: section.id,
        label: section.label,
        issues: await withSubissueCounts(section.issues, serializeIssue),
      })),
    ),
    snoozed: snoozed.map((issue) => {
      const id = String((issue as unknown as { id: string }).id);
      return { until: dayKey(untilByIssue.get(id) ?? new Date()), issue };
    }),
  };
}

export async function searchWorkspaceIssues(workspaceId: string, q: string) {
  const titleMatches = await Issue.find({
    workspace: workspaceId,
    title: { $regex: escapeRegex(q), $options: 'i' },
  })
    .sort({ updatedAt: -1 })
    .limit(8)
    .populate(ISSUE_POPULATE);

  const key = q.trim().match(/^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/);
  const keyed = [];
  if (key) {
    const project = await Project.findOne({ workspace: workspaceId, key: key[1].toUpperCase() }).select('_id');
    if (project) {
      const match = await Issue.findOne({ project: project._id, number: Number(key[2]) }).populate(ISSUE_POPULATE);
      if (match) keyed.push(match);
    }
  }

  const seen = new Set<string>();
  const merged = [...keyed, ...titleMatches].filter((issue) => {
    const id = String(issue._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return withSubissueCounts(merged.slice(0, 8), serializeIssue);
}

export async function resolveIssueKeys(workspaceId: string, keys: string[]) {
  const wanted = new Map<string, { projectKey: string; number: number }>();
  for (const raw of keys) {
    const match = /^([A-Za-z][A-Za-z0-9]{1,5})-(\d{1,6})$/.exec(raw.trim());
    if (!match) continue;
    const projectKey = match[1].toUpperCase();
    const number = Number(match[2]);
    wanted.set(`${projectKey}-${number}`, { projectKey, number });
  }
  if (!wanted.size) return [];
  const projects = await Project.find({
    workspace: workspaceId,
    key: { $in: [...new Set([...wanted.values()].map((item) => item.projectKey))] },
  }).select('key');
  const projectIdByKey = new Map(projects.map((project) => [project.key, project._id]));
  const clauses = [...wanted.values()].flatMap((item) => {
    const projectId = projectIdByKey.get(item.projectKey);
    return projectId ? [{ project: projectId, number: item.number }] : [];
  });
  if (!clauses.length) return [];
  const issues = await Issue.find({ workspace: workspaceId, $or: clauses }).select('project number title');
  const keyByProject = new Map(projects.map((project) => [String(project._id), project.key]));
  return issues
    .map((issue) => ({
      key: `${keyByProject.get(String(issue.project))}-${issue.number}`,
      id: String(issue._id),
      title: issue.title,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function presentIssue(issueId: string, userId?: string) {
  const issue = await Issue.findById(issueId).populate([
    ...ISSUE_POPULATE,
    { path: 'watchers', select: 'name email avatarColor' },
  ]);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const [relations, family, watchers, related] = await Promise.all([
    relationsFor(issueId),
    familyFor(issueId, issue.parent),
    Promise.resolve((issue.watchers ?? []).map((user) => serializeUser(user))),
    relatedFor(issueId),
  ]);
  return {
    ...serializeIssue(issue),
    ...relations,
    ...family,
    watchers,
    watching: Boolean(userId && watchers.some((user) => user.id === userId)),
    snoozedUntil: userId ? await snoozedUntil(userId, issueId) : null,
    related,
  };
}

export async function getIssue(issueId: string, userId?: string) {
  return presentIssue(issueId, userId);
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
    estimate?: number | null;
    parentId?: string | null;
    checklist?: string[];
  },
  rt?: Realtime,
) {
  const project = await Project.findById(input.projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  if (project.archivedAt) throw new ApiError(409, 'This project is archived', 'project_archived');
  const workspaceId = String(project.workspace);
  const assigneeIds = await assertWorkspaceMembers(workspaceId, input.assigneeIds);
  const labelIds = await assertLabels(workspaceId, input.labelIds);
  const parent = input.parentId ? await assertParentIssue(workspaceId, input.parentId) : null;
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
    estimate: input.estimate ?? null,
    assignees: assigneeIds,
    labels: labelIds,
    reporter: input.actor.id,
    dueDate,
    completedAt: input.status === 'done' ? new Date() : null,
    parent: parent?._id ?? null,
    checklist: (input.checklist ?? []).map((text) => ({ text, done: false })),
  });

  const dto = serializeIssue(await loadIssue(String(issue._id)));
  const parentLabel = parent ? `${(parent.project as { key?: string }).key ?? 'ISSUE'}-${parent.number}` : null;
  const message = parentLabel
    ? `${input.actor.name} opened ${dto.key} ${dto.title} under ${parentLabel}`
    : `${input.actor.name} opened ${dto.key} ${dto.title}`;
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
  if (parent && parentLabel) {
    await recordActivity(
      {
        workspaceId,
        projectId: String((parent.project as { _id?: unknown })._id ?? parent.project),
        issueId: String(parent._id),
        actorId: input.actor.id,
        type: 'issue.subissue',
        message: `${input.actor.name} added ${dto.key} under ${parentLabel}`,
      },
      rt,
    );
  }
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
  return presentIssue(dto.id, input.actor.id);
}

export async function duplicateIssue(issueId: string, actor: { id: string; name: string }, rt?: Realtime) {
  const source = await Issue.findById(issueId);
  if (!source) throw new ApiError(404, 'Issue not found', 'not_found');
  const project = await Project.findById(source.project).select('key');
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const sourceKey = `${project.key}-${source.number}`;
  const copy = await createIssue(
    {
      projectId: String(source.project),
      actor,
      title: source.title,
      description: source.description ?? '',
      status: 'backlog',
      priority: source.priority,
      assigneeIds: source.assignees.map((id) => String(id)),
      labelIds: source.labels.map((id) => String(id)),
      estimate: source.estimate ?? null,
    },
    rt,
  );
  if (source.checklist.length) {
    const saved = await Issue.findById(copy.id);
    if (saved) {
      saved.checklist = source.checklist.map((item) => ({ text: item.text, done: false })) as typeof saved.checklist;
      await saved.save();
    }
  }
  await recordActivity(
    {
      workspaceId: String(source.workspace),
      projectId: String(source.project),
      issueId: String(source._id),
      actorId: actor.id,
      type: 'issue.duplicated',
      message: `${actor.name} duplicated ${sourceKey} as ${copy.key}`,
    },
    rt,
  );
  await recordActivity(
    {
      workspaceId: String(source.workspace),
      projectId: String(source.project),
      issueId: copy.id,
      actorId: actor.id,
      type: 'issue.duplicated',
      message: `${actor.name} duplicated ${copy.key} from ${sourceKey}`,
    },
    rt,
  );
  return presentIssue(copy.id, actor.id);
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
    estimate?: number | null;
    cycleId?: string | null;
    milestoneId?: string | null;
    projectId?: string;
    parentId?: string | null;
  },
  rt?: Realtime,
) {
  const issue = await Issue.findById(input.issueId);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const workspaceId = String(issue.workspace);
  const parts: string[] = [];
  let statusChanged = false;
  let movedFrom: string | null = null;
  let parentActivity: { issueId: string; projectId: string; message: (key: string) => string } | null = null;

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
    if (input.status !== 'done' && issue.status === 'done') {
      issue.completedAt = null;
      issue.dueAlertKind = null;
      issue.dueAlertFor = null;
    }
    parts.push(`status to ${STATUS_LABEL[input.status]}`);
    issue.status = input.status;
    statusChanged = true;
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
      issue.dueAlertKind = null;
      issue.dueAlertFor = null;
      parts.push('due date');
    }
  }
  if (input.estimate !== undefined && input.estimate !== (issue.estimate ?? null)) {
    issue.estimate = input.estimate;
    parts.push('estimate');
  }
  if (input.projectId && input.projectId !== String(issue.project)) {
    const destination = await Project.findOne({ _id: input.projectId, workspace: issue.workspace });
    if (!destination) throw new ApiError(400, 'That project is not in this workspace', 'invalid_project');
    if (destination.archivedAt) throw new ApiError(409, 'That project is archived', 'project_archived');
    const source = await Project.findById(issue.project).select('key');
    const numbered = await Project.findOneAndUpdate({ _id: destination._id }, { $inc: { nextIssueNumber: 1 } }, { new: true });
    if (!numbered) throw new ApiError(404, 'Project not found', 'not_found');
    movedFrom = `${source?.key ?? 'ISSUE'}-${issue.number}`;
    issue.project = destination._id as unknown as typeof issue.project;
    issue.number = numbered.nextIssueNumber;
    issue.cycle = null;
    issue.milestone = null;
    await Comment.updateMany({ issue: issue._id }, { project: destination._id });
    parts.push(`project to ${destination.name}`);
  }
  if (input.parentId !== undefined) {
    const current = issue.parent ? String(issue.parent) : null;
    if (input.parentId !== current) {
      const parent = await assertParentIssue(workspaceId, input.parentId, String(issue._id));
      const previous = current ? await Issue.findById(current).populate('project', 'key') : null;
      issue.parent = (parent?._id ?? null) as unknown as typeof issue.parent;
      const parentLabel = parent ? `${(parent.project as { key?: string }).key ?? 'ISSUE'}-${parent.number}` : null;
      parts.push(parentLabel ? `parent to ${parentLabel}` : 'parent');
      if (parent && parentLabel) {
        parentActivity = {
          issueId: String(parent._id),
          projectId: String((parent.project as { _id?: unknown })._id ?? parent.project),
          message: (key) => `${input.actor.name} added ${key} under ${parentLabel}`,
        };
      } else if (previous) {
        const previousLabel = `${(previous.project as { key?: string }).key ?? 'ISSUE'}-${previous.number}`;
        parentActivity = {
          issueId: String(previous._id),
          projectId: String((previous.project as { _id?: unknown })._id ?? previous.project),
          message: (key) => `${input.actor.name} removed ${key} from ${previousLabel}`,
        };
      }
    }
  }
  if (input.cycleId !== undefined) {
    const next = input.cycleId ? await assertProjectCycle(String(issue.project), input.cycleId) : null;
    const current = issue.cycle ? String(issue.cycle) : null;
    if (next !== current) {
      issue.cycle = next as unknown as typeof issue.cycle;
      parts.push('cycle');
    }
  }
  if (input.milestoneId !== undefined) {
    const next = input.milestoneId ? await assertProjectMilestone(String(issue.project), input.milestoneId) : null;
    const current = issue.milestone ? String(issue.milestone) : null;
    if (next !== current) {
      issue.milestone = next as unknown as typeof issue.milestone;
      parts.push('milestone');
    }
  }

  let addedAssignees: string[] = [];
  if (input.assigneeIds !== undefined) {
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

  if (!parts.length) return presentIssue(String(issue._id), input.actor.id);

  await issue.save();
  if (statusChanged) await syncDependents(String(issue._id), input.actor, rt);
  const dto = await presentIssue(String(issue._id), input.actor.id);
  const detail = parts.filter((part) => !part.startsWith('project to '));
  const message = movedFrom
    ? `${input.actor.name} moved ${movedFrom} to ${dto.key}${detail.length ? ` and updated ${detail.join(', ')}` : ''}`
    : `${input.actor.name} updated ${dto.key}: ${parts.join(', ')}`;
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: dto.id,
      actorId: input.actor.id,
      type: movedFrom ? 'issue.moved' : 'issue.updated',
      message,
    },
    rt,
  );
  if (parentActivity) {
    await recordActivity(
      {
        workspaceId,
        projectId: parentActivity.projectId,
        issueId: parentActivity.issueId,
        actorId: input.actor.id,
        type: 'issue.subissue',
        message: parentActivity.message(dto.key),
      },
      rt,
    );
  }
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
  if (statusChanged) {
    await notifyUsers(
      {
        userIds: notifyAudience(issue),
        workspaceId,
        actorId: input.actor.id,
        type: 'issue.status',
        message: `${input.actor.name} moved ${dto.key} to ${dto.statusLabel}`,
        link: `/w/${workspaceId}/issues/${dto.id}`,
      },
      rt,
    );
  }
  rt?.toWorkspace(workspaceId, 'issue:updated', { issueId: dto.id, projectId: String(issue.project) });
  return dto;
}

export async function bulkUpdateIssues(
  input: {
    actor: { id: string; name: string };
    issueIds: string[];
    status?: IssueStatus;
    priority?: Priority;
    assigneeId?: string | null;
  },
  rt?: Realtime,
) {
  if (!input.status && !input.priority && input.assigneeId === undefined) {
    throw new ApiError(400, 'Choose a status, a priority, or an assignee', 'empty_update');
  }
  const unique = [...new Set(input.issueIds)];
  const found = await Issue.find({ _id: { $in: unique } }).select('workspace project');
  if (found.length !== unique.length) throw new ApiError(404, 'Issue not found', 'not_found');
  const workspaceIds = new Set(found.map((issue) => String(issue.workspace)));
  if (workspaceIds.size !== 1) throw new ApiError(400, 'Choose issues from one workspace', 'mixed_workspace');
  const workspaceId = [...workspaceIds][0];
  const membership = await Membership.findOne({ workspace: workspaceId, user: input.actor.id }).lean();
  if (!membership) throw new ApiError(404, 'Issue not found', 'not_found');
  const projects = await Project.find({ _id: { $in: found.map((issue) => issue.project) } }).select('archivedAt');
  if (projects.some((project) => project.archivedAt)) {
    throw new ApiError(409, 'This project is archived', 'project_archived');
  }
  const issues = [];
  for (const issueId of unique) {
    issues.push(
      await updateIssue(
        {
          issueId,
          actor: input.actor,
          status: input.status,
          priority: input.priority,
          ...(input.assigneeId !== undefined ? { assigneeIds: input.assigneeId ? [input.assigneeId] : [] } : {}),
        },
        rt,
      ),
    );
  }
  return issues;
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
  await clearBlockerRefs([issueId], rt);
  await clearRelatedRefs([issueId]);
  await detachChildren(issueId);
  await clearTargetFavorites({ issueIds: [issueId] });
  await clearIssueSnoozes([issueId]);
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

function presentComment(
  comment: Parameters<typeof serializeComment>[0] & { reactions?: { emoji: string; user: unknown }[] | null },
  userId: string,
) {
  return { ...serializeComment(comment), reactions: serializeReactions(comment.reactions, userId) };
}

export async function listComments(issueId: string, userId: string) {
  const comments = await Comment.find({ issue: issueId }).sort({ pinnedAt: -1, createdAt: 1 }).populate('author', 'name email avatarColor');
  return comments.map((comment) => presentComment(comment, userId));
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
  const dto = presentComment(populated, input.actor.id);
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
  return presentComment(populated, actor.id);
}

export async function toggleReaction(
  commentId: string,
  actor: { id: string; name: string },
  emoji: Reaction,
  rt?: Realtime,
) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found', 'not_found');
  await membershipFor(actor.id, String(comment.workspace));
  const mine = comment.reactions.find((row) => row.emoji === emoji && String(row.user) === actor.id);
  if (mine) {
    comment.reactions = comment.reactions.filter((row) => !(row.emoji === emoji && String(row.user) === actor.id)) as typeof comment.reactions;
  } else {
    if (comment.reactions.length >= 100) throw new ApiError(409, 'This comment has enough reactions', 'reaction_limit');
    comment.reactions.push({ emoji, user: actor.id as unknown as (typeof comment.reactions)[number]['user'] });
  }
  await comment.save();
  const populated = await comment.populate('author', 'name email avatarColor');
  rt?.toWorkspace(String(comment.workspace), 'comment:updated', { issueId: String(comment.issue), commentId: String(comment._id) });
  return presentComment(populated, actor.id);
}

export async function setCommentPin(
  commentId: string,
  actor: { id: string; name: string },
  pinned: boolean,
  rt?: Realtime,
) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found', 'not_found');
  await membershipFor(actor.id, String(comment.workspace));
  if (Boolean(comment.pinnedAt) === pinned) {
    const unchanged = await comment.populate('author', 'name email avatarColor');
    return serializeComment(unchanged);
  }
  if (pinned) {
    await Comment.updateMany({ issue: comment.issue, _id: { $ne: comment._id } }, { $set: { pinnedAt: null } });
    comment.pinnedAt = new Date();
  } else {
    comment.pinnedAt = null;
  }
  await comment.save();
  const issue = await Issue.findById(comment.issue);
  const project = issue ? await Project.findById(issue.project).select('key') : null;
  const key = issue ? `${project?.key ?? 'ISSUE'}-${issue.number}` : 'the issue';
  await recordActivity(
    {
      workspaceId: String(comment.workspace),
      projectId: String(comment.project),
      issueId: String(comment.issue),
      actorId: actor.id,
      type: 'comment.pinned',
      message: `${actor.name} ${pinned ? 'pinned' : 'unpinned'} a comment on ${key}`,
    },
    rt,
  );
  rt?.toWorkspace(String(comment.workspace), 'comment:updated', {
    issueId: String(comment.issue),
    commentId: String(comment._id),
  });
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
    const watchers = notifyAudience(issue).filter((id) => !mentionedNow.has(id));
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
