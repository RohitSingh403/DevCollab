import { Router } from 'express';
import { asyncHandler } from '../asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireProject, requireWorkspace } from '../middleware/access';
import { createMilestoneSchema, createProjectSchema, createTemplateSchema, createViewSchema, paginationSchema, startCycleSchema, updateCycleSchema, updateMilestoneSchema, updateProjectSchema } from '../schemas';
import { buildAnalytics } from '../services/analytics';
import { activeCycleProgress, endCycle, listCycles, startCycle, updateCycle } from '../services/cycles';
import { createMilestone, deleteMilestone, listMilestones, updateMilestone } from '../services/milestones';
import { listActivity } from '../services/feed';
import { createProject, deleteProject, getProject, listProjects, updateProject } from '../services/projects';
import { createTemplate, deleteTemplate, listTemplates } from '../services/templates';
import { createView, deleteView, listViews } from '../services/views';
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
    const analytics = await buildAnalytics({ project: req.params.projectId }, { project: req.params.projectId });
    res.json({ analytics: { ...analytics, cycle: await activeCycleProgress(req.params.projectId) } });
  }),
);

projectRouter.get(
  '/:projectId/cycles',
  requireProject(),
  asyncHandler(async (req, res) => {
    res.json({ cycles: await listCycles(req.params.projectId) });
  }),
);

projectRouter.post(
  '/:projectId/cycles/end',
  requireProject(),
  asyncHandler(async (req, res) => {
    const cycle = await endCycle(req.params.projectId, req.authUser!, realtimeFrom(ioFromApp(req.app)));
    res.json({ cycle });
  }),
);

projectRouter.post(
  '/:projectId/cycles',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof startCycleSchema.parse>>(startCycleSchema, req.body);
    const cycle = await startCycle(
      { projectId: req.params.projectId, actor: req.authUser!, ...input },
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(201).json({ cycle });
  }),
);

projectRouter.patch(
  '/:projectId/cycles/:cycleId',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateCycleSchema.parse>>(updateCycleSchema, req.body);
    const cycle = await updateCycle(req.params.projectId, req.params.cycleId, req.authUser!, input, realtimeFrom(ioFromApp(req.app)));
    res.json({ cycle });
  }),
);

projectRouter.get(
  '/:projectId/milestones',
  requireProject(),
  asyncHandler(async (req, res) => {
    res.json({
      milestones: await listMilestones(req.params.projectId, { id: req.authUser!.id, role: req.membershipRole! }),
    });
  }),
);

projectRouter.post(
  '/:projectId/milestones',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createMilestoneSchema.parse>>(createMilestoneSchema, req.body);
    const milestone = await createMilestone(
      { projectId: req.params.projectId, actor: { ...req.authUser!, role: req.membershipRole! }, ...input },
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(201).json({ milestone });
  }),
);

projectRouter.patch(
  '/:projectId/milestones/:milestoneId',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateMilestoneSchema.parse>>(updateMilestoneSchema, req.body);
    const milestone = await updateMilestone(
      req.params.projectId,
      req.params.milestoneId,
      { ...req.authUser!, role: req.membershipRole! },
      input,
      realtimeFrom(ioFromApp(req.app)),
    );
    res.json({ milestone });
  }),
);

projectRouter.delete(
  '/:projectId/milestones/:milestoneId',
  requireProject(),
  asyncHandler(async (req, res) => {
    await deleteMilestone(
      req.params.projectId,
      req.params.milestoneId,
      { ...req.authUser!, role: req.membershipRole! },
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(204).send();
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

projectRouter.get(
  '/:projectId/templates',
  requireProject(),
  asyncHandler(async (req, res) => {
    res.json({ templates: await listTemplates(req.params.projectId, req.authUser!.id, req.membershipRole!) });
  }),
);

projectRouter.post(
  '/:projectId/templates',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createTemplateSchema.parse>>(createTemplateSchema, req.body);
    const template = await createTemplate(req.params.projectId, req.authUser!, input);
    res.status(201).json({ template });
  }),
);

projectRouter.delete(
  '/:projectId/templates/:templateId',
  requireProject(),
  asyncHandler(async (req, res) => {
    await deleteTemplate(req.params.projectId, req.params.templateId, req.authUser!.id, req.membershipRole!);
    res.status(204).send();
  }),
);

projectRouter.get(
  '/:projectId/views',
  requireProject(),
  asyncHandler(async (req, res) => {
    res.json({ views: await listViews(req.params.projectId, req.authUser!.id, req.membershipRole!) });
  }),
);

projectRouter.post(
  '/:projectId/views',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createViewSchema.parse>>(createViewSchema, req.body);
    const view = await createView(
      req.params.projectId,
      req.authUser!,
      req.membershipRole!,
      input,
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(201).json({ view });
  }),
);

projectRouter.delete(
  '/:projectId/views/:viewId',
  requireProject(),
  asyncHandler(async (req, res) => {
    await deleteView(
      req.params.projectId,
      req.params.viewId,
      req.authUser!.id,
      req.membershipRole!,
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(204).send();
  }),
);

projectRouter.use('/:projectId/issues', issueRouterForProject);
