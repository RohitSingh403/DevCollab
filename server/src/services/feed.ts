import { Activity } from '../models/Activity';
import { Notification } from '../models/Notification';
import { serializeActivity, serializeNotification } from '../serializers';
import { pageMeta } from '../utils';

export async function listActivity(filter: { workspace?: string; project?: string; issue?: string }, page: number, limit: number) {
  const query = Object.fromEntries(Object.entries(filter).filter(([, value]) => value));
  const [total, rows] = await Promise.all([
    Activity.countDocuments(query),
    Activity.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name email avatarColor'),
  ]);
  return { activities: rows.map((row) => serializeActivity(row)), ...pageMeta(page, limit, total) };
}

export async function listNotifications(userId: string, limit: number) {
  const [notifications, unread] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ user: userId, read: false }),
  ]);
  return { notifications: notifications.map((item) => serializeNotification(item)), unread };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { read: true },
    { new: true },
  );
  if (!notification) return null;
  return serializeNotification(notification);
}

export async function markAllNotificationsRead(userId: string) {
  await Notification.updateMany({ user: userId, read: false }, { read: true });
}
