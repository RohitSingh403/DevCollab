import { Notification } from '../models/Notification';
import { NotificationPreference } from '../models/NotificationPreference';
import type { Realtime } from '../realtime';
import { serializeNotification } from '../serializers';

const PREFERENCE_KEYS = ['assignments', 'comments', 'mentions', 'status', 'blockers', 'reminders'] as const;
type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

const TYPE_PREFERENCE: Record<string, PreferenceKey> = {
  'issue.assigned': 'assignments',
  'comment.created': 'comments',
  'comment.mentioned': 'mentions',
  'issue.status': 'status',
  'issue.blocked': 'blockers',
  'issue.unblocked': 'blockers',
  'issue.due': 'reminders',
  'issue.overdue': 'reminders',
};

function preferenceDefaults(doc?: {
  assignments?: boolean;
  comments?: boolean;
  mentions?: boolean;
  status?: boolean;
  blockers?: boolean;
  reminders?: boolean;
} | null) {
  return {
    assignments: doc?.assignments ?? true,
    comments: doc?.comments ?? true,
    mentions: doc?.mentions ?? true,
    status: doc?.status ?? true,
    blockers: doc?.blockers ?? true,
    reminders: doc?.reminders ?? true,
  };
}

export async function getNotificationPreferences(userId: string) {
  const doc = await NotificationPreference.findOne({ user: userId });
  return preferenceDefaults(doc);
}

export async function updateNotificationPreferences(
  userId: string,
  input: Partial<Record<PreferenceKey, boolean>>,
) {
  const doc = await NotificationPreference.findOneAndUpdate(
    { user: userId },
    { $set: input, $setOnInsert: { user: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return preferenceDefaults(doc);
}

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
  let unique = [...new Set(input.userIds.filter((id) => id && id !== input.actorId))];
  const preference = TYPE_PREFERENCE[input.type];
  if (preference && unique.length) {
    const muted = await NotificationPreference.find({ user: { $in: unique }, [preference]: false }).select('user');
    const skipped = new Set(muted.map((item) => String(item.user)));
    unique = unique.filter((id) => !skipped.has(id));
  }
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
