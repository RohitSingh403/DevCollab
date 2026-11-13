import { ApiError } from '../errors';
import { dayKey, parseDay, utcDayStart } from '../dates';
import { Cycle } from '../models/Cycle';
import { Issue } from '../models/Issue';
import { Project } from '../models/Project';
import type { Realtime } from '../realtime';
import { recordActivity } from './activity';

export async function listCycles(projectId: string) {
  const cycles = await Cycle.find({ project: projectId }).sort({ createdAt: -1 });
  if (!cycles.length) return [];
  const counts = await Issue.aggregate<{ _id: { cycle: unknown; status: string }; count: number; points: number }>([
    { $match: { project: cycles[0].project, cycle: { $ne: null } } },
    {
      $group: {
        _id: { cycle: '$cycle', status: '$status' },
        count: { $sum: 1 },
        points: { $sum: { $ifNull: ['$estimate', 0] } },
      },
    },
  ]);
  const byCycle = new Map<string, { total: number; done: number; points: number; pointsDone: number }>();
  for (const row of counts) {
    const id = String(row._id.cycle);
    const current = byCycle.get(id) ?? { total: 0, done: 0, points: 0, pointsDone: 0 };
    current.total += row.count;
    current.points += row.points;
    if (row._id.status === 'done') {
      current.done += row.count;
      current.pointsDone += row.points;
    }
    byCycle.set(id, current);
  }
  return cycles.map((cycle) => serializeCycle(cycle, byCycle.get(String(cycle._id)) ?? { total: 0, done: 0, points: 0, pointsDone: 0 }));
}

export async function activeCycleProgress(projectId: string) {
  const cycles = await listCycles(projectId);
  return cycles.find((cycle) => cycle.status === 'active') ?? null;
}

export async function activeCycleId(projectId: string) {
  const cycle = await Cycle.findOne({ project: projectId, status: 'active' }).sort({ createdAt: -1 }).select('_id');
  return cycle ? String(cycle._id) : null;
}

export async function assertProjectCycle(projectId: string, cycleId: string) {
  const cycle = await Cycle.findOne({ _id: cycleId, project: projectId }).select('_id');
  if (!cycle) throw new ApiError(400, 'That cycle is not in this project', 'invalid_cycle');
  return String(cycle._id);
}

export async function startCycle(
  input: {
    projectId: string;
    actor: { id: string; name: string };
    name: string;
    startsAt: string;
    endsAt: string;
    carryOpen?: boolean;
  },
  rt?: Realtime,
) {
  const project = await Project.findById(input.projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const startsAt = parseDay(input.startsAt);
  const endsAt = parseDay(input.endsAt);
  if (!startsAt || !endsAt || startsAt.getTime() > endsAt.getTime()) {
    throw new ApiError(400, 'A cycle needs a start date on or before its end date', 'invalid_cycle_dates');
  }

  const previous = await Cycle.findOne({ project: project._id, status: 'active' }).sort({ createdAt: -1 });
  if (previous) {
    previous.status = 'completed';
    await previous.save();
  }

  const cycle = await Cycle.create({
    workspace: project.workspace,
    project: project._id,
    name: input.name,
    startsAt,
    endsAt,
    status: 'active',
    createdBy: input.actor.id,
  });

  if (previous && input.carryOpen !== false) {
    await Issue.updateMany({ cycle: previous._id, status: { $ne: 'done' } }, { cycle: cycle._id });
  }

  await recordActivity(
    {
      workspaceId: String(project.workspace),
      projectId: String(project._id),
      actorId: input.actor.id,
      type: 'cycle.started',
      message: `${input.actor.name} started ${cycle.name} on ${project.key}`,
    },
    rt,
  );
  rt?.toWorkspace(String(project.workspace), 'cycle:started', { projectId: String(project._id), cycleId: String(cycle._id) });
  const dto = (await listCycles(String(project._id))).find((item) => item.id === String(cycle._id));
  if (!dto) throw new ApiError(500, 'The cycle could not be loaded', 'internal_error');
  return dto;
}

export async function closeFinishedCycles(now = new Date()) {
  const start = utcDayStart(now);
  await Cycle.updateMany({ status: 'active', endsAt: { $lt: start } }, { status: 'completed' });
}

function serializeCycle(
  cycle: { _id: unknown; name: string; status: 'active' | 'completed'; startsAt: Date; endsAt: Date },
  counts: { total: number; done: number; points: number; pointsDone: number },
) {
  return {
    id: String(cycle._id),
    name: cycle.name,
    status: cycle.status,
    startsAt: dayKey(cycle.startsAt),
    endsAt: dayKey(cycle.endsAt),
    total: counts.total,
    done: counts.done,
    points: counts.points,
    pointsDone: counts.pointsDone,
  };
}
