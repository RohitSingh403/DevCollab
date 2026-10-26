import { Router } from 'express';
import { asyncHandler } from '../asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireIssue, requireProject } from '../middleware/access';
import { commentSchema, createIssueSchema, listIssueSchema, paginationSchema, updateIssueSchema } from '../schemas';
import { listActivity } from '../services/feed';
import {
  addComment,
  createIssue,
  deleteComment,
  deleteIssue,
  getIssue,
  listComments,
  listIssues,
  updateComment,
  updateIssue,
} from '../services/issues';
import { ioFromApp, realtimeFrom } from '../realtime';
import { parseBody } from '../validate';

export const issueRouterForProject = Router({ mergeParams: true });
export const issueRouter = Router();
export const commentRouter = Router();

issueRouterForProject.use(requireAuth);

issueRouterForProject.get(
  '/',
  requireProject(),
  asyncHandler(async (req, res) => {
    const query = listIssueSchema.parse(req.query);
    res.json(await listIssues({ projectId: req.params.projectId, ...query }));
  }),
);

issueRouterForProject.post(
  '/',
  requireProject(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof createIssueSchema.parse>>(createIssueSchema, req.body);
    const issue = await createIssue(
      { projectId: req.params.projectId, actor: req.authUser!, ...input },
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(201).json({ issue });
  }),
);

issueRouter.use(requireAuth);

issueRouter.get(
  '/:issueId',
  requireIssue(),
  asyncHandler(async (req, res) => {
    res.json({ issue: await getIssue(req.params.issueId) });
  }),
);

issueRouter.patch(
  '/:issueId',
  requireIssue(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof updateIssueSchema.parse>>(updateIssueSchema, req.body);
    const issue = await updateIssue(
      { issueId: req.params.issueId, actor: req.authUser!, ...input },
      realtimeFrom(ioFromApp(req.app)),
    );
    res.json({ issue });
  }),
);

issueRouter.delete(
  '/:issueId',
  requireIssue(),
  asyncHandler(async (req, res) => {
    await deleteIssue(req.params.issueId, req.authUser!, req.membershipRole!, realtimeFrom(ioFromApp(req.app)));
    res.status(204).send();
  }),
);

issueRouter.get(
  '/:issueId/comments',
  requireIssue(),
  asyncHandler(async (req, res) => {
    res.json({ comments: await listComments(req.params.issueId) });
  }),
);

issueRouter.post(
  '/:issueId/comments',
  requireIssue(),
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof commentSchema.parse>>(commentSchema, req.body);
    const comment = await addComment(
      { issueId: req.params.issueId, actor: req.authUser!, body: input.body },
      realtimeFrom(ioFromApp(req.app)),
    );
    res.status(201).json({ comment });
  }),
);

issueRouter.get(
  '/:issueId/activity',
  requireIssue(),
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    res.json(await listActivity({ issue: req.params.issueId }, query.page, query.limit));
  }),
);

commentRouter.use(requireAuth);

commentRouter.patch(
  '/:commentId',
  asyncHandler(async (req, res) => {
    const input = parseBody<ReturnType<typeof commentSchema.parse>>(commentSchema, req.body);
    const comment = await updateComment(req.params.commentId, req.authUser!.id, input.body);
    res.json({ comment });
  }),
);

commentRouter.delete(
  '/:commentId',
  asyncHandler(async (req, res) => {
    await deleteComment(req.params.commentId, req.authUser!, realtimeFrom(ioFromApp(req.app)));
    res.status(204).send();
  }),
);
