import mongoose from 'mongoose';
import { ApiError, isDuplicateKey } from '../errors';
import { Comment } from '../models/Comment';
import { SavedView } from '../models/SavedView';
import { Issue } from '../models/Issue';
import { Project } from '../models/Project';
import type { Realtime } from '../realtime';
import { recordActivity } from './activity';
import { clearBlockerRefs } from './blockers';

export async function listProjects(workspaceId: string) {
  const projects = await Project.find({ workspace: workspaceId }).sort({ name: 1 }).lean();
  const counts = await Issue.aggregate<{ _id: { project: unknown; status: string }; count: number }>([
    { $match: { workspace: new mongoose.Types.ObjectId(workspaceId) } },
    { $group: { _id: { project: '$project', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const byProject = new Map<string, { total: number; open: number }>();
  for (const row of counts) {
    const id = String(row._id.project);
    const current = byProject.get(id) ?? { total: 0, open: 0 };
    current.total += row.count;
    if (row._id.status !== 'done') current.open += row.count;
    byProject.set(id, current);
  }
  return projects.map((project) => {
    const tally = byProject.get(String(project._id)) ?? { total: 0, open: 0 };
    return {
      id: String(project._id),
      workspaceId: String(project.workspace),
      name: project.name,
      key: project.key,
      description: project.description ?? '',
      issueCount: tally.total,
      openIssueCount: tally.open,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  });
}

export async function createProject(
  workspaceId: string,
  actor: { id: string; name: string },
  input: { name: string; key: string; description: string },
  rt?: Realtime,
) {
  try {
    const project = await Project.create({
      workspace: workspaceId,
      name: input.name,
      key: input.key,
      description: input.description,
      createdBy: actor.id,
    });
    await recordActivity(
      {
        workspaceId,
        projectId: String(project._id),
        actorId: actor.id,
        type: 'project.created',
        message: `${actor.name} created project ${project.key} ${project.name}`,
      },
      rt,
    );
    return {
      id: String(project._id),
      workspaceId,
      name: project.name,
      key: project.key,
      description: project.description,
      issueCount: 0,
      openIssueCount: 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  } catch (error) {
    if (isDuplicateKey(error)) throw new ApiError(409, 'A project with that key already exists', 'duplicate_key');
    throw error;
  }
}

export async function getProject(projectId: string) {
  const project = await Project.findById(projectId).lean();
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const [issueCount, openIssueCount] = await Promise.all([
    Issue.countDocuments({ project: projectId }),
    Issue.countDocuments({ project: projectId, status: { $ne: 'done' } }),
  ]);
  return {
    id: String(project._id),
    workspaceId: String(project.workspace),
    name: project.name,
    key: project.key,
    description: project.description ?? '',
    issueCount,
    openIssueCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export async function updateProject(
  projectId: string,
  actor: { id: string; name: string },
  input: { name?: string; description?: string },
  rt?: Realtime,
) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  if (input.name) project.name = input.name;
  if (input.description !== undefined) project.description = input.description;
  await project.save();
  await recordActivity(
    {
      workspaceId: String(project.workspace),
      projectId,
      actorId: actor.id,
      type: 'project.updated',
      message: `${actor.name} updated project ${project.key}`,
    },
    rt,
  );
  return getProject(projectId);
}

export async function deleteProject(projectId: string, actor: { id: string; name: string }, rt?: Realtime) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const doomed = await Issue.find({ project: project._id }).distinct('_id');
  await clearBlockerRefs(doomed.map((id) => String(id)), rt);
  await Comment.deleteMany({ project: project._id });
  await Issue.deleteMany({ project: project._id });
  await SavedView.deleteMany({ project: project._id });
  const workspaceId = String(project.workspace);
  const label = `${project.key} ${project.name}`;
  await project.deleteOne();
  await recordActivity(
    {
      workspaceId,
      actorId: actor.id,
      type: 'project.deleted',
      message: `${actor.name} deleted project ${label}`,
    },
    rt,
  );
}
