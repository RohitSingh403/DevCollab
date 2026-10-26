import { Activity } from '../models/Activity';
import type { Realtime } from '../realtime';
import { serializeActivity } from '../serializers';

export async function recordActivity(
  input: {
    workspaceId: string;
    projectId?: string | null;
    issueId?: string | null;
    actorId: string;
    type: string;
    message: string;
  },
  rt?: Realtime,
) {
  const doc = await Activity.create({
    workspace: input.workspaceId,
    project: input.projectId ?? null,
    issue: input.issueId ?? null,
    actor: input.actorId,
    type: input.type,
    message: input.message,
  });
  const populated = await doc.populate('actor', 'name email avatarColor');
  const dto = serializeActivity(populated);
  rt?.toWorkspace(input.workspaceId, 'activity:created', dto);
  return dto;
}
