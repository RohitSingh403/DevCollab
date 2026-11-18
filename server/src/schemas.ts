import { z } from 'zod';
import { ESTIMATES, INVITE_ROLES, PRIORITIES, REACTIONS, ROLES, STATUSES } from './constants';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Expected an id');

const passwordRule = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120).transform((value) => value.toLowerCase()),
    password: passwordRule,
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(72),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: passwordRule,
  })
  .strict();

export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional().default(''),
  })
  .strict();

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const inviteSchema = z
  .object({
    email: z.string().trim().email().max(120).transform((value) => value.toLowerCase()),
    role: z.enum(INVITE_ROLES).default('member'),
  })
  .strict();

export const updateMemberSchema = z
  .object({
    role: z.enum(ROLES),
  })
  .strict();

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,5}$/, 'Key must be 2–6 letters or digits and start with a letter'),
    description: z.string().trim().max(500).optional().default(''),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const createLabelSchema = z
  .object({
    name: z.string().trim().min(1).max(32),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const updateLabelSchema = z
  .object({
    name: z.string().trim().min(1).max(32).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.color !== undefined, { message: 'Nothing to update' });

const estimate = z.union([z.literal(ESTIMATES[0]), z.literal(ESTIMATES[1]), z.literal(ESTIMATES[2]), z.literal(ESTIMATES[3]), z.literal(ESTIMATES[4]), z.null()]).optional();

const dueDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .nullable()
  .optional();

export const createIssueSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(5000).optional().default(''),
    status: z.enum(STATUSES).optional().default('backlog'),
    priority: z.enum(PRIORITIES).optional().default('medium'),
    assigneeIds: z.array(objectId).max(12).optional().default([]),
    labelIds: z.array(objectId).max(12).optional().default([]),
    dueDate,
    estimate,
    parentId: objectId.optional(),
    checklist: z.array(z.string().trim().min(1).max(140)).max(30).optional().default([]),
  })
  .strict();

export const createTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    title: z.string().trim().max(140).optional().default(''),
    description: z.string().trim().max(5000).optional().default(''),
    status: z.enum(STATUSES).optional().default('backlog'),
    priority: z.enum(PRIORITIES).optional().default('medium'),
    estimate,
    labelIds: z.array(objectId).max(12).optional().default([]),
    checklist: z.array(z.string().trim().min(1).max(140)).max(12).optional().default([]),
  })
  .strict();

export const checklistSchema = z
  .object({
    text: z.string().trim().min(1).max(140),
  })
  .strict();

export const updateChecklistSchema = z
  .object({
    text: z.string().trim().min(1).max(140).optional(),
    done: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.text !== undefined || value.done !== undefined, { message: 'Nothing to update' });

export const blockerSchema = z
  .object({
    blockerId: objectId,
  })
  .strict();

export const relatedSchema = z
  .object({
    issueId: objectId,
  })
  .strict();

export const updateIssueSchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(5000).optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeIds: z.array(objectId).max(12).optional(),
    labelIds: z.array(objectId).max(12).optional(),
    dueDate,
    estimate,
    cycleId: objectId.nullable().optional(),
    milestoneId: objectId.nullable().optional(),
    projectId: objectId.optional(),
    parentId: objectId.nullable().optional(),
  })
  .strict();

export const bulkUpdateIssueSchema = z
  .object({
    issueIds: z.array(objectId).min(1).max(25),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: objectId.nullable().optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.priority !== undefined || value.assigneeId !== undefined, {
    message: 'Choose a status, a priority, or an assignee',
  });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listIssueSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.union([z.literal('me'), z.literal('none'), objectId]).optional(),
  label: objectId.optional(),
  q: z.string().trim().max(80).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  quiet: z.enum(['true', 'false']).optional(),
  dueSoon: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['updated', 'created', 'due', 'priority']).optional().default('updated'),
  cycle: z.union([z.literal('active'), objectId]).optional(),
  milestone: objectId.optional(),
});

export const createMilestoneSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    targetDate: day.nullable().optional(),
  })
  .strict();

export const updateMilestoneSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    targetDate: day.nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.targetDate !== undefined, { message: 'Nothing to update' });

export const snoozeSchema = z.object({ until: day }).strict();

export const startCycleSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    startsAt: day,
    endsAt: day,
    carryOpen: z.boolean().optional().default(true),
  })
  .strict();

export const updateCycleSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    startsAt: day.optional(),
    endsAt: day.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.startsAt !== undefined || value.endsAt !== undefined, {
    message: 'Choose a name or a date',
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const activityQuerySchema = paginationSchema.extend({
  project: objectId.optional(),
});

export const quietQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export const dueQuerySchema = quietQuerySchema;

export const commentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export const pinCommentSchema = z
  .object({
    pinned: z.boolean(),
  })
  .strict();

export const reactionSchema = z
  .object({
    emoji: z.enum(REACTIONS),
  })
  .strict();

export const viewFiltersSchema = z
  .object({
    status: z.enum(STATUSES).or(z.literal('')).optional().default(''),
    priority: z.enum(PRIORITIES).or(z.literal('')).optional().default(''),
    assignee: z.union([z.literal(''), z.literal('me'), z.literal('none'), objectId]).optional().default(''),
    overdue: z.boolean().optional().default(false),
    quiet: z.boolean().optional().default(false),
    dueSoon: z.boolean().optional().default(false),
    q: z.string().trim().max(80).optional().default(''),
    layout: z.enum(['board', 'list']).optional().default('board'),
    label: z.union([z.literal(''), objectId]).optional().default(''),
    sort: z.enum(['updated', 'created', 'due', 'priority']).optional().default('updated'),
  })
  .strict();

export const createViewSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    shared: z.boolean().optional().default(false),
    filters: viewFiltersSchema,
  })
  .strict();

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});

export const resolveIssueKeysSchema = z
  .object({
    keys: z.array(z.string().trim().min(1).max(16)).min(1).max(40),
  })
  .strict();

export const favoriteSchema = z
  .object({
    kind: z.enum(['project', 'issue']),
    targetId: objectId,
  })
  .strict();
