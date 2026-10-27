import bcrypt from 'bcryptjs';
import { env } from './config';
import { connectDb, disconnectDb } from './db';
import { logger } from './logger';
import { Membership } from './models/Membership';
import { User } from './models/User';
import { Workspace } from './models/Workspace';
import { addComment, createIssue } from './services/issues';
import { createProject } from './services/projects';
import { createLabel, createWorkspace } from './services/workspaces';
import { colorFromString } from './utils';

const PASSWORD = 'Password123!';

async function ensureUser(name: string, email: string, passwordHash: string) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create({ name, email, passwordHash, avatarColor: colorFromString(email) });
}

function isoDaysFromNow(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export async function seedDatabase() {
  if (await Workspace.exists({ slug: 'northwind-labs' })) {
    logger.info('Demo workspace already exists');
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, env.bcryptRounds);
  const maya = await ensureUser('Maya Chen', 'maya@devcollab.dev', passwordHash);
  const jonah = await ensureUser('Jonah Patel', 'jonah@devcollab.dev', passwordHash);
  const priya = await ensureUser('Priya Nair', 'priya@devcollab.dev', passwordHash);

  const actor = { id: String(maya._id), name: maya.name, email: maya.email, avatarColor: maya.avatarColor };
  const workspace = await createWorkspace(actor, 'Northwind Labs', 'Platform work for the Northwind product team.');
  await Membership.create({ workspace: workspace.id, user: jonah._id, role: 'admin' });
  await Membership.create({ workspace: workspace.id, user: priya._id, role: 'member' });

  const bug = await createLabel(workspace.id, actor.id, 'bug', '#b42318');
  const feature = await createLabel(workspace.id, actor.id, 'feature', '#175cd3');
  const docs = await createLabel(workspace.id, actor.id, 'docs', '#0e7c66');

  const api = await createProject(workspace.id, actor, {
    name: 'API Platform',
    key: 'API',
    description: 'Auth, workspaces, and the issue API.',
  });
  const web = await createProject(workspace.id, actor, {
    name: 'Web Client',
    key: 'WEB',
    description: 'The workspace interface teams live in all day.',
  });

  const session = await createIssue({
    projectId: api.id,
    actor,
    title: 'Replace the session store with signed cookies',
    description: 'HttpOnly cookies, rotation on login, and a clear logout path.',
    status: 'in_progress',
    priority: 'high',
    assigneeIds: [String(maya._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(3),
  });
  const roles = await createIssue({
    projectId: api.id,
    actor,
    title: 'Enforce workspace roles on project routes',
    description: 'Members can file issues. Only admins can delete a project.',
    status: 'in_review',
    priority: 'urgent',
    assigneeIds: [String(jonah._id), String(priya._id)],
    labelIds: [bug.id],
    dueDate: isoDaysFromNow(-1),
  });
  await createIssue({
    projectId: api.id,
    actor,
    title: 'Paginate comments on long issue threads',
    description: 'Keep the first page small and stable under load.',
    status: 'todo',
    priority: 'medium',
    assigneeIds: [String(priya._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(6),
  });
  await createIssue({
    projectId: api.id,
    actor,
    title: 'Write the empty states for a fresh workspace',
    description: 'A new team should know the next click without reading docs.',
    status: 'backlog',
    priority: 'low',
    assigneeIds: [],
    labelIds: [docs.id],
    dueDate: null,
  });
  await createIssue({
    projectId: api.id,
    actor,
    title: 'Aggregate overdue work for the overview',
    description: 'Open, in progress, overdue, and completed this week from live data.',
    status: 'done',
    priority: 'medium',
    assigneeIds: [String(maya._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(-4),
  });

  await createIssue({
    projectId: web.id,
    actor: { id: String(jonah._id), name: jonah.name },
    title: 'Drag issues between board columns',
    description: 'Status changes should feel immediate and still land in the activity log.',
    status: 'in_progress',
    priority: 'high',
    assigneeIds: [String(priya._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(2),
  });
  await createIssue({
    projectId: web.id,
    actor,
    title: 'Show unread notifications without a refresh',
    description: 'Socket.IO should push assignment and comment alerts to the bell.',
    status: 'todo',
    priority: 'medium',
    assigneeIds: [String(maya._id), String(jonah._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(1),
  });

  await addComment({
    issueId: session.id,
    actor: { id: String(jonah._id), name: jonah.name },
    body: 'Cookie flags look right for local dev. We should force Secure once this is on HTTPS.',
  });
  await addComment({
    issueId: roles.id,
    actor: { id: String(priya._id), name: priya.name },
    body: 'I can still open issues as a member. Deleting the project returns 403, which is what we want.',
  });

  logger.info('Seeded Northwind Labs. Sign in as maya@devcollab.dev / Password123!');
}

if (require.main === module) {
  connectDb()
    .then(() => seedDatabase())
    .then(() => disconnectDb())
    .catch((error: unknown) => {
      logger.error('Seed failed', error);
      process.exit(1);
    });
}
