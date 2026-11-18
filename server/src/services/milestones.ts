import mongoose from 'mongoose';
import { roleRank, type Role } from '../constants';
import { dayKey, parseDay } from '../dates';
import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { Milestone } from '../models/Milestone';
import { Project } from '../models/Project';
import { archivedProjectIds } from './projects';
import type { Realtime } from '../realtime';
import { escapeRegex } from '../utils';
import { recordActivity } from './activity';

const LIMIT = 20;

async function nameTaken(projectId: string, name: string, exceptId?: string) {
  const existing = await Milestone.findOne({
    project: projectId,
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  }).select('_id');
  return Boolean(existing && String(existing._id) !== exceptId);
}

function present(
  milestone: { _id: unknown; name: string; targetDate?: Date | null; createdBy: unknown },
  counts: { total: number; done: number },
  actor: { id: string; role: Role },
) {
  return {
    id: String(milestone._id),
    name: milestone.name,
    targetDate: milestone.targetDate ? dayKey(milestone.targetDate) : null,
    total: counts.total,
    done: counts.done,
    canDelete: String(milestone.createdBy) === actor.id || roleRank(actor.role) >= roleRank('admin'),
  };
}

async function countsFor(projectId: string) {
  const rows = await Issue.aggregate<{ _id: { milestone: unknown; status: string }; count: number }>([
    { $match: { project: new mongoose.Types.ObjectId(projectId), milestone: { $ne: null } } },
    { $group: { _id: { milestone: '$milestone', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const byId = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    const id = String(row._id.milestone);
    const current = byId.get(id) ?? { total: 0, done: 0 };
    current.total += row.count;
    if (row._id.status === 'done') current.done += row.count;
    byId.set(id, current);
  }
  return byId;
}

export async function listMilestones(projectId: string, actor: { id: string; role: Role }) {
  const milestones = await Milestone.find({ project: projectId }).sort({ targetDate: 1, name: 1 });
  const counts = await countsFor(projectId);
  return milestones.map((milestone) => present(milestone, counts.get(String(milestone._id)) ?? { total: 0, done: 0 }, actor));
}

export type RoadmapState = 'overdue' | 'upcoming' | 'undated' | 'complete';

export async function listRoadmap(workspaceId: string) {
  const archived = await archivedProjectIds(workspaceId);
  const milestones = await Milestone.find({ workspace: workspaceId, project: { $nin: archived } }).populate('project', 'name key');
  if (!milestones.length) return [];
  const rows = await Issue.aggregate<{ _id: { milestone: unknown; status: string }; count: number }>([
    {
      $match: {
        workspace: new mongoose.Types.ObjectId(workspaceId),
        milestone: { $in: milestones.map((milestone) => milestone._id) },
      },
    },
    { $group: { _id: { milestone: '$milestone', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const counts = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    const id = String(row._id.milestone);
    const current = counts.get(id) ?? { total: 0, done: 0 };
    current.total += row.count;
    if (row._id.status === 'done') current.done += row.count;
    counts.set(id, current);
  }
  const today = dayKey(new Date());
  const items = milestones.map((milestone) => {
    const project = milestone.project as { _id?: unknown; name?: string; key?: string };
    const tally = counts.get(String(milestone._id)) ?? { total: 0, done: 0 };
    const targetDate = milestone.targetDate ? dayKey(milestone.targetDate) : null;
    const complete = tally.total > 0 && tally.done === tally.total;
    const state: RoadmapState = complete ? 'complete' : !targetDate ? 'undated' : targetDate < today ? 'overdue' : 'upcoming';
    return {
      id: String(milestone._id),
      name: milestone.name,
      targetDate,
      total: tally.total,
      done: tally.done,
      state,
      project: { id: String(project._id ?? milestone.project), name: project.name ?? '', key: project.key ?? '' },
    };
  });
  const rank: Record<RoadmapState, number> = { overdue: 0, upcoming: 1, undated: 2, complete: 3 };
  items.sort((left, right) => {
    if (rank[left.state] !== rank[right.state]) return rank[left.state] - rank[right.state];
    if (left.targetDate && right.targetDate && left.targetDate !== right.targetDate) {
      return left.state === 'complete' ? right.targetDate.localeCompare(left.targetDate) : left.targetDate.localeCompare(right.targetDate);
    }
    return left.name.localeCompare(right.name);
  });
  return items;
}

export async function assertProjectMilestone(projectId: string, milestoneId: string) {
  const milestone = await Milestone.findOne({ _id: milestoneId, project: projectId }).select('_id');
  if (!milestone) throw new ApiError(400, 'That milestone is not in this project', 'invalid_milestone');
  return String(milestone._id);
}

export async function createMilestone(
  input: { projectId: string; actor: { id: string; name: string; role: Role }; name: string; targetDate?: string | null },
  rt?: Realtime,
) {
  const project = await Project.findById(input.projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  if (project.archivedAt) throw new ApiError(409, 'This project is archived', 'project_archived');
  const count = await Milestone.countDocuments({ project: project._id });
  if (count >= LIMIT) throw new ApiError(409, 'This project already has 20 milestones', 'milestone_limit');
  if (await nameTaken(String(project._id), input.name)) {
    throw new ApiError(409, 'A milestone already has that name', 'milestone_exists');
  }
  const targetDate = input.targetDate ? parseDay(input.targetDate) : null;
  if (input.targetDate && !targetDate) throw new ApiError(400, 'That date is not valid', 'invalid_date');
  const milestone = await Milestone.create({
    workspace: project.workspace,
    project: project._id,
    name: input.name,
    targetDate,
    createdBy: input.actor.id,
  });
  await recordActivity(
    {
      workspaceId: String(project.workspace),
      projectId: String(project._id),
      actorId: input.actor.id,
      type: 'milestone.created',
      message: `${input.actor.name} added the milestone ${milestone.name} on ${project.key}`,
    },
    rt,
  );
  rt?.toWorkspace(String(project.workspace), 'milestone:changed', { projectId: String(project._id) });
  return present(milestone, { total: 0, done: 0 }, input.actor);
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  actor: { id: string; name: string; role: Role },
  input: { name?: string; targetDate?: string | null },
  rt?: Realtime,
) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  if (project.archivedAt) throw new ApiError(409, 'This project is archived', 'project_archived');
  const milestone = await Milestone.findOne({ _id: milestoneId, project: projectId });
  if (!milestone) throw new ApiError(404, 'Milestone not found', 'not_found');
  let changed = false;
  if (input.name && input.name !== milestone.name) {
    if (input.name.toLowerCase() !== milestone.name.toLowerCase() && (await nameTaken(projectId, input.name, milestoneId))) {
      throw new ApiError(409, 'A milestone already has that name', 'milestone_exists');
    }
    milestone.name = input.name;
    changed = true;
  }
  if (input.targetDate !== undefined) {
    const next = input.targetDate ? parseDay(input.targetDate) : null;
    if (input.targetDate && !next) throw new ApiError(400, 'That date is not valid', 'invalid_date');
    const current = milestone.targetDate ? dayKey(milestone.targetDate) : null;
    const nextKey = next ? dayKey(next) : null;
    if (nextKey !== current) {
      milestone.targetDate = next;
      changed = true;
    }
  }
  if (!changed) {
    const counts = await countsFor(projectId);
    return present(milestone, counts.get(String(milestone._id)) ?? { total: 0, done: 0 }, actor);
  }
  await milestone.save();
  await recordActivity(
    {
      workspaceId: String(project.workspace),
      projectId: String(project._id),
      actorId: actor.id,
      type: 'milestone.updated',
      message: `${actor.name} updated the milestone ${milestone.name} on ${project.key}`,
    },
    rt,
  );
  rt?.toWorkspace(String(project.workspace), 'milestone:changed', { projectId: String(project._id) });
  const counts = await countsFor(projectId);
  return present(milestone, counts.get(String(milestone._id)) ?? { total: 0, done: 0 }, actor);
}

export async function deleteMilestone(
  projectId: string,
  milestoneId: string,
  actor: { id: string; name: string; role: Role },
  rt?: Realtime,
) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  if (project.archivedAt) throw new ApiError(409, 'This project is archived', 'project_archived');
  const milestone = await Milestone.findOne({ _id: milestoneId, project: projectId });
  if (!milestone) throw new ApiError(404, 'Milestone not found', 'not_found');
  const canDelete = String(milestone.createdBy) === actor.id || roleRank(actor.role) >= roleRank('admin');
  if (!canDelete) throw new ApiError(403, 'You do not have permission to delete that milestone', 'forbidden');
  await Issue.updateMany({ milestone: milestone._id }, { $set: { milestone: null } });
  const name = milestone.name;
  await milestone.deleteOne();
  await recordActivity(
    {
      workspaceId: String(project.workspace),
      projectId: String(project._id),
      actorId: actor.id,
      type: 'milestone.deleted',
      message: `${actor.name} removed the milestone ${name} from ${project.key}`,
    },
    rt,
  );
  rt?.toWorkspace(String(project.workspace), 'milestone:changed', { projectId: String(project._id) });
}
