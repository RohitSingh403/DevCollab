import { Notification } from '../models/Notification';
import type { Realtime } from '../realtime';
import { serializeNotification } from '../serializers';

export async function notifyUsers(
  input: {
    userIds: string[];
    workspaceId: string;
    actorId?: string;
    type: string;
    message: string;
    link?: string;
  },
  rt?: Realtime,
) {
  const unique = [...new Set(input.userIds.filter((id) => id && id !== input.actorId))];
  if (!unique.length) return [];
  const docs = await Notification.insertMany(
    unique.map((userId) => ({
      user: userId,
      workspace: input.workspaceId,
      actor: input.actorId ?? null,
      type: input.type,
      message: input.message,
      link: input.link ?? '',
      read: false,
    })),
  );
  return docs.map((doc, index) => {
    const dto = serializeNotification(doc);
    rt?.toUser(unique[index], 'notification:created', dto);
    return dto;
  });
}
