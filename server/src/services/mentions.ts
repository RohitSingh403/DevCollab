import { Membership } from '../models/Membership';

const BOUNDARY = /[\s.,!?;:()[\]{}"']/;

export async function workspaceMembers(workspaceId: string) {
  const rows = await Membership.find({ workspace: workspaceId }).populate('user', 'name');
  return rows.flatMap((row) => {
    const user = row.user as unknown as { _id?: unknown; name?: string } | null;
    if (!user?.name) return [];
    return [{ id: String(user._id), name: user.name.trim() }];
  });
}

export function mentionedUserIds(body: string, members: { id: string; name: string }[]) {
  const sorted = members
    .filter((member) => member.name.length >= 2)
    .sort((left, right) => right.name.length - left.name.length);
  const ids = new Set<string>();
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '@') continue;
    if (index > 0 && /[\w@]/.test(body[index - 1] ?? '')) continue;
    const after = body.slice(index + 1);
    for (const member of sorted) {
      if (after.length < member.name.length) continue;
      if (after.slice(0, member.name.length).toLowerCase() !== member.name.toLowerCase()) continue;
      const next = after[member.name.length];
      if (next && !BOUNDARY.test(next)) continue;
      ids.add(member.id);
      break;
    }
  }
  return [...ids];
}
