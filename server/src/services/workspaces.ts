import { env } from '../config';
import { canAssignRole, canManageTarget, type InviteRole, type Role } from '../constants';
import { ApiError, isDuplicateKey } from '../errors';
import { Activity } from '../models/Activity';
import { Comment } from '../models/Comment';
import { Invite } from '../models/Invite';
import { Issue } from '../models/Issue';
import { Label } from '../models/Label';
import { Membership } from '../models/Membership';
import { Notification } from '../models/Notification';
import { Project } from '../models/Project';
import { SavedView } from '../models/SavedView';
import { User } from '../models/User';
import { Workspace } from '../models/Workspace';
import type { Realtime } from '../realtime';
import { serializeUser, serializeWorkspace } from '../serializers';
import { hashInviteToken, newInviteToken, slugify } from '../utils';
import { recordActivity } from './activity';
import { assertLastOwner } from './membership';
import { notifyUsers } from './notifications';

async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const exists = await Workspace.exists({ slug });
    if (!exists) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function countsFor(workspaceIds: unknown[]) {
  const [members, projects, openIssues] = await Promise.all([
    Membership.aggregate<{ _id: unknown; count: number }>([
      { $match: { workspace: { $in: workspaceIds } } },
      { $group: { _id: '$workspace', count: { $sum: 1 } } },
    ]),
    Project.aggregate<{ _id: unknown; count: number }>([
      { $match: { workspace: { $in: workspaceIds } } },
      { $group: { _id: '$workspace', count: { $sum: 1 } } },
    ]),
    Issue.aggregate<{ _id: unknown; count: number }>([
      { $match: { workspace: { $in: workspaceIds }, status: { $ne: 'done' } } },
      { $group: { _id: '$workspace', count: { $sum: 1 } } },
    ]),
  ]);
  const toMap = (rows: { _id: unknown; count: number }[]) => new Map(rows.map((row) => [String(row._id), row.count]));
  return { members: toMap(members), projects: toMap(projects), openIssues: toMap(openIssues) };
}

export async function listWorkspaces(userId: string) {
  const memberships = await Membership.find({ user: userId }).lean();
  const roleByWorkspace = new Map(memberships.map((membership) => [String(membership.workspace), membership.role]));
  const ids = memberships.map((membership) => membership.workspace);
  const workspaces = await Workspace.find({ _id: { $in: ids } }).sort({ name: 1 }).lean();
  const counts = await countsFor(ids);
  return workspaces.map((workspace) => {
    const id = String(workspace._id);
    return serializeWorkspace(workspace, {
      role: roleByWorkspace.get(id) ?? 'member',
      memberCount: counts.members.get(id) ?? 0,
      projectCount: counts.projects.get(id) ?? 0,
      openIssueCount: counts.openIssues.get(id) ?? 0,
    });
  });
}

export async function createWorkspace(actor: { id: string; name: string }, name: string, description: string, rt?: Realtime) {
  const workspace = await Workspace.create({
    name,
    slug: await uniqueSlug(name),
    description,
    createdBy: actor.id,
  });
  await Membership.create({ workspace: workspace._id, user: actor.id, role: 'owner' });
  await recordActivity(
    {
      workspaceId: String(workspace._id),
      actorId: actor.id,
      type: 'workspace.created',
      message: `${actor.name} created ${workspace.name}`,
    },
    rt,
  );
  return serializeWorkspace(workspace, { role: 'owner', memberCount: 1, projectCount: 0, openIssueCount: 0 });
}

export async function getWorkspace(workspaceId: string, role: Role) {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw new ApiError(404, 'Workspace not found', 'not_found');
  const counts = await countsFor([workspace._id]);
  const id = String(workspace._id);
  return serializeWorkspace(workspace, {
    role,
    memberCount: counts.members.get(id) ?? 0,
    projectCount: counts.projects.get(id) ?? 0,
    openIssueCount: counts.openIssues.get(id) ?? 0,
  });
}

export async function updateWorkspace(
  workspaceId: string,
  actor: { id: string; name: string },
  input: { name?: string; description?: string },
  rt?: Realtime,
) {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new ApiError(404, 'Workspace not found', 'not_found');
  if (input.name) workspace.name = input.name;
  if (input.description !== undefined) workspace.description = input.description;
  await workspace.save();
  await recordActivity(
    {
      workspaceId,
      actorId: actor.id,
      type: 'workspace.updated',
      message: `${actor.name} updated workspace settings`,
    },
    rt,
  );
  const role = (await Membership.findOne({ workspace: workspaceId, user: actor.id }).lean())?.role ?? 'member';
  return getWorkspace(workspaceId, role);
}

export async function deleteWorkspace(workspaceId: string) {
  const projectIds = await Project.find({ workspace: workspaceId }).distinct('_id');
  await Promise.all([
    Comment.deleteMany({ workspace: workspaceId }),
    Issue.deleteMany({ workspace: workspaceId }),
    Activity.deleteMany({ workspace: workspaceId }),
    Label.deleteMany({ workspace: workspaceId }),
    Invite.deleteMany({ workspace: workspaceId }),
    Membership.deleteMany({ workspace: workspaceId }),
    Notification.deleteMany({ workspace: workspaceId }),
    SavedView.deleteMany({ workspace: workspaceId }),
    Project.deleteMany({ _id: { $in: projectIds } }),
    Workspace.deleteOne({ _id: workspaceId }),
  ]);
}

export async function listMembers(workspaceId: string) {
  const memberships = await Membership.find({ workspace: workspaceId })
    .sort({ createdAt: 1 })
    .populate('user', 'name email avatarColor')
    .lean();
  return memberships.map((membership) => ({
    id: String(membership._id),
    role: membership.role,
    createdAt: membership.createdAt,
    user: serializeUser(membership.user as unknown as Parameters<typeof serializeUser>[0]),
  }));
}

export async function listInvites(workspaceId: string) {
  const invites = await Invite.find({ workspace: workspaceId, acceptedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();
  return invites.map((invite) => ({
    id: String(invite._id),
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  }));
}

async function addMember(
  workspaceId: string,
  user: { _id: unknown; name: string; email: string },
  role: InviteRole,
  actor: { id: string; name: string },
  rt?: Realtime,
) {
  const existing = await Membership.findOne({ workspace: workspaceId, user: user._id }).lean();
  if (existing) throw new ApiError(409, 'That person is already a member', 'already_member');
  await Membership.create({ workspace: workspaceId, user: user._id, role });
  const workspace = await Workspace.findById(workspaceId).select('name');
  await recordActivity(
    {
      workspaceId,
      actorId: actor.id,
      type: 'member.joined',
      message: `${user.name} joined ${workspace?.name ?? 'the workspace'} as ${role}`,
    },
    rt,
  );
  await notifyUsers(
    {
      userIds: [String(user._id)],
      workspaceId,
      actorId: actor.id,
      type: 'member.joined',
      message: `${actor.name} added you to ${workspace?.name ?? 'a workspace'}`,
      link: `/w/${workspaceId}`,
    },
    rt,
  );
}

export async function inviteMember(
  workspaceId: string,
  actor: { id: string; name: string },
  actorRole: Role,
  email: string,
  role: InviteRole,
  rt?: Realtime,
) {
  if (!canAssignRole(actorRole, role)) {
    throw new ApiError(403, 'You cannot invite someone with that role', 'forbidden');
  }
  const existingUser = await User.findOne({ email }).lean();
  if (existingUser) {
    await addMember(workspaceId, existingUser, role, actor, rt);
    return { kind: 'member' as const, email, role };
  }

  const { token, tokenHash } = newInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await Invite.deleteMany({ workspace: workspaceId, email, acceptedAt: null });
  const invite = await Invite.create({
    workspace: workspaceId,
    email,
    role,
    tokenHash,
    invitedBy: actor.id,
    expiresAt,
  });
  return {
    kind: 'invite' as const,
    invite: {
      id: String(invite._id),
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    },
    url: `${env.clientOrigin}/invite/${token}`,
  };
}

export async function previewInvite(token: string) {
  const invite = await Invite.findOne({ tokenHash: hashInviteToken(token) }).lean();
  if (!invite) throw new ApiError(404, 'Invite not found', 'not_found');
  const workspace = await Workspace.findById(invite.workspace).select('name').lean();
  const expired = invite.expiresAt.getTime() < Date.now();
  return {
    email: invite.email,
    role: invite.role,
    workspaceName: workspace?.name ?? 'Workspace',
    workspaceId: String(invite.workspace),
    expired,
    accepted: Boolean(invite.acceptedAt),
  };
}

export async function acceptInvite(token: string, actor: { id: string; name: string; email: string }, rt?: Realtime) {
  const invite = await Invite.findOne({ tokenHash: hashInviteToken(token) });
  if (!invite) throw new ApiError(404, 'Invite not found', 'not_found');
  if (invite.acceptedAt) throw new ApiError(409, 'This invite has already been used', 'invite_used');
  if (invite.expiresAt.getTime() < Date.now()) throw new ApiError(410, 'This invite has expired', 'invite_expired');
  if (invite.email !== actor.email) {
    throw new ApiError(403, 'This invite was sent to a different email address', 'invite_email_mismatch');
  }
  const existing = await Membership.findOne({ workspace: invite.workspace, user: actor.id }).lean();
  if (!existing) {
    await Membership.create({ workspace: invite.workspace, user: actor.id, role: invite.role });
  }
  invite.acceptedAt = new Date();
  await invite.save();
  const workspace = await Workspace.findById(invite.workspace).select('name');
  await recordActivity(
    {
      workspaceId: String(invite.workspace),
      actorId: actor.id,
      type: 'member.joined',
      message: `${actor.name} joined ${workspace?.name ?? 'the workspace'}`,
    },
    rt,
  );
  if (String(invite.invitedBy) !== actor.id) {
    await notifyUsers(
      {
        userIds: [String(invite.invitedBy)],
        workspaceId: String(invite.workspace),
        actorId: actor.id,
        type: 'member.joined',
        message: `${actor.name} accepted your invite to ${workspace?.name ?? 'the workspace'}`,
        link: `/w/${invite.workspace}/members`,
      },
      rt,
    );
  }
  return { workspaceId: String(invite.workspace), role: existing?.role ?? invite.role };
}

export async function updateMemberRole(
  workspaceId: string,
  targetUserId: string,
  actor: { id: string; name: string },
  actorRole: Role,
  role: Role,
  rt?: Realtime,
) {
  const target = await Membership.findOne({ workspace: workspaceId, user: targetUserId });
  if (!target) throw new ApiError(404, 'Member not found', 'not_found');
  if (!canManageTarget(actorRole, target.role) || !canAssignRole(actorRole, role)) {
    throw new ApiError(403, 'You cannot change that role', 'forbidden');
  }
  if (target.role === 'owner' && role !== 'owner') await assertLastOwner(workspaceId, targetUserId);
  if (target.role === role) return listMembers(workspaceId);
  target.role = role;
  await target.save();
  const user = await User.findById(targetUserId).select('name');
  await recordActivity(
    {
      workspaceId,
      actorId: actor.id,
      type: 'member.role_changed',
      message: `${actor.name} changed ${user?.name ?? 'a member'} to ${role}`,
    },
    rt,
  );
  return listMembers(workspaceId);
}

export async function removeMember(
  workspaceId: string,
  targetUserId: string,
  actor: { id: string; name: string },
  actorRole: Role,
  rt?: Realtime,
) {
  const target = await Membership.findOne({ workspace: workspaceId, user: targetUserId });
  if (!target) throw new ApiError(404, 'Member not found', 'not_found');
  const self = actor.id === targetUserId;
  if (!self && !canManageTarget(actorRole, target.role)) {
    throw new ApiError(403, 'You cannot remove that member', 'forbidden');
  }
  await assertLastOwner(workspaceId, targetUserId);
  const user = await User.findById(targetUserId).select('name');
  await target.deleteOne();
  await Issue.updateMany({ workspace: workspaceId, assignees: targetUserId }, { $pull: { assignees: targetUserId } });
  await recordActivity(
    {
      workspaceId,
      actorId: actor.id,
      type: 'member.removed',
      message: self
        ? `${actor.name} left the workspace`
        : `${actor.name} removed ${user?.name ?? 'a member'}`,
    },
    rt,
  );
}

export async function revokeInvite(workspaceId: string, inviteId: string) {
  const result = await Invite.deleteOne({ _id: inviteId, workspace: workspaceId, acceptedAt: null });
  if (!result.deletedCount) throw new ApiError(404, 'Invite not found', 'not_found');
}

export async function createLabel(workspaceId: string, actorId: string, name: string, color: string) {
  try {
    const label = await Label.create({ workspace: workspaceId, name, color, createdBy: actorId });
    return { id: String(label._id), name: label.name, color: label.color };
  } catch (error) {
    if (isDuplicateKey(error)) throw new ApiError(409, 'A label with that name already exists', 'duplicate_label');
    throw error;
  }
}

export async function listLabels(workspaceId: string) {
  const labels = await Label.find({ workspace: workspaceId }).sort({ name: 1 }).lean();
  return labels.map((label) => ({ id: String(label._id), name: label.name, color: label.color }));
}

export async function deleteLabel(workspaceId: string, labelId: string) {
  const label = await Label.findOne({ _id: labelId, workspace: workspaceId });
  if (!label) throw new ApiError(404, 'Label not found', 'not_found');
  await Issue.updateMany({ workspace: workspaceId, labels: label._id }, { $pull: { labels: label._id } });
  await label.deleteOne();
}
