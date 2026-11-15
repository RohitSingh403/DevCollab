import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { Project } from '../models/Project';
import type { Realtime } from '../realtime';
import { assertObjectId } from '../utils';
import { recordActivity } from './activity';
import { toLink, type IssueLink } from './blockers';

const RELATED_LIMIT = 20;

async function keyFor(issue: { project: unknown; number: number }) {
  const project = await Project.findById(issue.project).select('key');
  return `${project?.key ?? 'ISSUE'}-${issue.number}`;
}

function publish(rt: Realtime | undefined, workspaceId: string, issueId: string, projectId: string) {
  rt?.toWorkspace(workspaceId, 'issue:updated', { issueId, projectId });
}

export async function relatedFor(issueId: string): Promise<IssueLink[]> {
  const issue = await Issue.findById(issueId).select('related');
  if (!issue?.related.length) return [];
  const docs = await Issue.find({ _id: { $in: issue.related } }).populate('project', 'key');
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  return issue.related
    .map((id) => byId.get(String(id)))
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
    .map((doc) => toLink(doc));
}

export async function addRelated(
  input: { issueId: string; relatedId: string; actor: { id: string; name: string } },
  rt?: Realtime,
) {
  if (input.issueId === input.relatedId) {
    throw new ApiError(400, 'An issue cannot be related to itself', 'self_related');
  }
  const [issue, other] = await Promise.all([Issue.findById(input.issueId), Issue.findById(input.relatedId)]);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  if (!other || String(other.workspace) !== String(issue.workspace)) {
    throw new ApiError(404, 'Issue not found', 'not_found');
  }
  const current = issue.related.map((id) => String(id));
  if (current.includes(input.relatedId)) {
    throw new ApiError(409, 'These issues are already related', 'duplicate_related');
  }
  if (current.length >= RELATED_LIMIT || other.related.length >= RELATED_LIMIT) {
    throw new ApiError(400, `An issue can have at most ${RELATED_LIMIT} related issues`, 'related_limit');
  }

  await Issue.updateOne({ _id: issue._id }, { $addToSet: { related: other._id } });
  await Issue.updateOne({ _id: other._id }, { $addToSet: { related: issue._id } });
  const workspaceId = String(issue.workspace);
  const [leftKey, rightKey] = await Promise.all([keyFor(issue), keyFor(other)]);
  const message = `${input.actor.name} related ${leftKey} to ${rightKey}`;
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: input.issueId,
      actorId: input.actor.id,
      type: 'issue.related',
      message,
    },
    rt,
  );
  await recordActivity(
    {
      workspaceId,
      projectId: String(other.project),
      issueId: input.relatedId,
      actorId: input.actor.id,
      type: 'issue.related',
      message,
    },
    rt,
  );
  publish(rt, workspaceId, input.issueId, String(issue.project));
  publish(rt, workspaceId, input.relatedId, String(other.project));
}

export async function removeRelated(
  input: { issueId: string; relatedId: string; actor: { id: string; name: string } },
  rt?: Realtime,
) {
  assertObjectId(input.relatedId, 'related issue id');
  const issue = await Issue.findById(input.issueId);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const linked = issue.related.some((id) => String(id) === input.relatedId);
  if (!linked) throw new ApiError(404, 'Related issue not found', 'not_found');
  const other = await Issue.findById(input.relatedId);
  await Issue.updateOne({ _id: issue._id }, { $pull: { related: input.relatedId } });
  if (other) await Issue.updateOne({ _id: other._id }, { $pull: { related: issue._id } });
  const workspaceId = String(issue.workspace);
  const leftKey = await keyFor(issue);
  const rightKey = other ? await keyFor(other) : 'the issue';
  const message = `${input.actor.name} removed the relation between ${leftKey} and ${rightKey}`;
  await recordActivity(
    {
      workspaceId,
      projectId: String(issue.project),
      issueId: input.issueId,
      actorId: input.actor.id,
      type: 'issue.unrelated',
      message,
    },
    rt,
  );
  if (other) {
    await recordActivity(
      {
        workspaceId,
        projectId: String(other.project),
        issueId: input.relatedId,
        actorId: input.actor.id,
        type: 'issue.unrelated',
        message,
      },
      rt,
    );
    publish(rt, workspaceId, input.relatedId, String(other.project));
  }
  publish(rt, workspaceId, input.issueId, String(issue.project));
}

export async function clearRelatedRefs(issueIds: string[]) {
  const ids = issueIds.filter(Boolean);
  if (!ids.length) return;
  await Issue.updateMany({ related: { $in: ids } }, { $pull: { related: { $in: ids } } });
}
