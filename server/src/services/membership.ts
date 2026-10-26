import { roleRank, type Role } from '../constants';
import { ApiError } from '../errors';
import { Membership } from '../models/Membership';

export async function membershipFor(userId: string, workspaceId: string, minRole: Role = 'member') {
  const membership = await Membership.findOne({ workspace: workspaceId, user: userId }).lean();
  if (!membership) throw new ApiError(404, 'Workspace not found', 'not_found');
  if (roleRank(membership.role) < roleRank(minRole)) {
    throw new ApiError(403, 'You do not have permission to do that', 'forbidden');
  }
  return membership;
}

export async function assertWorkspaceMembers(workspaceId: string, userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return unique;
  const count = await Membership.countDocuments({ workspace: workspaceId, user: { $in: unique } });
  if (count !== unique.length) {
    throw new ApiError(400, 'Assignees must be members of this workspace', 'invalid_assignees');
  }
  return unique;
}

export async function assertLastOwner(workspaceId: string, userId: string) {
  const target = await Membership.findOne({ workspace: workspaceId, user: userId }).lean();
  if (!target || target.role !== 'owner') return;
  const owners = await Membership.countDocuments({ workspace: workspaceId, role: 'owner' });
  if (owners <= 1) {
    throw new ApiError(409, 'The workspace needs at least one owner', 'last_owner');
  }
}
