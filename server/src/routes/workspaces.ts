import { Router } from 'express';
import { asyncHandler } from '../asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireWorkspace } from '../middleware/access';
import {
  createLabelSchema,
  createWorkspaceSchema,
  inviteSchema,
  paginationSchema,
  searchSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
} from '../schemas';
import { buildAnalytics } from '../services/analytics';
import { listActivity } from '../services/feed';
import { searchWorkspaceIssues } from '../services/issues';
import {
  acceptInvite,
  createLabel,
  createWorkspace,
  deleteLabel,
  deleteWorkspace,
  getWorkspace,
  inviteMember,
  listInvites,
  listLabels,
  listMembers,
  listWorkspaces,
  previewInvite,
  removeMember,
  revokeInvite,
  updateMemberRole,
  updateWorkspace,
} from '../services/workspaces';
import { ioFromApp, realtimeFrom } from '../realtime';
import { parseBody } from '../validate';

export const workspaceRouter = Router();
export const inviteRouter = Router();

workspaceRouter.use(requireAuth);

workspaceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ workspaces: await listWorkspaces(req.authUser!.id) });
  }),
);

workspaceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createWorkspaceSchema.parse>>(createWorkspaceSchema, req.body);
    const workspace = await createWorkspace(req.authUser!, input.name, input.description, realtimeFrom(ioFromApp(req.app)));
    res.status(201).json({ workspace });
  }),
);

workspaceRouter.get(
  '/:workspaceId',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    res.json({ workspace: await getWorkspace(req.params.workspaceId, req.membershipRole!) });
  }),
);

workspaceRouter.patch(
  '/:workspaceId',
  requireWorkspace('admin'),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateWorkspaceSchema.parse>>(updateWorkspaceSchema, req.body);
    const workspace = await updateWorkspace(req.params.workspaceId, req.authUser!, input, realtimeFrom(ioFromApp(req.app)));
    res.json({ workspace });
  }),
);

workspaceRouter.delete(
  '/:workspaceId',
  requireWorkspace('owner'),
  asyncHandler(async (req, res) => {
    await deleteWorkspace(req.params.workspaceId);
    res.status(204).send();
  }),
);

workspaceRouter.get(
  '/:workspaceId/members',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    res.json({ members: await listMembers(req.params.workspaceId) });
  }),
);

workspaceRouter.patch(
  '/:workspaceId/members/:userId',
  requireWorkspace('admin'),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateMemberSchema.parse>>(updateMemberSchema, req.body);
    const members = await updateMemberRole(
      req.params.workspaceId,
      req.params.userId,
      req.authUser!,
      req.membershipRole!,
      input.role,
      realtimeFrom(ioFromApp(req.app)),
    );
    res.json({ members });
  }),
);

workspaceRouter.delete(
  '/:workspaceId/members/:userId',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    await removeMember(
      req.params.workspaceId,
      req.params.userId,
      req.authUser!,
      req.membershipRole!,
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(204).send();
  }),
);

workspaceRouter.get(
  '/:workspaceId/invites',
  requireWorkspace('admin'),
  asyncHandler(async (req, res) => {
    res.json({ invites: await listInvites(req.params.workspaceId) });
  }),
);

workspaceRouter.post(
  '/:workspaceId/invites',
  requireWorkspace('admin'),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof inviteSchema.parse>>(inviteSchema, req.body);
    const result = await inviteMember(
      req.params.workspaceId,
      req.authUser!,
      req.membershipRole!,
      input.email,
      input.role,
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(201).json(result);
  }),
);

workspaceRouter.delete(
  '/:workspaceId/invites/:inviteId',
  requireWorkspace('admin'),
  asyncHandler(async (req, res) => {
    await revokeInvite(req.params.workspaceId, req.params.inviteId);
    res.status(204).send();
  }),
);

workspaceRouter.get(
  '/:workspaceId/labels',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    res.json({ labels: await listLabels(req.params.workspaceId) });
  }),
);

workspaceRouter.post(
  '/:workspaceId/labels',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createLabelSchema.parse>>(createLabelSchema, req.body);
    const label = await createLabel(req.params.workspaceId, req.authUser!.id, input.name, input.color);
    res.status(201).json({ label });
  }),
);

workspaceRouter.delete(
  '/:workspaceId/labels/:labelId',
  requireWorkspace('admin'),
  asyncHandler(async (req, res) => {
    await deleteLabel(req.params.workspaceId, req.params.labelId);
    res.status(204).send();
  }),
);

workspaceRouter.get(
  '/:workspaceId/activity',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    res.json(await listActivity({ workspace: req.params.workspaceId }, query.page, query.limit));
  }),
);

workspaceRouter.get(
  '/:workspaceId/analytics',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    const workspaceId = req.params.workspaceId;
    res.json({
      analytics: await buildAnalytics({ workspace: workspaceId }, { workspace: workspaceId }),
    });
  }),
);

workspaceRouter.get(
  '/:workspaceId/search',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    const query = searchSchema.parse(req.query);
    res.json({ issues: await searchWorkspaceIssues(req.params.workspaceId, query.q) });
  }),
);

inviteRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    res.json({ invite: await previewInvite(req.params.token) });
  }),
);

inviteRouter.post(
  '/:token/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await acceptInvite(req.params.token, req.authUser!, realtimeFrom(ioFromApp(req.app)));
    res.json(result);
  }),
);
