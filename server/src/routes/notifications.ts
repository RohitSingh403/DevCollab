import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../asyncHandler';
import { ApiError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/feed';
import { getNotificationPreferences, updateNotificationPreferences } from '../services/notifications';
import { updateNotificationPreferencesSchema } from '../schemas';
import { parseBody } from '../validate';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    res.json({ preferences: await getNotificationPreferences(req.authUser!.id) });
  }),
);

notificationRouter.patch(
  '/preferences',
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateNotificationPreferencesSchema.parse>>(updateNotificationPreferencesSchema, req.body);
    res.json({ preferences: await updateNotificationPreferences(req.authUser!.id, input) });
  }),
);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    res.json(await listNotifications(req.authUser!.id, query.limit));
  }),
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllNotificationsRead(req.authUser!.id);
    res.status(204).send();
  }),
);

notificationRouter.patch(
  '/:notificationId/read',
  asyncHandler(async (req, res) => {
    const notification = await markNotificationRead(req.authUser!.id, req.params.notificationId);
    if (!notification) throw new ApiError(404, 'Notification not found', 'not_found');
    res.json({ notification });
  }),
);
