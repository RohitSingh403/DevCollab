import { ApiError, isDuplicateKey } from '../errors';
import { Favorite } from '../models/Favorite';
import { Issue } from '../models/Issue';
import { Project } from '../models/Project';

const FAVORITE_LIMIT = 12;

export async function listFavorites(workspaceId: string, userId: string) {
  const rows = await Favorite.find({ workspace: workspaceId, user: userId }).sort({ createdAt: 1 });
  const projects = await Project.find({ _id: { $in: rows.filter((row) => row.kind === 'project').map((row) => row.target) } }).select('name key');
  const issues = await Issue.find({ _id: { $in: rows.filter((row) => row.kind === 'issue').map((row) => row.target) } })
    .select('title number project')
    .populate('project', 'key');
  const projectById = new Map(projects.map((project) => [String(project._id), project]));
  const issueById = new Map(issues.map((issue) => [String(issue._id), issue]));
  const favorites = [];
  for (const row of rows) {
    const id = String(row.target);
    if (row.kind === 'project') {
      const project = projectById.get(id);
      if (!project) {
        await row.deleteOne();
        continue;
      }
      favorites.push({ id: String(row._id), kind: 'project' as const, targetId: id, label: project.name, hint: project.key });
      continue;
    }
    const issue = issueById.get(id);
    if (!issue) {
      await row.deleteOne();
      continue;
    }
    const project = issue.project as { key?: string };
    favorites.push({
      id: String(row._id),
      kind: 'issue' as const,
      targetId: id,
      label: issue.title,
      hint: `${project.key ?? 'ISSUE'}-${issue.number}`,
    });
  }
  return favorites;
}

export async function addFavorite(
  workspaceId: string,
  userId: string,
  input: { kind: 'project' | 'issue'; targetId: string },
) {
  if (input.kind === 'project') {
    const project = await Project.findOne({ _id: input.targetId, workspace: workspaceId }).select('_id');
    if (!project) throw new ApiError(400, 'That project is not in this workspace', 'invalid_favorite');
  } else {
    const issue = await Issue.findOne({ _id: input.targetId, workspace: workspaceId }).select('_id');
    if (!issue) throw new ApiError(400, 'That issue is not in this workspace', 'invalid_favorite');
  }
  const existing = await Favorite.findOne({ user: userId, kind: input.kind, target: input.targetId });
  if (existing) return listFavorites(workspaceId, userId);
  const count = await Favorite.countDocuments({ workspace: workspaceId, user: userId });
  if (count >= FAVORITE_LIMIT) throw new ApiError(409, 'You can keep 12 favorites in a workspace', 'favorite_limit');
  try {
    await Favorite.create({ user: userId, workspace: workspaceId, kind: input.kind, target: input.targetId });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  return listFavorites(workspaceId, userId);
}

export async function removeFavorite(workspaceId: string, userId: string, kind: 'project' | 'issue', targetId: string) {
  await Favorite.deleteOne({ workspace: workspaceId, user: userId, kind, target: targetId });
  return listFavorites(workspaceId, userId);
}

export async function clearWorkspaceFavorites(workspaceId: string) {
  await Favorite.deleteMany({ workspace: workspaceId });
}

export async function clearMemberFavorites(workspaceId: string, userId: string) {
  await Favorite.deleteMany({ workspace: workspaceId, user: userId });
}

export async function clearTargetFavorites(input: { projectId?: string; issueIds?: string[] }) {
  const clauses = [];
  if (input.projectId) clauses.push({ kind: 'project', target: input.projectId });
  if (input.issueIds?.length) clauses.push({ kind: 'issue', target: { $in: input.issueIds } });
  if (clauses.length) await Favorite.deleteMany({ $or: clauses });
}
