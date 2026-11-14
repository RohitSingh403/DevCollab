import { Types } from 'mongoose';
import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { toLink } from './blockers';

const MAX_DEPTH = 8;

export async function assertParentIssue(workspaceId: string, parentId: string | null, childId?: string) {
  if (!parentId) return null;
  if (childId && parentId === childId) throw new ApiError(400, 'An issue cannot be its own parent', 'invalid_parent');
  const parent = await Issue.findById(parentId).populate('project', 'key');
  if (!parent || String(parent.workspace) !== workspaceId) {
    throw new ApiError(400, 'That parent is not in this workspace', 'invalid_parent');
  }

  let cursorId = String(parent._id);
  const seen = new Set<string>();
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    if (childId && cursorId === childId) throw new ApiError(400, 'That parent is already under this issue', 'invalid_parent');
    if (seen.has(cursorId)) throw new ApiError(400, 'That parent is already under this issue', 'invalid_parent');
    seen.add(cursorId);
    const row = cursorId === String(parent._id) ? parent : await Issue.findById(cursorId).select('parent');
    if (!row?.parent) return parent;
    cursorId = String(row.parent);
  }
  throw new ApiError(400, 'Sub-issues can only nest eight levels deep', 'invalid_parent');
}

export async function subissueCounts(issueIds: string[]) {
  const counts = new Map<string, { total: number; done: number }>();
  if (!issueIds.length) return counts;
  const rows = await Issue.aggregate<{ _id: unknown; total: number; done: number }>([
    { $match: { parent: { $in: issueIds.map((id) => new Types.ObjectId(id)) } } },
    {
      $group: {
        _id: '$parent',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
      },
    },
  ]);
  for (const row of rows) counts.set(String(row._id), { total: row.total, done: row.done });
  return counts;
}

export async function withSubissueCounts<T extends { _id: unknown }>(issues: T[], serialize: (issue: T) => object) {
  const counts = await subissueCounts(issues.map((issue) => String(issue._id)));
  return issues.map((issue) => ({
    ...serialize(issue),
    subissues: counts.get(String(issue._id)) ?? { total: 0, done: 0 },
  }));
}

export async function familyFor(issueId: string, parentId: unknown) {
  const [parent, children] = await Promise.all([
    parentId ? Issue.findById(parentId).populate('project', 'key') : null,
    Issue.find({ parent: issueId }).sort({ number: 1 }).populate('project', 'key'),
  ]);
  const links = children.map((child) => toLink(child));
  return {
    parent: parent ? toLink(parent) : null,
    children: links,
    subissues: { total: links.length, done: links.filter((child) => child.status === 'done').length },
  };
}

export async function detachChildren(issueId: string) {
  await Issue.updateMany({ parent: issueId }, { $set: { parent: null } });
}
