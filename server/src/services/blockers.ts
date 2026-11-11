import { STATUS_LABEL, type IssueStatus } from '../constants';
import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { Project } from '../models/Project';
import type { Realtime } from '../realtime';
import { assertObjectId } from '../utils';
import { recordActivity } from './activity';
import { notifyUsers } from './notifications';

const BLOCKER_LIMIT = 20;

export interface IssueLink {
  id: string;
  key: string;
  title: string;
  status: IssueStatus;
  statusLabel: string;
}

async function keyFor(issue: { project: unknown; number: number }) {
  const project = await Project.findById(issue.project).select('key');
  return `${project?.key ?? 'ISSUE'}-${issue.number}`;
}

function toLink(issue: { _id: unknown; number: number; title: string; status: IssueStatus; project: unknown }): IssueLink {
  const project = issue.project as { key?: string };
  return {
    id: String(issue._id),
    key: `${project?.key ?? 'ISSUE'}-${issue.number}`,
    title: issue.title,
    status: issue.status,
    statusLabel: STATUS_LABEL[issue.status],
  };
}

export async function issueIsBlocked(issueId: string) {
  const issue = await Issue.findById(issueId).select('blockedBy');
  if (!issue?.blockedBy.length) return false;
  const open = await Issue.exists({ _id: { $in: issue.blockedBy }, status: { $ne: 'done' } });
  return Boolean(open);
}

export async function relationsFor(issueId: string) {
  const issue = await Issue.findById(issueId).select('blockedBy');
  if (!issue) return { blockedBy: [] as IssueLink[], blocking: [] as IssueLink[] };
  const [blockedDocs, blockingDocs] = await Promise.all([
    Issue.find({ _id: { $in: issue.blockedBy } }).populate('project', 'key'),
    Issue.find({ blockedBy: issueId }).sort({ number: 1 }).populate('project', 'key'),
  ]);
  const byId = new Map(blockedDocs.map((doc) => [String(doc._id), doc]));
  const blockedBy = issue.blockedBy
    .map((id) => byId.get(String(id)))
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
    .map((doc) => toLink(doc));
  return { blockedBy, blocking: blockingDocs.map((doc) => toLink(doc)) };
}

async function introducesCycle(issueId: string, blockerId: string) {
  const seen = new Set<string>();
  const pending = [blockerId];
  while (pending.length) {
    const current = pending.pop() as string;
    if (current === issueId) return true;
    if (seen.has(current) || seen.size > 100) continue;
    seen.add(current);
    const doc = await Issue.findById(current).select('blockedBy');
    if (!doc) continue;
    pending.push(...doc.blockedBy.map((id) => String(id)));
  }
  return false;
}

function publish(rt: Realtime | undefined, workspaceId: string, issueId: string, projectId: string) {
  rt?.toWorkspace(workspaceId, 'issue:updated', { issueId, projectId });
}

export async function addBlocker(
  input: { issueId: string; blockerId: string; actor: { id: string; name: string } },
  rt?: Realtime,
) {
  if (input.issueId === input.blockerId) {
    throw new ApiError(400, 'An issue cannot block itself', 'self_block');
  }
  const [issue, blocker] = await Promise.all([Issue.findById(input.issueId), Issue.findById(input.blockerId)]);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  if (!blocker || String(blocker.workspace) !== String(issue.workspace)) {
    throw new ApiError(404, 'Issue not found', 'not_found');
  }
  const current = issue.blockedBy.map((id) => String(id));
  if (current.includes(input.blockerId)) {
    throw new ApiError(409, 'This issue is already blocked by that issue', 'duplicate_blocker');
  }
  if (current.length >= BLOCKER_LIMIT) {
    throw new ApiError(400, `An issue can have at most ${BLOCKER_LIMIT} blockers`, 'blocker_limit');
  }
  if (await introducesCycle(input.issueId, input.blockerId)) {
    throw new ApiError(400, 'That link would create a cycle', 'blocker_cycle');
  }

  const blocked = issue.blocked || blocker.status !== 'done';
  await Issue.updateOne({ _id: issue._id }, { $push: { blockedBy: blocker._id }, $set: { blocked } });
  const workspaceId = String(issue.workspace);
  const [dependentKey, blockerKey] = await Promise.all([keyFor(issue), keyFor(blocker)]);
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: input.issueId,
      actorId: input.actor.id,
      type: 'issue.blocked',
      message: `${input.actor.name} marked ${dependentKey} as blocked by ${blockerKey}`,
    },
    rt,
  );
  await notifyUsers(
    {
      userIds: [String(issue.reporter), ...issue.assignees.map((id) => String(id))],
      workspaceId,
      actorId: input.actor.id,
      type: 'issue.blocked',
      message: `${input.actor.name} marked ${dependentKey} as blocked by ${blockerKey}`,
      link: `/w/${workspaceId}/issues/${input.issueId}`,
    },
    rt,
  );
  publish(rt, workspaceId, input.issueId, String(issue.project));
  publish(rt, workspaceId, input.blockerId, String(blocker.project));
}

export async function removeBlocker(
  input: { issueId: string; blockerId: string; actor: { id: string; name: string } },
  rt?: Realtime,
) {
  assertObjectId(input.blockerId, 'blocker id');
  const issue = await Issue.findById(input.issueId);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const linked = issue.blockedBy.some((id) => String(id) === input.blockerId);
  if (!linked) throw new ApiError(404, 'Blocker not found', 'not_found');
  const blocker = await Issue.findById(input.blockerId).select('project number');
  issue.blockedBy = issue.blockedBy.filter((id) => String(id) !== input.blockerId) as typeof issue.blockedBy;
  await issue.save();
  issue.blocked = await issueIsBlocked(input.issueId);
  await issue.save();
  const workspaceId = String(issue.workspace);
  const dependentKey = await keyFor(issue);
  const blockerKey = blocker ? await keyFor(blocker) : 'the blocker';
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: input.issueId,
      actorId: input.actor.id,
      type: 'issue.unblocked',
      message: `${input.actor.name} removed ${blockerKey} as a blocker of ${dependentKey}`,
    },
    rt,
  );
  publish(rt, workspaceId, input.issueId, String(issue.project));
  if (blocker) publish(rt, workspaceId, input.blockerId, String(blocker.project));
}

export async function syncDependents(blockerId: string, actor: { id: string; name: string }, rt?: Realtime) {
  const blocker = await Issue.findById(blockerId).select('status number project workspace');
  if (!blocker) return;
  const dependents = await Issue.find({ blockedBy: blockerId });
  const blockerKey = await keyFor(blocker);
  for (const dependent of dependents) {
    const blocked = await issueIsBlocked(String(dependent._id));
    if (dependent.blocked === blocked) continue;
    dependent.blocked = blocked;
    await dependent.save();
    const workspaceId = String(dependent.workspace);
    const dependentKey = await keyFor(dependent);
    publish(rt, workspaceId, String(dependent._id), String(dependent.project));
    await notifyUsers(
      {
        userIds: [String(dependent.reporter), ...dependent.assignees.map((id) => String(id))],
        workspaceId,
        actorId: actor.id,
        type: blocked ? 'issue.blocked' : 'issue.unblocked',
        message: blocked
          ? `${blockerKey} was reopened and is blocking ${dependentKey}`
          : `${blockerKey} is done, so ${dependentKey} is no longer blocked`,
        link: `/w/${workspaceId}/issues/${String(dependent._id)}`,
      },
      rt,
    );
  }
}

export async function clearBlockerRefs(blockerIds: string[], rt?: Realtime) {
  const ids = blockerIds.filter(Boolean);
  if (!ids.length) return;
  const affected = await Issue.find({ blockedBy: { $in: ids } }).select('_id workspace project');
  await Issue.updateMany({ blockedBy: { $in: ids } }, { $pull: { blockedBy: { $in: ids } } });
  for (const row of affected) {
    const blocked = await issueIsBlocked(String(row._id));
    await Issue.updateOne({ _id: row._id }, { $set: { blocked } });
    publish(rt, String(row.workspace), String(row._id), String(row.project));
  }
}
