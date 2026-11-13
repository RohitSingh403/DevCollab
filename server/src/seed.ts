import bcrypt from 'bcryptjs';
import { env } from './config';
import { connectDb, disconnectDb } from './db';
import { logger } from './logger';
import { Membership } from './models/Membership';
import { User } from './models/User';
import { Workspace } from './models/Workspace';
import { addBlocker } from './services/blockers';
import { addChecklistItem, updateChecklistItem } from './services/checklist';
import { setWatching } from './services/watchers';
import { startCycle } from './services/cycles';
import { addComment, createIssue, updateIssue } from './services/issues';
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
    estimate: 5,
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
    estimate: 8,
    assigneeIds: [String(jonah._id), String(priya._id)],
    labelIds: [bug.id],
    dueDate: isoDaysFromNow(-1),
  });
  const comments = await createIssue({
    projectId: api.id,
    actor,
    title: 'Paginate comments on long issue threads',
    description: 'Keep the first page small and stable under load.',
    status: 'todo',
    priority: 'medium',
    estimate: 3,
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
    estimate: 1,
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
    estimate: 2,
    assigneeIds: [String(maya._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(-4),
  });

  const drag = await createIssue({
    projectId: web.id,
    actor: { id: String(jonah._id), name: jonah.name },
    title: 'Drag issues between board columns',
    description: 'Status changes should feel immediate and still land in the activity log.',
    status: 'in_progress',
    priority: 'high',
    estimate: 5,
    assigneeIds: [String(priya._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(2),
  });
  const notifications = await createIssue({
    projectId: web.id,
    actor,
    title: 'Show unread notifications without a refresh',
    description: 'Socket.IO should push assignment and comment alerts to the bell.',
    status: 'todo',
    priority: 'medium',
    estimate: 3,
    assigneeIds: [String(maya._id), String(jonah._id)],
    labelIds: [feature.id],
    dueDate: isoDaysFromNow(0),
  });

  const apiCycle = await startCycle({
    projectId: api.id,
    actor,
    name: 'Cycle 12',
    startsAt: isoDaysFromNow(-1).slice(0, 10),
    endsAt: isoDaysFromNow(6).slice(0, 10),
    carryOpen: false,
  });
  for (const issueId of [session.id, roles.id, comments.id]) {
    await updateIssue({ issueId, actor, cycleId: apiCycle.id });
  }
  const webCycle = await startCycle({
    projectId: web.id,
    actor,
    name: 'Cycle 4',
    startsAt: isoDaysFromNow(0).slice(0, 10),
    endsAt: isoDaysFromNow(13).slice(0, 10),
    carryOpen: false,
  });
  for (const issueId of [drag.id, notifications.id]) {
    await updateIssue({ issueId, actor, cycleId: webCycle.id });
  }

  const cookie = await addChecklistItem({ issueId: session.id, actor, text: 'Set HttpOnly on the session cookie' });
  const step = cookie.checklist[0];
  if (step) await updateChecklistItem({ issueId: session.id, itemId: step.id, actor, done: true });
  await addChecklistItem({ issueId: session.id, actor, text: 'Clear the cookie on logout' });
  await addChecklistItem({ issueId: session.id, actor, text: 'Reject a missing signature' });

  await addBlocker({ issueId: comments.id, blockerId: roles.id, actor });
  await setWatching(session.id, String(priya._id), true);
  await addBlocker({ issueId: notifications.id, blockerId: session.id, actor });

  await addComment({
    issueId: session.id,
    actor: { id: String(jonah._id), name: jonah.name },
    body: 'Cookie flags look right for local dev. We should force **Secure** once this is on HTTPS.\n\n- HttpOnly\n- SameSite\n\nSee [the cookie guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies).',
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
