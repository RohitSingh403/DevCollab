import { Router } from 'express';
import { asyncHandler } from '../asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireProject, requireWorkspace } from '../middleware/access';
import { createProjectSchema, paginationSchema, updateProjectSchema } from '../schemas';
import { buildAnalytics } from '../services/analytics';
import { listActivity } from '../services/feed';
import { createProject, deleteProject, getProject, listProjects, updateProject } from '../services/projects';
import { ioFromApp, realtimeFrom } from '../realtime';
import { parseBody } from '../validate';
import { issueRouterForProject } from './issues';

export const projectRouter = Router();
export const workspaceProjectRouter = Router({ mergeParams: true });

workspaceProjectRouter.use(requireAuth);

workspaceProjectRouter.get(
  '/',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    res.json({ projects: await listProjects(req.params.workspaceId) });
  }),
);

workspaceProjectRouter.post(
  '/',
  requireWorkspace(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createProjectSchema.parse>>(createProjectSchema, req.body);
    const project = await createProject(req.params.workspaceId, req.authUser!, input, realtimeFrom(ioFromApp(req.app)));
    res.status(201).json({ project });
  }),
);

projectRouter.use(requireAuth);

projectRouter.get(
  '/:projectId',
  requireProject(),
  asyncHandler(async (req, res) => {
    res.json({ project: await getProject(req.params.projectId) });
  }),
);

projectRouter.patch(
  '/:projectId',
  requireProject('admin'),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateProjectSchema.parse>>(updateProjectSchema, req.body);
    const project = await updateProject(req.params.projectId, req.authUser!, input, realtimeFrom(ioFromApp(req.app)));
    res.json({ project });
  }),
);

projectRouter.delete(
  '/:projectId',
  requireProject('admin'),
  asyncHandler(async (req, res) => {
    await deleteProject(req.params.projectId, req.authUser!, realtimeFrom(ioFromApp(req.app)));
    res.status(204).send();
  }),
);

projectRouter.get(
  '/:projectId/analytics',
  requireProject(),
  asyncHandler(async (req, res) => {
    res.json({
      analytics: await buildAnalytics({ project: req.params.projectId }, { project: req.params.projectId }),
    });
  }),
);

projectRouter.get(
  '/:projectId/activity',
  requireProject(),
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    res.json(await listActivity({ project: req.params.projectId }, query.page, query.limit));
  }),
);

projectRouter.use('/:projectId/issues', issueRouterForProject);
