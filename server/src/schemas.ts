import { z } from 'zod';
import { INVITE_ROLES, PRIORITIES, ROLES, STATUSES } from './constants';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Expected an id');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120).transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(8)
      .max(72)
      .regex(/[A-Za-z]/, 'Password must include a letter')
      .regex(/[0-9]/, 'Password must include a number'),
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
  })
  .strict();

export const createLabelSchema = z
  .object({
    name: z.string().trim().min(1).max(32),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

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
  })
  .strict();

export const listIssueSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: objectId.optional(),
  label: objectId.optional(),
  q: z.string().trim().max(80).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['updated', 'created', 'due', 'priority']).optional().default('updated'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const commentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});
