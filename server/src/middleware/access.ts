import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../asyncHandler';
import { roleRank, type Role } from '../constants';
import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { Membership } from '../models/Membership';
import { Project } from '../models/Project';
import { Workspace } from '../models/Workspace';
import { assertObjectId } from '../utils';

export const requireWorkspace = (minRole: Role = 'member') =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const workspaceId = req.params.workspaceId;
    assertObjectId(workspaceId, 'workspace id');
    if (!req.authUser) throw new ApiError(401, 'Authentication required', 'unauthorized');
    const [workspace, membership] = await Promise.all([
      Workspace.findById(workspaceId).lean(),
      Membership.findOne({ workspace: workspaceId, user: req.authUser.id }).lean(),
    ]);
    if (!workspace || !membership) throw new ApiError(404, 'Workspace not found', 'not_found');
    if (roleRank(membership.role) < roleRank(minRole)) {
      throw new ApiError(403, 'You do not have permission to do that', 'forbidden');
    }
    req.membershipRole = membership.role;
    next();
  });

export const requireProject = (minRole: Role = 'member') =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const projectId = req.params.projectId;
    assertObjectId(projectId, 'project id');
    if (!req.authUser) throw new ApiError(401, 'Authentication required', 'unauthorized');
    const project = await Project.findById(projectId).select('workspace').lean();
    if (!project) throw new ApiError(404, 'Project not found', 'not_found');
    const membership = await Membership.findOne({ workspace: project.workspace, user: req.authUser.id }).lean();
    if (!membership) throw new ApiError(404, 'Project not found', 'not_found');
    if (roleRank(membership.role) < roleRank(minRole)) {
      throw new ApiError(403, 'You do not have permission to do that', 'forbidden');
    }
    req.membershipRole = membership.role;
    next();
  });

export const requireIssue = (minRole: Role = 'member') =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const issueId = req.params.issueId;
    assertObjectId(issueId, 'issue id');
    if (!req.authUser) throw new ApiError(401, 'Authentication required', 'unauthorized');
    const issue = await Issue.findById(issueId).select('workspace').lean();
    if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
    const membership = await Membership.findOne({ workspace: issue.workspace, user: req.authUser.id }).lean();
    if (!membership) throw new ApiError(404, 'Issue not found', 'not_found');
    if (roleRank(membership.role) < roleRank(minRole)) {
      throw new ApiError(403, 'You do not have permission to do that', 'forbidden');
    }
    req.membershipRole = membership.role;
    next();
  });
