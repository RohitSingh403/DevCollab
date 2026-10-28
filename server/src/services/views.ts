import { roleRank, type Role } from '../constants';
import { ApiError, isDuplicateKey } from '../errors';
import { Project } from '../models/Project';
import { SavedView } from '../models/SavedView';
import type { Realtime } from '../realtime';
import { assertWorkspaceMembers } from './membership';

const VIEW_LIMIT = 20;

export interface ViewFilters {
  status: string;
  priority: string;
  assignee: string;
  overdue: boolean;
  q: string;
  layout: 'board' | 'list';
}

function hasFilter(filters: ViewFilters) {
  return Boolean(filters.status || filters.priority || filters.assignee || filters.overdue || filters.q || filters.layout === 'list');
}

function serialize(
  view: {
    _id: unknown;
    name: string;
    shared: boolean;
    filters: ViewFilters;
    createdBy: unknown;
  },
  userId: string,
  role: Role,
) {
  const author = view.createdBy as { _id?: unknown; name?: string } | null;
  const authorId = String(author && typeof author === 'object' && author._id ? author._id : view.createdBy);
  const mine = authorId === userId;
  const shared = Boolean(view.shared);
  return {
    id: String(view._id),
    name: view.name,
    shared,
    mine,
    canDelete: mine || (shared && roleRank(role) >= roleRank('admin')),
    createdBy: { id: authorId, name: author && typeof author === 'object' && author.name ? author.name : '' },
    filters: {
      status: view.filters.status ?? '',
      priority: view.filters.priority ?? '',
      assignee: view.filters.assignee ?? '',
      overdue: Boolean(view.filters.overdue),
      q: view.filters.q ?? '',
      layout: view.filters.layout === 'list' ? 'list' : 'board',
    },
  };
}

async function loadProject(projectId: string) {
  const project = await Project.findById(projectId).select('workspace');
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  return project;
}

export async function listViews(projectId: string, userId: string, role: Role) {
  await loadProject(projectId);
  const rows = await SavedView.find({
    project: projectId,
    $or: [{ createdBy: userId }, { shared: true }],
  })
    .sort({ shared: 1, name: 1 })
    .populate('createdBy', 'name');
  return rows.map((row) => serialize(row, userId, role));
}

export async function createView(
  projectId: string,
  actor: { id: string; name: string },
  role: Role,
  input: { name: string; shared: boolean; filters: ViewFilters },
  rt?: Realtime,
) {
  if (!hasFilter(input.filters)) {
    throw new ApiError(400, 'Choose at least one filter before saving a view', 'empty_view');
  }
  const project = await loadProject(projectId);
  const workspaceId = String(project.workspace);
  if (input.filters.assignee && input.filters.assignee !== 'me') {
    await assertWorkspaceMembers(workspaceId, [input.filters.assignee]);
  }
  const existing = await SavedView.countDocuments({ project: projectId, createdBy: actor.id });
  if (existing >= VIEW_LIMIT) {
    throw new ApiError(409, 'You already have 20 saved views on this project', 'view_limit');
  }
  try {
    const view = await SavedView.create({
      workspace: workspaceId,
      project: projectId,
      createdBy: actor.id,
      name: input.name,
      shared: input.shared,
      filters: input.filters,
    });
    await view.populate('createdBy', 'name');
    const dto = serialize(view, actor.id, role);
    rt?.toWorkspace(workspaceId, 'view:saved', { projectId, viewId: dto.id });
    return dto;
  } catch (error) {
    if (isDuplicateKey(error)) throw new ApiError(409, 'You already have a view with that name', 'duplicate_view');
    throw error;
  }
}

export async function deleteView(
  projectId: string,
  viewId: string,
  actorId: string,
  role: Role,
  rt?: Realtime,
) {
  const project = await loadProject(projectId);
  const view = await SavedView.findOne({ _id: viewId, project: projectId });
  if (!view) throw new ApiError(404, 'View not found', 'not_found');
  const mine = String(view.createdBy) === actorId;
  if (!mine && !view.shared) throw new ApiError(404, 'View not found', 'not_found');
  if (!mine && roleRank(role) < roleRank('admin')) {
    throw new ApiError(403, 'You can only delete your own views', 'forbidden');
  }
  await view.deleteOne();
  rt?.toWorkspace(String(project.workspace), 'view:deleted', { projectId, viewId });
}
