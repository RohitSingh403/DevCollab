import { roleRank, type IssueStatus, type Priority, type Role } from '../constants';
import { ApiError, isDuplicateKey } from '../errors';
import { IssueTemplate } from '../models/IssueTemplate';
import { Project } from '../models/Project';
import { serializeLabel } from '../serializers';
import { assertLabels } from './issues';

const TEMPLATE_LIMIT = 12;

function hasContent(input: {
  title: string;
  description: string;
  checklist: string[];
  labelIds: string[];
  estimate?: number | null;
  priority: Priority;
  status: IssueStatus;
}) {
  return Boolean(
    input.title ||
      input.description ||
      input.checklist.length ||
      input.labelIds.length ||
      input.estimate != null ||
      input.priority !== 'medium' ||
      input.status !== 'backlog',
  );
}

function serialize(template: {
  _id: unknown;
  name: string;
  title?: string;
  description?: string;
  status: IssueStatus;
  priority: Priority;
  estimate?: number | null;
  labels?: unknown[];
  checklist?: { text?: string }[];
  createdBy: unknown;
}) {
  const author = template.createdBy as { _id?: unknown; name?: string } | string;
  const authorId = String(author && typeof author === 'object' && author._id ? author._id : author);
  return {
    id: String(template._id),
    name: template.name,
    title: template.title ?? '',
    description: template.description ?? '',
    status: template.status,
    priority: template.priority,
    estimate: typeof template.estimate === 'number' ? template.estimate : null,
    labels: (template.labels ?? []).map((label) => serializeLabel(label as Parameters<typeof serializeLabel>[0])),
    checklist: (template.checklist ?? []).map((step) => step.text ?? '').filter(Boolean),
    createdBy: { id: authorId, name: author && typeof author === 'object' && author.name ? author.name : '' },
  };
}

async function loadProject(projectId: string) {
  const project = await Project.findById(projectId).select('workspace');
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  return project;
}

export async function listTemplates(projectId: string, userId: string, role: Role) {
  await loadProject(projectId);
  const rows = await IssueTemplate.find({ project: projectId }).sort({ name: 1 }).populate('createdBy', 'name').populate('labels', 'name color');
  return rows.map((row) => {
    const dto = serialize(row);
    const mine = dto.createdBy.id === userId;
    return { ...dto, mine, canDelete: mine || roleRank(role) >= roleRank('admin') };
  });
}

export async function createTemplate(
  projectId: string,
  actor: { id: string; name: string },
  input: {
    name: string;
    title: string;
    description: string;
    status: IssueStatus;
    priority: Priority;
    estimate?: number | null;
    labelIds: string[];
    checklist: string[];
  },
) {
  if (!hasContent(input)) {
    throw new ApiError(400, 'Add a title, description, label, or checklist before saving a template', 'empty_template');
  }
  const project = await loadProject(projectId);
  const workspaceId = String(project.workspace);
  const labelIds = await assertLabels(workspaceId, input.labelIds);
  const existing = await IssueTemplate.countDocuments({ project: projectId });
  if (existing >= TEMPLATE_LIMIT) {
    throw new ApiError(409, 'This project already has 12 templates', 'template_limit');
  }
  const clash = await IssueTemplate.findOne({ project: projectId, name: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (clash) throw new ApiError(409, 'This project already has a template with that name', 'duplicate_template');
  try {
    const template = await IssueTemplate.create({
      workspace: workspaceId,
      project: projectId,
      createdBy: actor.id,
      name: input.name,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      estimate: input.estimate ?? null,
      labels: labelIds,
      checklist: input.checklist.map((text) => ({ text })),
    });
    await template.populate('createdBy', 'name');
    await template.populate('labels', 'name color');
    const dto = serialize(template);
    return { ...dto, mine: true, canDelete: true };
  } catch (error) {
    if (isDuplicateKey(error)) throw new ApiError(409, 'This project already has a template with that name', 'duplicate_template');
    throw error;
  }
}

export async function deleteTemplate(projectId: string, templateId: string, actorId: string, role: Role) {
  await loadProject(projectId);
  const template = await IssueTemplate.findOne({ _id: templateId, project: projectId });
  if (!template) throw new ApiError(404, 'Template not found', 'not_found');
  const mine = String(template.createdBy) === actorId;
  if (!mine && roleRank(role) < roleRank('admin')) {
    throw new ApiError(403, 'You can only delete your own templates', 'forbidden');
  }
  await template.deleteOne();
}
