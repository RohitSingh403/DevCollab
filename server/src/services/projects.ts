import mongoose from 'mongoose';
import { PROJECT_COLORS, colorForKey } from '../constants';
import { ApiError, isDuplicateKey } from '../errors';
import { Comment } from '../models/Comment';
import { Cycle } from '../models/Cycle';
import { Milestone } from '../models/Milestone';
import { IssueTemplate } from '../models/IssueTemplate';
import { SavedView } from '../models/SavedView';
import { Issue } from '../models/Issue';
import { Membership } from '../models/Membership';
import { Project } from '../models/Project';
import { User } from '../models/User';
import type { Realtime } from '../realtime';
import { recordActivity } from './activity';
import { clearTargetFavorites } from './favorites';
import { clearIssueRecent } from './recent';
import { clearIssueSnoozes } from './snooze';
import { clearBlockerRefs } from './blockers';
import { clearRelatedRefs } from './related';

function storedColor(key: string, color?: string | null) {
  return color && (PROJECT_COLORS as readonly string[]).includes(color) ? color : colorForKey(key);
}

function presentLead(lead: unknown) {
  if (!lead || typeof lead !== 'object') return null;
  const person = lead as { _id?: unknown; name?: string; avatarColor?: string };
  if (!person._id || !person.name) return null;
  return { id: String(person._id), name: person.name, avatarColor: person.avatarColor ?? '#64748b' };
}

async function memberLead(workspaceId: string, leadId: string) {
  const member = await Membership.exists({ workspace: workspaceId, user: leadId });
  if (!member) throw new ApiError(400, 'Choose a member of this workspace', 'invalid_lead');
  return leadId;
}

function presentProject(
  project: {
    _id: unknown;
    workspace: unknown;
    name: string;
    key: string;
    description?: string;
    color?: string | null;
    lead?: unknown;
    archivedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  tally: { total: number; open: number },
) {
  return {
    id: String(project._id),
    workspaceId: String(project.workspace),
    name: project.name,
    key: project.key,
    description: project.description ?? '',
    color: storedColor(project.key, project.color),
    lead: presentLead(project.lead),
    archived: Boolean(project.archivedAt),
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    issueCount: tally.total,
    openIssueCount: tally.open,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export async function archivedProjectIds(workspaceId: string) {
  return Project.find({ workspace: workspaceId, archivedAt: { $ne: null } }).distinct('_id');
}

export async function listProjects(workspaceId: string) {
  const projects = await Project.find({ workspace: workspaceId }).sort({ archivedAt: 1, name: 1 }).populate('lead', 'name avatarColor').lean();
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
  return projects.map((project) => presentProject(project, byProject.get(String(project._id)) ?? { total: 0, open: 0 }));
}

export async function createProject(
  workspaceId: string,
  actor: { id: string; name: string },
  input: { name: string; key: string; description: string; color?: string; leadId?: string },
  rt?: Realtime,
) {
  const lead = input.leadId ? await memberLead(workspaceId, input.leadId) : null;
  try {
    const project = await Project.create({
      workspace: workspaceId,
      name: input.name,
      key: input.key,
      description: input.description,
      color: storedColor(input.key, input.color),
      lead,
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
    return getProject(String(project._id));
  } catch (error) {
    if (isDuplicateKey(error)) throw new ApiError(409, 'A project with that key already exists', 'duplicate_key');
    throw error;
  }
}

export async function getProject(projectId: string) {
  const project = await Project.findById(projectId).populate('lead', 'name avatarColor').lean();
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const [issueCount, openIssueCount] = await Promise.all([
    Issue.countDocuments({ project: projectId }),
    Issue.countDocuments({ project: projectId, status: { $ne: 'done' } }),
  ]);
  return presentProject(project, { total: issueCount, open: openIssueCount });
}

export async function updateProject(
  projectId: string,
  actor: { id: string; name: string },
  input: { name?: string; description?: string; archived?: boolean; color?: string; leadId?: string | null },
  rt?: Realtime,
) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const nameChanged = input.name !== undefined && input.name !== project.name;
  const descriptionChanged = input.description !== undefined && input.description !== (project.description ?? '');
  const nextColor = input.color !== undefined ? input.color : storedColor(project.key, project.color);
  const colorChanged = nextColor !== storedColor(project.key, project.color);
  const currentLead = project.lead ? String(project.lead) : null;
  const nextLead = input.leadId === undefined ? currentLead : input.leadId === null ? null : await memberLead(String(project.workspace), input.leadId);
  const leadChanged = nextLead !== currentLead;
  let action: 'updated' | 'archived' | 'restored' = 'updated';
  if (input.archived === true && !project.archivedAt) {
    project.archivedAt = new Date();
    action = 'archived';
  } else if (input.archived === false && project.archivedAt) {
    project.archivedAt = null;
    action = 'restored';
  }
  if (!nameChanged && !descriptionChanged && !colorChanged && !leadChanged && action === 'updated') return getProject(projectId);
  if (nameChanged && input.name) project.name = input.name;
  if (descriptionChanged) project.description = input.description ?? '';
  if (colorChanged) project.color = nextColor;
  if (leadChanged) project.set('lead', nextLead);
  await project.save();
  const leadName = nextLead ? (await User.findById(nextLead).select('name').lean())?.name ?? 'a member' : '';
  const message =
    action === 'updated'
      ? nameChanged
        ? `${actor.name} renamed ${project.key} to ${project.name}`
        : descriptionChanged
          ? `${actor.name} updated the description of ${project.key}`
          : leadChanged
            ? nextLead
              ? `${actor.name} made ${leadName} the lead of ${project.key}`
              : `${actor.name} cleared the lead of ${project.key}`
            : `${actor.name} recolored ${project.key}`
      : `${actor.name} ${action} project ${project.key}`;
  await recordActivity(
    {
      workspaceId: String(project.workspace),
      projectId,
      actorId: actor.id,
      type: 'project.updated',
      message,
    },
    rt,
  );
  rt?.toWorkspace(String(project.workspace), 'project:updated', { projectId });
  return getProject(projectId);
}

export async function deleteProject(projectId: string, actor: { id: string; name: string }, rt?: Realtime) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  const doomed = await Issue.find({ project: project._id }).distinct('_id');
  await clearBlockerRefs(doomed.map((id) => String(id)), rt);
  await clearRelatedRefs(doomed.map((id) => String(id)));
  await Comment.deleteMany({ project: project._id });
  await Issue.deleteMany({ project: project._id });
  await SavedView.deleteMany({ project: project._id });
  await IssueTemplate.deleteMany({ project: project._id });
  await Cycle.deleteMany({ project: project._id });
  await Milestone.deleteMany({ project: project._id });
  await clearTargetFavorites({ projectId, issueIds: doomed.map((id) => String(id)) });
  await clearIssueRecent(doomed.map((id) => String(id)));
  await clearIssueSnoozes(doomed.map((id) => String(id)));
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
