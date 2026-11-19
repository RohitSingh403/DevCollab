import { describe, expect, it } from 'vitest';
import { dayKey } from '../src/dates';
import { Issue } from '../src/models/Issue';
import { scanDueReminders } from '../src/services/reminders';
import { authAgent, createWorkspace, registerUser } from './helpers';

describe('workspaces, issues, and authorization', () => {
  it('keeps workspace data private and enforces roles', async () => {
    const owner = await registerUser(authAgent(), 'Owner');
    const member = await registerUser(authAgent(), 'Member');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Northwind');

    expect(workspace.role).toBe('owner');
    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}`);
    expect(hidden.status).toBe(404);

    const invited = await owner.agent
      .post(`/api/workspaces/${workspace.id}/invites`)
      .send({ email: member.email, role: 'member' });
    expect(invited.status).toBe(201);
    expect(invited.body.kind).toBe('member');

    const memberSpaces = await member.agent.get('/api/workspaces');
    expect(memberSpaces.body.workspaces.map((item: { id: string }) => item.id)).toContain(workspace.id);

    const memberInvite = await member.agent
      .post(`/api/workspaces/${workspace.id}/invites`)
      .send({ email: 'new@example.com', role: 'member' });
    expect(memberInvite.status).toBe(403);

    const promote = await member.agent
      .patch(`/api/workspaces/${workspace.id}/members/${member.user.id}`)
      .send({ role: 'admin' });
    expect(promote.status).toBe(403);

    const removeOwner = await member.agent.delete(`/api/workspaces/${workspace.id}/members/${owner.user.id}`);
    expect(removeOwner.status).toBe(403);

    const destroy = await member.agent.delete(`/api/workspaces/${workspace.id}`);
    expect(destroy.status).toBe(403);

    const madeAdmin = await owner.agent
      .patch(`/api/workspaces/${workspace.id}/members/${member.user.id}`)
      .send({ role: 'admin' });
    expect(madeAdmin.status).toBe(200);

    const adminCannotOwn = await member.agent
      .patch(`/api/workspaces/${workspace.id}/members/${outsider.user.id}`)
      .send({ role: 'owner' });
    expect(adminCannotOwn.status).toBe(404);

    const lastOwner = await owner.agent
      .patch(`/api/workspaces/${workspace.id}/members/${owner.user.id}`)
      .send({ role: 'member' });
    expect(lastOwner.status).toBe(409);
  });

  it('issues an invite link that only the invited email can accept', async () => {
    const owner = await registerUser(authAgent(), 'Owner');
    const stranger = await registerUser(authAgent(), 'Stranger');
    const workspace = await createWorkspace(owner.agent, 'Invites');
    const pending = await owner.agent
      .post(`/api/workspaces/${workspace.id}/invites`)
      .send({ email: 'future@example.com', role: 'member' });
    expect(pending.status).toBe(201);
    expect(pending.body.url).toMatch(/\/invite\/[a-f0-9]+$/);
    const token = pending.body.url.split('/').pop() as string;

    const preview = await stranger.agent.get(`/api/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.invite.email).toBe('future@example.com');
    expect(preview.body.invite.workspaceName).toBe('Invites');

    const mismatch = await stranger.agent.post(`/api/invites/${token}/accept`);
    expect(mismatch.status).toBe(403);

    const guest = await registerUser(authAgent(), 'Future');
    await guest.agent.patch('/api/auth/me').send({ name: 'Future Member' });
    const wrongEmail = guest.user.email;
    expect(wrongEmail).not.toBe('future@example.com');

    const created = authAgent();
    const registered = await created.post('/api/auth/register').send({
      name: 'Future Member',
      email: 'future@example.com',
      password: 'Password123!',
    });
    expect(registered.status).toBe(201);
    const accepted = await created.post(`/api/invites/${token}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.workspaceId).toBe(workspace.id);

    const reused = await created.post(`/api/invites/${token}/accept`);
    expect(reused.status).toBe(409);
  });

  it('tracks issues, comments, filters, pagination, and analytics', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'API Platform');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });

    const projectResponse = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'api',
      description: 'Service layer',
    });
    expect(projectResponse.status).toBe(201);
    expect(projectResponse.body.project.key).toBe('API');
    const projectId = projectResponse.body.project.id as string;

    const outsider = await registerUser(authAgent(), 'Outsider');
    const hiddenProject = await outsider.agent.get(`/api/projects/${projectId}`);
    expect(hiddenProject.status).toBe(404);
    const memberDelete = await teammate.agent.delete(`/api/projects/${projectId}`);
    expect(memberDelete.status).toBe(403);

    const label = await owner.agent
      .post(`/api/workspaces/${workspace.id}/labels`)
      .send({ name: 'bug', color: '#ff6b81' });
    expect(label.status).toBe(201);

    const dueSoon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const overdue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Lock down project deletion',
      description: 'Admins only.',
      status: 'todo',
      priority: 'high',
      assigneeIds: [teammate.user.id],
      labelIds: [label.body.label.id],
      dueDate: dueSoon,
    });
    expect(first.status).toBe(201);
    expect(first.body.issue.key).toBe('API-1');
    expect(first.body.issue.assignees[0].id).toBe(teammate.user.id);

    const notices = await teammate.agent.get('/api/notifications');
    expect(notices.body.notifications.some((item: { message: string }) => /assigned you to API-1/.test(item.message))).toBe(
      true,
    );

    const badAssignee = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Assign a stranger',
      assigneeIds: [outsider.user.id],
    });
    expect(badAssignee.status).toBe(400);
    expect(badAssignee.body.error.code).toBe('invalid_assignees');

    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Ship pagination',
      status: 'in_progress',
      priority: 'medium',
      dueDate: overdue,
    });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Close the migration',
      status: 'done',
      priority: 'low',
    });

    const second = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ status: 'in_progress' });
    expect(second.body.total).toBe(1);
    expect(second.body.issues[0].key).toBe('API-2');
    expect(second.body.issues[0].overdue).toBe(true);

    const overdueOnly = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ overdue: 'true' });
    expect(overdueOnly.body.issues.map((issue: { key: string }) => issue.key)).toEqual(['API-2']);

    const page = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ limit: 1, page: 2, sort: 'created' });
    expect(page.body.issues).toHaveLength(1);
    expect(page.body.pages).toBe(3);
    expect(page.body.total).toBe(3);

    const comment = await teammate.agent.post(`/api/issues/${first.body.issue.id}/comments`).send({
      body: 'Role checks pass for members.',
    });
    expect(comment.status).toBe(201);

    const ownerNotes = await owner.agent.get('/api/notifications');
    expect(ownerNotes.body.notifications.some((item: { message: string }) => item.message.includes('commented on API-1'))).toBe(
      true,
    );

    const edited = await teammate.agent
      .patch(`/api/comments/${comment.body.comment.id}`)
      .send({ body: 'Role checks pass for members. Adding a note.' });
    expect(edited.status).toBe(200);
    expect(edited.body.comment.edited).toBe(true);

    const ownerEdit = await owner.agent.patch(`/api/comments/${comment.body.comment.id}`).send({ body: 'nope' });
    expect(ownerEdit.status).toBe(403);

    const moved = await owner.agent.patch(`/api/issues/${first.body.issue.id}`).send({ status: 'in_review' });
    expect(moved.status).toBe(200);
    expect(moved.body.issue.status).toBe('in_review');

    const activity = await owner.agent.get(`/api/issues/${first.body.issue.id}/activity`);
    expect(activity.body.activities.length).toBeGreaterThanOrEqual(2);
    expect(activity.body.activities.some((item: { type: string }) => item.type === 'issue.updated')).toBe(true);

    const analytics = await owner.agent.get(`/api/workspaces/${workspace.id}/analytics`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.analytics.totals.issues).toBe(3);
    expect(analytics.body.analytics.totals.overdue).toBe(1);
    expect(analytics.body.analytics.totals.done).toBe(1);
    expect(analytics.body.analytics.byStatus).toHaveLength(5);
    expect(analytics.body.analytics.activityByDay).toHaveLength(14);
    expect(analytics.body.analytics.assigneeLoad[0].user.id).toBe(teammate.user.id);

    const teammateDelete = await teammate.agent.delete(`/api/issues/${first.body.issue.id}`);
    expect(teammateDelete.status).toBe(403);
    const reporterDelete = await owner.agent.delete(`/api/issues/${second.body.issues[0].id}`);
    expect(reporterDelete.status).toBe(204);

    const search = await teammate.agent.get(`/api/workspaces/${workspace.id}/search`).query({ q: 'Lock down' });
    expect(search.body.issues.map((issue: { key: string }) => issue.key)).toEqual(['API-1']);
  });

  it('opens a starter workspace for a new account', async () => {
    const owner = await registerUser(authAgent(), 'Priya Nair');
    const spaces = await owner.agent.get('/api/workspaces');
    expect(spaces.body.workspaces).toHaveLength(1);
    const workspace = spaces.body.workspaces[0] as { id: string; name: string; role: string };
    expect(workspace.name).toBe("Priya's workspace");
    expect(workspace.role).toBe('owner');

    const projects = await owner.agent.get(`/api/workspaces/${workspace.id}/projects`);
    expect(projects.body.projects).toHaveLength(1);
    expect(projects.body.projects[0].key).toBe('APP');

    const issues = await owner.agent.get(`/api/projects/${projects.body.projects[0].id}/issues`);
    expect(issues.body.total).toBeGreaterThanOrEqual(3);
    expect(issues.body.issues.some((issue: { status: string }) => issue.status === 'done')).toBe(true);

    const notes = await owner.agent.get('/api/notifications');
    expect(notes.body.unread).toBe(0);
  });

  it('notifies the teammate named in a comment once', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Priya Nair');
    const workspace = await createWorkspace(owner.agent, 'Mentions');
    const invited = await owner.agent
      .post(`/api/workspaces/${workspace.id}/invites`)
      .send({ email: teammate.email, role: 'member' });
    expect(invited.status).toBe(201);

    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const open = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Review the auth change',
      description: 'Needs a second pair of eyes.',
    });
    expect(open.status).toBe(201);

    const mentioned = await owner.agent.post(`/api/issues/${open.body.issue.id}/comments`).send({
      body: 'Can @Priya Nair take a look? @Nobody should stay quiet.',
    });
    expect(mentioned.status).toBe(201);

    const notes = await teammate.agent.get('/api/notifications');
    const messages = notes.body.notifications.map((item: { message: string }) => item.message) as string[];
    expect(messages.some((message) => message.includes('mentioned you on API-1'))).toBe(true);
    expect(messages.some((message) => message.includes('commented on API-1'))).toBe(false);

    const self = await owner.agent.post(`/api/issues/${open.body.issue.id}/comments`).send({
      body: 'I will handle this @Maya Chen',
    });
    expect(self.status).toBe(201);
    const ownerNotes = await owner.agent.get('/api/notifications');
    expect(ownerNotes.body.notifications.some((item: { message: string }) => item.message.includes('mentioned you'))).toBe(false);

    const sameMention = await owner.agent.patch(`/api/comments/${mentioned.body.comment.id}`).send({
      body: 'Can @Priya Nair take a look? Still waiting.',
    });
    expect(sameMention.status).toBe(200);
    const afterEdit = await teammate.agent.get('/api/notifications');
    expect(
      afterEdit.body.notifications.filter((item: { message: string }) => item.message.includes('mentioned you on API-1')).length,
    ).toBe(1);

    const assigned = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Assigned review',
      assigneeIds: [teammate.user.id],
    });
    const both = await owner.agent.post(`/api/issues/${assigned.body.issue.id}/comments`).send({
      body: '@priya nair this is yours',
    });
    expect(both.status).toBe(201);
    const afterAssign = await teammate.agent.get('/api/notifications');
    const second = afterAssign.body.notifications.map((item: { message: string }) => item.message) as string[];
    expect(second.some((message) => message.includes('mentioned you on API-2'))).toBe(true);
    expect(second.some((message) => message.includes('commented on API-2'))).toBe(false);
  });

  it('saves private and shared project views', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Priya Nair');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Views');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;

    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Owner high priority',
      priority: 'high',
      assigneeIds: [owner.user.id],
    });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Teammate high priority',
      priority: 'high',
      assigneeIds: [teammate.user.id],
    });

    const empty = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Everything',
      filters: {},
    });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('empty_view');

    const mine = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'My urgent work',
      shared: false,
      filters: { priority: 'high', assignee: 'me', layout: 'list' },
    });
    expect(mine.status).toBe(201);
    expect(mine.body.view.mine).toBe(true);
    expect(mine.body.view.filters.assignee).toBe('me');

    const hidden = await teammate.agent.get(`/api/projects/${projectId}/views`);
    expect(hidden.body.views.map((view: { name: string }) => view.name)).not.toContain('My urgent work');

    const shared = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Release blockers',
      shared: true,
      filters: { priority: 'high', overdue: true },
    });
    expect(shared.status).toBe(201);
    const visible = await teammate.agent.get(`/api/projects/${projectId}/views`);
    const blocker = visible.body.views.find((view: { name: string }) => view.name === 'Release blockers') as {
      shared: boolean;
      mine: boolean;
      canDelete: boolean;
    };
    expect(blocker.shared).toBe(true);
    expect(blocker.mine).toBe(false);
    expect(blocker.canDelete).toBe(false);

    const memberDelete = await teammate.agent.delete(`/api/projects/${projectId}/views/${shared.body.view.id}`);
    expect(memberDelete.status).toBe(403);
    const privateDelete = await teammate.agent.delete(`/api/projects/${projectId}/views/${mine.body.view.id}`);
    expect(privateDelete.status).toBe(404);
    const outsiderList = await outsider.agent.get(`/api/projects/${projectId}/views`);
    expect(outsiderList.status).toBe(404);

    const duplicate = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'My urgent work',
      filters: { status: 'todo' },
    });
    expect(duplicate.status).toBe(409);

    const ownerWork = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ assignee: 'me', priority: 'high' });
    expect(ownerWork.body.issues.map((issue: { title: string }) => issue.title)).toEqual(['Owner high priority']);
    const teammateWork = await teammate.agent.get(`/api/projects/${projectId}/issues`).query({ assignee: 'me', priority: 'high' });
    expect(teammateWork.body.issues.map((issue: { title: string }) => issue.title)).toEqual(['Teammate high priority']);

    await owner.agent.patch(`/api/workspaces/${workspace.id}/members/${teammate.user.id}`).send({ role: 'admin' });
    const adminDelete = await teammate.agent.delete(`/api/projects/${projectId}/views/${shared.body.view.id}`);
    expect(adminDelete.status).toBe(204);
    const ownerDelete = await owner.agent.delete(`/api/projects/${projectId}/views/${mine.body.view.id}`);
    expect(ownerDelete.status).toBe(204);
  });

  it('lists open issues assigned to the signed-in user', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Priya Nair');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Queue');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Late review',
      assigneeIds: [teammate.user.id],
      dueDate: yesterday,
      priority: 'high',
    });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Ship the filter',
      assigneeIds: [teammate.user.id],
      dueDate: soon,
    });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Plan the next milestone',
      assigneeIds: [teammate.user.id],
      dueDate: later,
    });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Write the empty state',
      assigneeIds: [teammate.user.id],
    });
    const done = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Already finished',
      assigneeIds: [teammate.user.id],
      status: 'done',
    });
    expect(done.status).toBe(201);
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Owner only',
      assigneeIds: [owner.user.id],
      dueDate: soon,
    });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(hidden.status).toBe(404);

    const queue = await teammate.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(queue.status).toBe(200);
    expect(queue.body.total).toBe(4);
    expect(queue.body.counts).toMatchObject({ overdue: 1, dueSoon: 1, later: 1, undated: 1 });
    expect(queue.body.groups.find((group: { id: string }) => group.id === 'overdue').issues.map((issue: { title: string }) => issue.title)).toEqual([
      'Late review',
    ]);
    expect(queue.body.groups.flatMap((group: { issues: { title: string }[] }) => group.issues.map((issue) => issue.title))).not.toContain(
      'Already finished',
    );
    expect(queue.body.groups.flatMap((group: { issues: { title: string }[] }) => group.issues.map((issue) => issue.title))).not.toContain(
      'Owner only',
    );

    const ownerQueue = await owner.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(ownerQueue.body.groups.flatMap((group: { issues: { title: string }[] }) => group.issues.map((issue) => issue.title))).toEqual([
      'Owner only',
    ]);
  });

  it('links blockers in one workspace and clears the mark when the blocker is done', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Priya Nair');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Dependencies');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const api = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const web = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'Web Client',
      key: 'WEB',
      description: 'Interface',
    });
    const foundation = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({
      title: 'Ship the session cookies',
      assigneeIds: [owner.user.id],
    });
    const waiting = await owner.agent.post(`/api/projects/${web.body.project.id}/issues`).send({
      title: 'Show the inbox live',
      assigneeIds: [teammate.user.id],
    });
    expect(foundation.status).toBe(201);
    const foundationId = foundation.body.issue.id as string;
    const waitingId = waiting.body.issue.id as string;

    const otherWorkspace = await createWorkspace(outsider.agent, 'Elsewhere');
    const otherProject = await outsider.agent.post(`/api/workspaces/${otherWorkspace.id}/projects`).send({
      name: 'Other',
      key: 'OTH',
      description: 'Private',
    });
    const foreign = await outsider.agent.post(`/api/projects/${otherProject.body.project.id}/issues`).send({ title: 'Outside work' });

    const hidden = await outsider.agent.post(`/api/issues/${waitingId}/blockers`).send({ blockerId: foundationId });
    expect(hidden.status).toBe(404);

    const self = await owner.agent.post(`/api/issues/${waitingId}/blockers`).send({ blockerId: waitingId });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('self_block');

    const outside = await owner.agent.post(`/api/issues/${waitingId}/blockers`).send({ blockerId: foreign.body.issue.id });
    expect(outside.status).toBe(404);

    const linked = await owner.agent.post(`/api/issues/${waitingId}/blockers`).send({ blockerId: foundationId });
    expect(linked.status).toBe(201);
    expect(linked.body.issue.blocked).toBe(true);
    expect(linked.body.issue.blockedBy.map((item: { key: string }) => item.key)).toEqual(['API-1']);

    const duplicate = await owner.agent.post(`/api/issues/${waitingId}/blockers`).send({ blockerId: foundationId });
    expect(duplicate.status).toBe(409);

    const cycle = await owner.agent.post(`/api/issues/${foundationId}/blockers`).send({ blockerId: waitingId });
    expect(cycle.status).toBe(400);
    expect(cycle.body.error.code).toBe('blocker_cycle');

    const blockerView = await owner.agent.get(`/api/issues/${foundationId}`);
    expect(blockerView.body.issue.blocked).toBe(false);
    expect(blockerView.body.issue.blocking.map((item: { key: string }) => item.key)).toEqual(['WEB-1']);

    const byKey = await owner.agent.get(`/api/workspaces/${workspace.id}/search`).query({ q: 'WEB-1' });
    expect(byKey.body.issues.map((item: { title: string }) => item.title)).toContain('Show the inbox live');

    const queue = await teammate.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    const queued = queue.body.groups.flatMap((group: { issues: { title: string; blocked: boolean }[] }) => group.issues);
    expect(queued.find((item: { title: string }) => item.title === 'Show the inbox live').blocked).toBe(true);

    const done = await owner.agent.patch(`/api/issues/${foundationId}`).send({ status: 'done' });
    expect(done.status).toBe(200);
    const cleared = await teammate.agent.get(`/api/issues/${waitingId}`);
    expect(cleared.body.issue.blocked).toBe(false);
    expect(cleared.body.issue.blockedBy.map((item: { status: string }) => item.status)).toEqual(['done']);
    const notes = await teammate.agent.get('/api/notifications');
    expect(notes.body.notifications.some((item: { message: string }) => item.message.includes('API-1 is done, so WEB-1 is no longer blocked'))).toBe(
      true,
    );

    const reopened = await owner.agent.patch(`/api/issues/${foundationId}`).send({ status: 'todo' });
    expect(reopened.status).toBe(200);
    const blockedAgain = await teammate.agent.get(`/api/issues/${waitingId}`);
    expect(blockedAgain.body.issue.blocked).toBe(true);

    const removed = await teammate.agent.delete(`/api/issues/${waitingId}/blockers/${foundationId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.issue.blocked).toBe(false);
    expect(removed.body.issue.blockedBy).toEqual([]);
    const blockerAfter = await owner.agent.get(`/api/issues/${foundationId}`);
    expect(blockerAfter.body.issue.blocking).toEqual([]);
  });

  it('notifies followers about comments, status, and blockers, once', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Priya Nair');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Followers');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const issue = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Review the auth change',
    });
    const issueId = issue.body.issue.id as string;
    const other = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Ship the session cookies',
    });

    const hidden = await outsider.agent.post(`/api/issues/${issueId}/watch`);
    expect(hidden.status).toBe(404);

    const followed = await teammate.agent.post(`/api/issues/${issueId}/watch`);
    expect(followed.status).toBe(200);
    expect(followed.body.issue.watching).toBe(true);
    expect(followed.body.issue.watchers.map((person: { name: string }) => person.name)).toEqual(['Priya Nair']);

    const again = await teammate.agent.post(`/api/issues/${issueId}/watch`);
    expect(again.status).toBe(200);
    expect(again.body.issue.watchers).toHaveLength(1);

    const ownerView = await owner.agent.get(`/api/issues/${issueId}`);
    expect(ownerView.body.issue.watching).toBe(false);

    await owner.agent.post(`/api/issues/${issueId}/comments`).send({ body: 'First pass is ready.' });
    await owner.agent.patch(`/api/issues/${issueId}`).send({ status: 'in_progress' });
    await owner.agent.post(`/api/issues/${issueId}/blockers`).send({ blockerId: other.body.issue.id });

    const notes = await teammate.agent.get('/api/notifications');
    const messages = notes.body.notifications.map((item: { message: string }) => item.message) as string[];
    expect(messages.filter((message) => message.includes('commented on API-1'))).toHaveLength(1);
    expect(messages.some((message) => message.includes('moved API-1 to In progress'))).toBe(true);
    expect(messages.some((message) => message.includes('marked API-1 as blocked by API-2'))).toBe(true);

    const ownerNotes = await owner.agent.get('/api/notifications');
    expect(ownerNotes.body.notifications.some((item: { message: string }) => item.message.includes('commented on API-1'))).toBe(false);

    await teammate.agent.delete(`/api/issues/${issueId}/watch`);
    await owner.agent.post(`/api/issues/${issueId}/comments`).send({ body: 'Second pass.' });
    const after = await teammate.agent.get('/api/notifications');
    expect(after.body.notifications.filter((item: { message: string }) => item.message.includes('commented on API-1'))).toHaveLength(1);

    await teammate.agent.post(`/api/issues/${issueId}/watch`);
    const removed = await owner.agent.delete(`/api/workspaces/${workspace.id}/members/${teammate.user.id}`);
    expect(removed.status).toBe(204);
    const cleared = await owner.agent.get(`/api/issues/${issueId}`);
    expect(cleared.body.issue.watchers).toEqual([]);
  });

  it('keeps a checklist on the issue and reports progress in lists', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Checklists');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const created = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Ship signed cookies',
      assigneeIds: [owner.user.id],
    });
    const issueId = created.body.issue.id as string;
    expect(created.body.issue.checklist).toEqual([]);

    const hidden = await outsider.agent.post(`/api/issues/${issueId}/checklist`).send({ text: 'Set HttpOnly' });
    expect(hidden.status).toBe(404);
    const blank = await teammate.agent.post(`/api/issues/${issueId}/checklist`).send({ text: '   ' });
    expect(blank.status).toBe(400);

    const first = await teammate.agent.post(`/api/issues/${issueId}/checklist`).send({ text: 'Set HttpOnly' });
    expect(first.status).toBe(201);
    const second = await owner.agent.post(`/api/issues/${issueId}/checklist`).send({ text: 'Clear the cookie on logout' });
    expect(second.status).toBe(201);
    const steps = second.body.issue.checklist as { id: string; text: string; done: boolean }[];
    expect(steps.map((item) => item.text)).toEqual(['Set HttpOnly', 'Clear the cookie on logout']);
    expect(steps.every((item) => item.done === false)).toBe(true);

    const checked = await teammate.agent.patch(`/api/issues/${issueId}/checklist/${steps[0].id}`).send({ done: true });
    expect(checked.status).toBe(200);
    expect(checked.body.issue.checklist[0]).toMatchObject({ text: 'Set HttpOnly', done: true });

    const renamed = await owner.agent.patch(`/api/issues/${issueId}/checklist/${steps[1].id}`).send({ text: 'Expire the cookie on logout' });
    expect(renamed.body.issue.checklist[1].text).toBe('Expire the cookie on logout');

    const listed = await owner.agent.get(`/api/projects/${project.body.project.id}/issues`);
    expect(listed.body.issues[0].checklist).toEqual([
      { id: steps[0].id, text: 'Set HttpOnly', done: true },
      { id: steps[1].id, text: 'Expire the cookie on logout', done: false },
    ]);

    const missing = await owner.agent.delete(`/api/issues/${issueId}/checklist/${owner.user.id}`);
    expect(missing.status).toBe(404);
    const removed = await owner.agent.delete(`/api/issues/${issueId}/checklist/${steps[1].id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.issue.checklist).toEqual([{ id: steps[0].id, text: 'Set HttpOnly', done: true }]);

    const history = await owner.agent.get(`/api/issues/${issueId}/activity`);
    const messages = history.body.activities.map((item: { message: string }) => item.message) as string[];
    expect(messages.some((message) => message.includes('added a step to API-1'))).toBe(true);
    expect(messages.some((message) => message.includes('checked a step on API-1'))).toBe(true);
    expect(messages.some((message) => message.includes('removed a step from API-1'))).toBe(true);

    for (let index = 0; index < 29; index += 1) {
      const added = await owner.agent.post(`/api/issues/${issueId}/checklist`).send({ text: `Step ${index + 1}` });
      expect(added.status).toBe(201);
    }
    const overflow = await owner.agent.post(`/api/issues/${issueId}/checklist`).send({ text: 'One too many' });
    expect(overflow.status).toBe(400);
  });

  it('reminds assignees once when an issue is due today and once when it is overdue', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Reminders');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const today = dayKey(new Date());
    const created = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Rotate the signing key',
      assigneeIds: [teammate.user.id],
      dueDate: today,
    });
    const issueId = created.body.issue.id as string;
    expect(created.body.issue.overdue).toBe(false);

    expect(await scanDueReminders(new Date())).toBe(1);
    expect(await scanDueReminders(new Date())).toBe(0);
    const first = await teammate.agent.get('/api/notifications');
    expect(first.body.notifications.filter((item: { message: string }) => item.message.includes('API-1 Rotate the signing key is due today'))).toHaveLength(1);
    const ownerNotes = await owner.agent.get('/api/notifications');
    expect(ownerNotes.body.notifications.some((item: { message: string }) => item.message.includes('due today'))).toBe(false);

    const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await owner.agent.patch(`/api/issues/${issueId}`).send({ dueDate: yesterday });
    expect(await scanDueReminders(new Date())).toBe(1);
    expect(await scanDueReminders(new Date())).toBe(0);
    const overdue = await teammate.agent.get('/api/notifications');
    expect(overdue.body.notifications.filter((item: { message: string }) => item.message.includes('API-1 Rotate the signing key is overdue'))).toHaveLength(1);

    await owner.agent.patch(`/api/issues/${issueId}`).send({ status: 'done' });
    expect(await scanDueReminders(new Date())).toBe(0);
  });

  it('keeps one active cycle per project and can filter the board to it', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Cycles');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const other = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'Web Client',
      key: 'WEB',
      description: 'Interface',
    });
    const open = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Ship the session cookie' });
    const finished = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the first notes', status: 'done' });
    const foreign = await owner.agent.post(`/api/projects/${other.body.project.id}/issues`).send({ title: 'Draw the board' });

    const hidden = await outsider.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 1',
      startsAt: '2026-11-01',
      endsAt: '2026-11-14',
    });
    expect(hidden.status).toBe(404);
    const backwards = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 1',
      startsAt: '2026-11-20',
      endsAt: '2026-11-01',
    });
    expect(backwards.status).toBe(400);

    const first = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 1',
      startsAt: '2026-11-01',
      endsAt: '2026-11-14',
    });
    expect(first.status).toBe(201);
    const cycleId = first.body.cycle.id as string;
    await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ cycleId });
    await owner.agent.patch(`/api/issues/${finished.body.issue.id}`).send({ cycleId });
    const wrongProject = await owner.agent.patch(`/api/issues/${foreign.body.issue.id}`).send({ cycleId });
    expect(wrongProject.status).toBe(400);

    const second = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 2',
      startsAt: '2026-11-15',
      endsAt: '2026-11-28',
    });
    expect(second.status).toBe(201);
    expect(second.body.cycle.status).toBe('active');
    const listed = await owner.agent.get(`/api/projects/${projectId}/cycles`);
    expect(listed.body.cycles.map((cycle: { name: string; status: string }) => [cycle.name, cycle.status])).toEqual([
      ['Cycle 2', 'active'],
      ['Cycle 1', 'completed'],
    ]);
    const carried = await owner.agent.get(`/api/issues/${open.body.issue.id}`);
    expect(carried.body.issue.cycle.name).toBe('Cycle 2');
    const stayed = await owner.agent.get(`/api/issues/${finished.body.issue.id}`);
    expect(stayed.body.issue.cycle.name).toBe('Cycle 1');

    const board = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ cycle: 'active' });
    expect(board.body.issues.map((issue: { title: string }) => issue.title)).toEqual(['Ship the session cookie']);
    const analytics = await owner.agent.get(`/api/projects/${projectId}/analytics`);
    expect(analytics.body.analytics.cycle).toMatchObject({ name: 'Cycle 2', total: 1, done: 0, points: 0, pointsDone: 0 });

    const estimated = await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ estimate: 5 });
    expect(estimated.status).toBe(200);
    expect(estimated.body.issue.estimate).toBe(5);
    const rejected = await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ estimate: 4 });
    expect(rejected.status).toBe(400);
    await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ status: 'done' });
    const scored = await owner.agent.get(`/api/projects/${projectId}/analytics`);
    expect(scored.body.analytics.cycle).toMatchObject({ points: 5, pointsDone: 5, done: 1 });
    const clearedEstimate = await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ estimate: null });
    expect(clearedEstimate.body.issue.estimate).toBeNull();

    await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ cycleId: null });

    const commented = await owner.agent.post(`/api/issues/${open.body.issue.id}/comments`).send({ body: 'Still the same discussion.' });
    expect(commented.status).toBe(201);
    const elsewhere = await owner.agent.post('/api/workspaces').send({ name: 'Other', description: 'Separate' });
    const foreignProject = await owner.agent.post(`/api/workspaces/${elsewhere.body.workspace.id}/projects`).send({
      name: 'Elsewhere',
      key: 'ELS',
      description: 'Outside',
    });
    const rejectedMove = await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ projectId: foreignProject.body.project.id });
    expect(rejectedMove.status).toBe(400);
    const moved = await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ projectId: other.body.project.id });
    expect(moved.status).toBe(200);
    expect(moved.body.issue.key).toBe('WEB-2');
    expect(moved.body.issue.project.key).toBe('WEB');
    expect(moved.body.issue.cycle).toBeNull();
    expect(moved.body.issue.estimate).toBeNull();
    const comments = await owner.agent.get(`/api/issues/${open.body.issue.id}/comments`);
    expect(comments.body.comments.map((comment: { body: string }) => comment.body)).toContain('Still the same discussion.');
    const leftBehind = await owner.agent.get(`/api/projects/${projectId}/issues`);
    expect(leftBehind.body.issues.some((issue: { id: string }) => issue.id === open.body.issue.id)).toBe(false);
    const arrived = await owner.agent.get(`/api/projects/${other.body.project.id}/issues`);
    expect(arrived.body.issues.map((issue: { key: string }) => issue.key)).toContain('WEB-2');
    const history = await owner.agent.get(`/api/issues/${open.body.issue.id}/activity`);
    expect(history.body.activities.some((item: { message: string }) => item.message.includes('moved API-1 to WEB-2'))).toBe(true);
    const cleared = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ cycle: 'active' });
    expect(cleared.body.issues).toEqual([]);
  });

  it('nests sub-issues in one workspace and counts direct children', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const workspace = await createWorkspace(owner.agent, 'Sub-issues');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const parent = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Replace the session store' });
    const parentId = parent.body.issue.id as string;
    const child = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Store the signing key',
      parentId,
    });
    expect(child.status).toBe(201);
    expect(child.body.issue.key).toBe('API-2');
    expect(child.body.issue.parent.key).toBe('API-1');

    const open = await owner.agent.get(`/api/issues/${parentId}`);
    expect(open.body.issue.children.map((issue: { key: string }) => issue.key)).toEqual(['API-2']);
    expect(open.body.issue.subissues).toEqual({ total: 1, done: 0 });
    const parentHistory = await owner.agent.get(`/api/issues/${parentId}/activity`);
    expect(parentHistory.body.activities.some((item: { message: string }) => item.message.includes('added API-2 under API-1'))).toBe(true);

    const done = await owner.agent.patch(`/api/issues/${child.body.issue.id}`).send({ status: 'done' });
    expect(done.status).toBe(200);
    const listed = await owner.agent.get(`/api/projects/${projectId}/issues`);
    const counted = listed.body.issues.find((issue: { id: string }) => issue.id === parentId);
    expect(counted.subissues).toEqual({ total: 1, done: 1 });

    const self = await owner.agent.patch(`/api/issues/${parentId}`).send({ parentId });
    expect(self.status).toBe(400);
    const loop = await owner.agent.patch(`/api/issues/${parentId}`).send({ parentId: child.body.issue.id });
    expect(loop.status).toBe(400);

    const elsewhere = await owner.agent.post('/api/workspaces').send({ name: 'Other', description: 'Separate' });
    const foreign = await owner.agent.post(`/api/workspaces/${elsewhere.body.workspace.id}/projects`).send({
      name: 'Elsewhere',
      key: 'ELS',
      description: 'Outside',
    });
    const outside = await owner.agent.post(`/api/projects/${foreign.body.project.id}/issues`).send({ title: 'Outside the workspace' });
    const rejected = await owner.agent.patch(`/api/issues/${child.body.issue.id}`).send({ parentId: outside.body.issue.id });
    expect(rejected.status).toBe(400);

    const removed = await owner.agent.patch(`/api/issues/${child.body.issue.id}`).send({ parentId: null });
    expect(removed.body.issue.parent).toBeNull();
    await owner.agent.patch(`/api/issues/${child.body.issue.id}`).send({ parentId });
    const deleted = await owner.agent.delete(`/api/issues/${parentId}`);
    expect(deleted.status).toBe(204);
    const orphan = await owner.agent.get(`/api/issues/${child.body.issue.id}`);
    expect(orphan.body.issue.parent).toBeNull();
  });

  it('archives a project out of active work and restores it', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Archive');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'Old API',
      key: 'OLD',
      description: 'Finished',
    });
    const projectId = project.body.project.id as string;
    const issue = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Retire the old store',
      assigneeIds: [teammate.user.id],
    });
    expect(issue.status).toBe(201);

    const denied = await teammate.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    expect(denied.status).toBe(403);

    const archived = await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.project.archived).toBe(true);
    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/projects`);
    expect(listed.body.projects.find((item: { id: string }) => item.id === projectId).archived).toBe(true);
    const home = await owner.agent.get(`/api/workspaces/${workspace.id}`);
    expect(home.body.workspace.projectCount).toBe(0);
    expect(home.body.workspace.openIssueCount).toBe(0);
    const mine = await teammate.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(mine.body.total).toBe(0);
    const created = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Should stay closed' });
    expect(created.status).toBe(409);
    const cycle = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 1',
      startsAt: '2026-11-01',
      endsAt: '2026-11-14',
    });
    expect(cycle.status).toBe(409);

    const other = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'Web',
      key: 'WEB',
      description: 'Current',
    });
    const moved = await owner.agent.patch(`/api/issues/${issue.body.issue.id}`).send({ projectId: other.body.project.id });
    expect(moved.status).toBe(200);
    const back = await owner.agent.patch(`/api/issues/${issue.body.issue.id}`).send({ projectId });
    expect(back.status).toBe(409);

    const restored = await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: false });
    expect(restored.body.project.archived).toBe(false);
    const again = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Follow-up' });
    expect(again.status).toBe(201);
    const history = await owner.agent.get(`/api/projects/${projectId}/activity`);
    expect(history.body.activities.some((item: { message: string }) => item.message.includes('archived project OLD'))).toBe(true);
    expect(history.body.activities.some((item: { message: string }) => item.message.includes('restored project OLD'))).toBe(true);
  });

  it('keeps favorites private to the member who pinned them', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Pins');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const issue = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Pin this issue' });
    const issueId = issue.body.issue.id as string;

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/favorites`);
    expect(hidden.status).toBe(404);
    const foreign = await owner.agent.post(`/api/workspaces/${workspace.id}/favorites`).send({
      kind: 'issue',
      targetId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(foreign.status).toBe(400);

    const pinned = await owner.agent.post(`/api/workspaces/${workspace.id}/favorites`).send({ kind: 'project', targetId: projectId });
    expect(pinned.status).toBe(201);
    const again = await owner.agent.post(`/api/workspaces/${workspace.id}/favorites`).send({ kind: 'issue', targetId: issueId });
    expect(again.body.favorites.map((item: { hint: string }) => item.hint)).toEqual(['API', 'API-1']);
    const teammateList = await teammate.agent.get(`/api/workspaces/${workspace.id}/favorites`);
    expect(teammateList.body.favorites).toEqual([]);

    const removed = await owner.agent.delete(`/api/workspaces/${workspace.id}/favorites/project/${projectId}`);
    expect(removed.body.favorites.map((item: { hint: string }) => item.hint)).toEqual(['API-1']);
    await owner.agent.delete(`/api/issues/${issueId}`);
    const afterDelete = await owner.agent.get(`/api/workspaces/${workspace.id}/favorites`);
    expect(afterDelete.body.favorites).toEqual([]);
  });

  it('duplicates an issue into the backlog without its discussion', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Copies');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const label = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'bug', color: '#b42318' });
    const issue = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Lock the session cookie',
      description: 'Keep **HttpOnly** on.',
      status: 'in_progress',
      priority: 'high',
      estimate: 5,
      labelIds: [label.body.label.id],
      assigneeIds: [owner.user.id],
    });
    const issueId = issue.body.issue.id as string;
    await owner.agent.post(`/api/issues/${issueId}/checklist`).send({ text: 'Set the flag' });
    const step = await owner.agent.get(`/api/issues/${issueId}`);
    const itemId = step.body.issue.checklist[0].id as string;
    await owner.agent.patch(`/api/issues/${issueId}/checklist/${itemId}`).send({ done: true });
    await owner.agent.post(`/api/issues/${issueId}/comments`).send({ body: 'Do not copy this.' });

    const hidden = await outsider.agent.post(`/api/issues/${issueId}/duplicate`);
    expect(hidden.status).toBe(404);

    const copy = await owner.agent.post(`/api/issues/${issueId}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.body.issue.key).toBe('API-2');
    expect(copy.body.issue.title).toBe('Lock the session cookie');
    expect(copy.body.issue.description).toContain('**HttpOnly**');
    expect(copy.body.issue.status).toBe('backlog');
    expect(copy.body.issue.priority).toBe('high');
    expect(copy.body.issue.estimate).toBe(5);
    expect(copy.body.issue.labels.map((item: { name: string }) => item.name)).toEqual(['bug']);
    expect(copy.body.issue.checklist).toEqual([{ id: expect.any(String), text: 'Set the flag', done: false }]);
    expect(copy.body.issue.commentCount).toBe(0);
    const comments = await owner.agent.get(`/api/issues/${copy.body.issue.id}/comments`);
    expect(comments.body.comments).toEqual([]);
    const original = await owner.agent.get(`/api/issues/${issueId}`);
    expect(original.body.issue.status).toBe('in_progress');
    expect(original.body.issue.checklist[0].done).toBe(true);
    const history = await owner.agent.get(`/api/issues/${issueId}/activity`);
    expect(history.body.activities.some((item: { message: string }) => item.message.includes('duplicated API-1 as API-2'))).toBe(true);

    await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    const blocked = await owner.agent.post(`/api/issues/${issueId}/duplicate`);
    expect(blocked.status).toBe(409);
  });

  it('links related issues on both sides and drops the link when one is deleted', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Links');
    const otherWorkspace = await createWorkspace(owner.agent, 'Elsewhere');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const web = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'Web Client',
      key: 'WEB',
      description: 'Interface',
    });
    const foreignProject = await owner.agent.post(`/api/workspaces/${otherWorkspace.id}/projects`).send({
      name: 'Other',
      key: 'OTH',
      description: 'Separate',
    });
    const left = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({ title: 'Paginate comments' });
    const right = await owner.agent.post(`/api/projects/${web.body.project.id}/issues`).send({ title: 'Live notification bell' });
    const foreign = await owner.agent.post(`/api/projects/${foreignProject.body.project.id}/issues`).send({ title: 'Outside' });
    const leftId = left.body.issue.id as string;
    const rightId = right.body.issue.id as string;

    const hidden = await outsider.agent.post(`/api/issues/${leftId}/related`).send({ issueId: rightId });
    expect(hidden.status).toBe(404);
    const self = await owner.agent.post(`/api/issues/${leftId}/related`).send({ issueId: leftId });
    expect(self.status).toBe(400);
    const outside = await owner.agent.post(`/api/issues/${leftId}/related`).send({ issueId: foreign.body.issue.id });
    expect(outside.status).toBe(404);

    const linked = await owner.agent.post(`/api/issues/${leftId}/related`).send({ issueId: rightId });
    expect(linked.status).toBe(201);
    expect(linked.body.issue.related.map((item: { key: string }) => item.key)).toEqual(['WEB-1']);
    const otherSide = await owner.agent.get(`/api/issues/${rightId}`);
    expect(otherSide.body.issue.related.map((item: { key: string }) => item.key)).toEqual(['API-1']);
    const duplicate = await owner.agent.post(`/api/issues/${rightId}/related`).send({ issueId: leftId });
    expect(duplicate.status).toBe(409);

    const history = await owner.agent.get(`/api/issues/${rightId}/activity`);
    expect(history.body.activities.some((item: { message: string }) => item.message.includes('related API-1 to WEB-1'))).toBe(true);

    const removed = await owner.agent.delete(`/api/issues/${leftId}/related/${rightId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.issue.related).toEqual([]);
    const cleared = await owner.agent.get(`/api/issues/${rightId}`);
    expect(cleared.body.issue.related).toEqual([]);

    await owner.agent.post(`/api/issues/${leftId}/related`).send({ issueId: rightId });
    await owner.agent.delete(`/api/issues/${rightId}`);
    const afterDelete = await owner.agent.get(`/api/issues/${leftId}`);
    expect(afterDelete.body.issue.related).toEqual([]);
  });

  it('starts an issue from a project template and keeps the checklist', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Shapes');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const label = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'bug', color: '#b42318' });

    const hidden = await outsider.agent.get(`/api/projects/${projectId}/templates`);
    expect(hidden.status).toBe(404);
    const empty = await owner.agent.post(`/api/projects/${projectId}/templates`).send({ name: 'Blank' });
    expect(empty.status).toBe(400);

    const saved = await owner.agent.post(`/api/projects/${projectId}/templates`).send({
      name: 'Bug',
      description: 'What happened.\n\n- Steps',
      priority: 'high',
      estimate: 3,
      labelIds: [label.body.label.id],
      checklist: ['Reproduce the bug', 'Confirm the fix'],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.template.checklist).toEqual(['Reproduce the bug', 'Confirm the fix']);
    const again = await teammate.agent.post(`/api/projects/${projectId}/templates`).send({ name: 'bug', description: 'Other' });
    expect(again.status).toBe(409);

    const template = saved.body.template;
    const issue = await teammate.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Login button does nothing',
      description: template.description,
      status: template.status,
      priority: template.priority,
      estimate: template.estimate,
      labelIds: template.labels.map((item: { id: string }) => item.id),
      checklist: template.checklist,
    });
    expect(issue.status).toBe(201);
    expect(issue.body.issue.priority).toBe('high');
    expect(issue.body.issue.estimate).toBe(3);
    expect(issue.body.issue.labels.map((item: { name: string }) => item.name)).toEqual(['bug']);
    expect(issue.body.issue.checklist.map((item: { text: string; done: boolean }) => ({ text: item.text, done: item.done }))).toEqual([
      { text: 'Reproduce the bug', done: false },
      { text: 'Confirm the fix', done: false },
    ]);

    const denied = await teammate.agent.delete(`/api/projects/${projectId}/templates/${template.id}`);
    expect(denied.status).toBe(403);
    await owner.agent.delete(`/api/workspaces/${workspace.id}/labels/${label.body.label.id}`);
    const listed = await owner.agent.get(`/api/projects/${projectId}/templates`);
    expect(listed.body.templates[0].labels).toEqual([]);
    const removed = await owner.agent.delete(`/api/projects/${projectId}/templates/${template.id}`);
    expect(removed.status).toBe(204);
    const after = await owner.agent.get(`/api/projects/${projectId}/templates`);
    expect(after.body.templates).toEqual([]);
  });

  it('filters a project by label, sorts by priority, and saves both on a view', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const workspace = await createWorkspace(owner.agent, 'Filters');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const bug = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'bug', color: '#b42318' });
    const feature = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'feature', color: '#175cd3' });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Low bug', priority: 'low', labelIds: [bug.body.label.id] });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Urgent bug', priority: 'urgent', labelIds: [bug.body.label.id] });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Feature work', priority: 'high', labelIds: [feature.body.label.id] });

    const bugs = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ label: bug.body.label.id, sort: 'priority' });
    expect(bugs.body.issues.map((issue: { title: string }) => issue.title)).toEqual(['Urgent bug', 'Low bug']);

    const foreign = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Missing label',
      filters: { label: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    });
    expect(foreign.status).toBe(400);

    const saved = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Bugs first',
      shared: true,
      filters: { label: bug.body.label.id, sort: 'priority' },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.view.filters.label).toBe(bug.body.label.id);
    expect(saved.body.view.filters.sort).toBe('priority');

    await owner.agent.delete(`/api/workspaces/${workspace.id}/labels/${bug.body.label.id}`);
    const listed = await owner.agent.get(`/api/projects/${projectId}/views`);
    expect(listed.body.views[0].filters.label).toBe('');
    expect(listed.body.views[0].filters.sort).toBe('priority');
  });

  it('renames and recolors a label without removing it from the issue', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Labels');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const bug = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'bug', color: '#b42318' });
    const feature = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'feature', color: '#175cd3' });
    const same = await owner.agent.post(`/api/workspaces/${workspace.id}/labels`).send({ name: 'Bug', color: '#b54708' });
    expect(same.status).toBe(409);
    const issue = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Login button does nothing',
      labelIds: [bug.body.label.id],
    });

    const hidden = await outsider.agent.patch(`/api/workspaces/${workspace.id}/labels/${bug.body.label.id}`).send({ name: 'defect' });
    expect(hidden.status).toBe(404);
    const empty = await owner.agent.patch(`/api/workspaces/${workspace.id}/labels/${bug.body.label.id}`).send({});
    expect(empty.status).toBe(400);

    const renamed = await owner.agent.patch(`/api/workspaces/${workspace.id}/labels/${bug.body.label.id}`).send({ name: 'defect', color: '#b54708' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.label).toMatchObject({ name: 'defect', color: '#b54708' });
    const loaded = await owner.agent.get(`/api/issues/${issue.body.issue.id}`);
    expect(loaded.body.issue.labels).toEqual([{ id: bug.body.label.id, name: 'defect', color: '#b54708' }]);

    const clash = await owner.agent.patch(`/api/workspaces/${workspace.id}/labels/${feature.body.label.id}`).send({ name: 'Defect' });
    expect(clash.status).toBe(409);
    const history = await owner.agent.get(`/api/workspaces/${workspace.id}/activity`);
    expect(history.body.activities.some((item: { message: string }) => item.message.includes('renamed the label bug to defect'))).toBe(true);
  });

  it('sets status and priority for several issues in one workspace', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Bulk');
    const other = await createWorkspace(owner.agent, 'Elsewhere');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const projectId = project.body.project.id as string;
    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Rate limit login', priority: 'low' });
    const second = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Add request logs', priority: 'medium', status: 'todo' });
    const third = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Leave this one', priority: 'high', status: 'in_review' });
    const foreignProject = await owner.agent.post(`/api/workspaces/${other.id}/projects`).send({
      name: 'Other',
      key: 'OTH',
      description: 'Separate',
    });
    const foreign = await owner.agent.post(`/api/projects/${foreignProject.body.project.id}/issues`).send({ title: 'Other workspace' });

    const hidden = await outsider.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      status: 'in_progress',
    });
    expect(hidden.status).toBe(404);

    const empty = await owner.agent.post('/api/issues/bulk').send({ issueIds: [first.body.issue.id] });
    expect(empty.status).toBe(400);
    const mixed = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, foreign.body.issue.id],
      status: 'done',
    });
    expect(mixed.status).toBe(400);

    const updated = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id, second.body.issue.id],
      status: 'in_progress',
      priority: 'urgent',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.issues).toHaveLength(2);
    expect(updated.body.issues.map((issue: { key: string; status: string; priority: string }) => [issue.key, issue.status, issue.priority])).toEqual([
      ['API-1', 'in_progress', 'urgent'],
      ['API-2', 'in_progress', 'urgent'],
    ]);
    const untouched = await owner.agent.get(`/api/issues/${third.body.issue.id}`);
    expect(untouched.body.issue.status).toBe('in_review');
    expect(untouched.body.issue.priority).toBe('high');

    const archived = await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    expect(archived.status).toBe(200);
    const closed = await owner.agent.post('/api/issues/bulk').send({ issueIds: [third.body.issue.id], status: 'done' });
    expect(closed.status).toBe(409);
    const stillOpen = await owner.agent.get(`/api/issues/${third.body.issue.id}`);
    expect(stillOpen.body.issue.status).toBe('in_review');

    const history = await owner.agent.get(`/api/workspaces/${workspace.id}/activity`);
    const messages = history.body.activities.map((item: { message: string }) => item.message);
    expect(messages.some((message: string) => message.includes('API-1') && message.includes('In progress') && message.includes('Urgent'))).toBe(true);
    expect(messages.some((message: string) => message.includes('API-2') && message.includes('In progress') && message.includes('Urgent'))).toBe(true);
  });

  it('resolves issue keys in one workspace and skips the rest', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Keys');
    const other = await createWorkspace(owner.agent, 'Elsewhere');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const first = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({ title: 'Signed cookies' });
    const second = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({ title: 'Signing key' });
    const foreignProject = await owner.agent.post(`/api/workspaces/${other.id}/projects`).send({
      name: 'Other',
      key: 'API',
      description: 'Separate',
    });
    await owner.agent.post(`/api/projects/${foreignProject.body.project.id}/issues`).send({ title: 'Foreign cookie' });

    const hidden = await outsider.agent.post(`/api/workspaces/${workspace.id}/issue-keys`).send({ keys: ['API-1'] });
    expect(hidden.status).toBe(404);
    const empty = await owner.agent.post(`/api/workspaces/${workspace.id}/issue-keys`).send({ keys: [] });
    expect(empty.status).toBe(400);

    const resolved = await owner.agent.post(`/api/workspaces/${workspace.id}/issue-keys`).send({
      keys: ['api-1', 'API-2', 'API-2', 'API-99', 'nope', 'WEB-1'],
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.issues).toEqual([
      { key: 'API-1', id: first.body.issue.id, title: 'Signed cookies' },
      { key: 'API-2', id: second.body.issue.id, title: 'Signing key' },
    ]);
  });

  it('pins one comment on an issue and moves it to the top', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Notes');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const issue = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({ title: 'Signed cookies' });
    const issueId = issue.body.issue.id as string;
    const first = await owner.agent.post(`/api/issues/${issueId}/comments`).send({ body: 'Ship the cookie change.' });
    const second = await owner.agent.post(`/api/issues/${issueId}/comments`).send({ body: 'Hold for the key rotation.' });

    const hidden = await outsider.agent.post(`/api/comments/${second.body.comment.id}/pin`).send({ pinned: true });
    expect(hidden.status).toBe(404);
    const invalid = await owner.agent.post(`/api/comments/${second.body.comment.id}/pin`).send({});
    expect(invalid.status).toBe(400);

    const pinned = await owner.agent.post(`/api/comments/${second.body.comment.id}/pin`).send({ pinned: true });
    expect(pinned.status).toBe(200);
    expect(pinned.body.comment.pinned).toBe(true);
    const replaced = await owner.agent.post(`/api/comments/${first.body.comment.id}/pin`).send({ pinned: true });
    expect(replaced.body.comment.pinned).toBe(true);

    const listed = await owner.agent.get(`/api/issues/${issueId}/comments`);
    expect(listed.body.comments.map((item: { body: string; pinned: boolean }) => [item.body, item.pinned])).toEqual([
      ['Ship the cookie change.', true],
      ['Hold for the key rotation.', false],
    ]);

    const unpinned = await owner.agent.post(`/api/comments/${first.body.comment.id}/pin`).send({ pinned: false });
    expect(unpinned.body.comment.pinned).toBe(false);
    const restored = await owner.agent.get(`/api/issues/${issueId}/comments`);
    expect(restored.body.comments.map((item: { body: string }) => item.body)).toEqual([
      'Ship the cookie change.',
      'Hold for the key rotation.',
    ]);
    const history = await owner.agent.get(`/api/issues/${issueId}/activity`);
    const messages = history.body.activities.map((item: { message: string }) => item.message);
    expect(messages.some((message: string) => message.includes('pinned a comment on API-1'))).toBe(true);
    expect(messages.some((message: string) => message.includes('unpinned a comment on API-1'))).toBe(true);
  });

  it('lets members add and remove a reaction without notifying anyone', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const outsider = await registerUser(authAgent(), 'Outsider');
    const workspace = await createWorkspace(owner.agent, 'Signals');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Service layer',
    });
    const issue = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({ title: 'Signed cookies' });
    const comment = await teammate.agent.post(`/api/issues/${issue.body.issue.id}/comments`).send({ body: 'Looks good for local dev.' });
    const commentId = comment.body.comment.id as string;
    const before = await teammate.agent.get('/api/notifications');

    const hidden = await outsider.agent.post(`/api/comments/${commentId}/reactions`).send({ emoji: '+1' });
    expect(hidden.status).toBe(404);
    const invalid = await owner.agent.post(`/api/comments/${commentId}/reactions`).send({ emoji: 'rocket' });
    expect(invalid.status).toBe(400);

    const added = await owner.agent.post(`/api/comments/${commentId}/reactions`).send({ emoji: '+1' });
    expect(added.status).toBe(200);
    expect(added.body.comment.reactions).toEqual([{ emoji: '+1', count: 1, mine: true }]);
    const also = await teammate.agent.post(`/api/comments/${commentId}/reactions`).send({ emoji: '+1' });
    expect(also.body.comment.reactions).toEqual([{ emoji: '+1', count: 2, mine: true }]);
    const heart = await owner.agent.post(`/api/comments/${commentId}/reactions`).send({ emoji: 'heart' });
    expect(heart.body.comment.reactions).toEqual([
      { emoji: '+1', count: 2, mine: true },
      { emoji: 'heart', count: 1, mine: true },
    ]);

    const removed = await owner.agent.post(`/api/comments/${commentId}/reactions`).send({ emoji: '+1' });
    expect(removed.body.comment.reactions).toEqual([
      { emoji: '+1', count: 1, mine: false },
      { emoji: 'heart', count: 1, mine: true },
    ]);
    const listed = await teammate.agent.get(`/api/issues/${issue.body.issue.id}/comments`);
    expect(listed.body.comments[0].reactions).toEqual([
      { emoji: '+1', count: 1, mine: true },
      { emoji: 'heart', count: 1, mine: false },
    ]);
    const inbox = await teammate.agent.get('/api/notifications');
    expect(inbox.body.notifications).toHaveLength(before.body.notifications.length);
  });

  it('tracks milestone progress and filters the board by it', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const other = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Web', key: 'WEB' });

    const hidden = await outsider.agent.get(`/api/projects/${projectId}/milestones`);
    expect(hidden.status).toBe(404);

    const archived = await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    expect(archived.status).toBe(200);
    const blocked = await owner.agent.post(`/api/projects/${projectId}/milestones`).send({ name: 'Cookie cutover' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('project_archived');
    await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: false });

    const created = await owner.agent.post(`/api/projects/${projectId}/milestones`).send({ name: 'Cookie cutover', targetDate: '2026-12-01' });
    expect(created.status).toBe(201);
    expect(created.body.milestone).toMatchObject({ name: 'Cookie cutover', targetDate: '2026-12-01', total: 0, done: 0, canDelete: true });
    const duplicate = await owner.agent.post(`/api/projects/${projectId}/milestones`).send({ name: 'cookie cutover' });
    expect(duplicate.status).toBe(409);
    const milestoneId = created.body.milestone.id;

    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie' });
    const second = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Expire the old session', status: 'done' });
    const attached = await owner.agent.patch(`/api/issues/${first.body.issue.id}`).send({ milestoneId });
    expect(attached.body.issue.milestone).toEqual({ id: milestoneId, name: 'Cookie cutover' });
    await owner.agent.patch(`/api/issues/${second.body.issue.id}`).send({ milestoneId });

    const listed = await owner.agent.get(`/api/projects/${projectId}/milestones`);
    expect(listed.body.milestones[0]).toMatchObject({ id: milestoneId, total: 2, done: 1 });
    const filtered = await owner.agent.get(`/api/projects/${projectId}/issues?milestone=${milestoneId}`);
    expect(filtered.body.issues.map((item: { key: string }) => item.key).sort()).toEqual(['API-1', 'API-2']);

    const foreign = await owner.agent.post(`/api/projects/${other.body.project.id}/milestones`).send({ name: 'Launch' });
    const rejected = await owner.agent.patch(`/api/issues/${first.body.issue.id}`).send({ milestoneId: foreign.body.milestone.id });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('invalid_milestone');

    const removed = await owner.agent.delete(`/api/projects/${projectId}/milestones/${milestoneId}`);
    expect(removed.status).toBe(204);
    const cleared = await owner.agent.get(`/api/issues/${first.body.issue.id}`);
    expect(cleared.body.issue.milestone).toBeNull();
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    expect(activity.body.activities.some((item: { message: string }) => item.message.includes('removed the milestone Cookie cutover'))).toBe(true);
  });

  it('lists workspace milestones with overdue first and skips archived projects', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const api = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const web = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Web', key: 'WEB' });
    const old = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    const shift = (days: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      return dayKey(date);
    };

    const late = await owner.agent.post(`/api/projects/${api.body.project.id}/milestones`).send({ name: 'Cookie cutover', targetDate: shift(-2) });
    const soon = await owner.agent.post(`/api/projects/${web.body.project.id}/milestones`).send({ name: 'Board polish', targetDate: shift(10) });
    const openEnded = await owner.agent.post(`/api/projects/${web.body.project.id}/milestones`).send({ name: 'Design notes' });
    const finished = await owner.agent.post(`/api/projects/${api.body.project.id}/milestones`).send({ name: 'Session notes', targetDate: shift(-10) });
    const hidden = await owner.agent.post(`/api/projects/${old.body.project.id}/milestones`).send({ name: 'Retired' });

    const lateIssue = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({ title: 'Sign the cookie' });
    await owner.agent.patch(`/api/issues/${lateIssue.body.issue.id}`).send({ milestoneId: late.body.milestone.id });
    const soonIssue = await owner.agent.post(`/api/projects/${web.body.project.id}/issues`).send({ title: 'Smooth the drag' });
    await owner.agent.patch(`/api/issues/${soonIssue.body.issue.id}`).send({ milestoneId: soon.body.milestone.id });
    const doneIssue = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({ title: 'Write the notes', status: 'done' });
    await owner.agent.patch(`/api/issues/${doneIssue.body.issue.id}`).send({ milestoneId: finished.body.milestone.id });
    const buried = await owner.agent.post(`/api/projects/${old.body.project.id}/issues`).send({ title: 'Leave it' });
    await owner.agent.patch(`/api/issues/${buried.body.issue.id}`).send({ milestoneId: hidden.body.milestone.id });
    await owner.agent.patch(`/api/projects/${old.body.project.id}`).send({ archived: true });

    const denied = await outsider.agent.get(`/api/workspaces/${workspace.id}/roadmap`);
    expect(denied.status).toBe(404);

    const roadmap = await owner.agent.get(`/api/workspaces/${workspace.id}/roadmap`);
    expect(roadmap.status).toBe(200);
    expect(roadmap.body.milestones.map((item: { name: string; state: string }) => `${item.state}:${item.name}`)).toEqual([
      'overdue:Cookie cutover',
      'upcoming:Board polish',
      'undated:Design notes',
      'complete:Session notes',
    ]);
    expect(roadmap.body.milestones[0]).toMatchObject({ total: 1, done: 0, project: { key: 'API' } });
    expect(roadmap.body.milestones.some((item: { name: string }) => item.name === 'Retired')).toBe(false);
    expect(openEnded.body.milestone.targetDate).toBeNull();
  });

  it('hides a snoozed issue from the person who snoozed it', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const outsider = await registerUser(authAgent(), 'Priya Nair');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const issue = await owner.agent.post(`/api/projects/${project.body.project.id}/issues`).send({
      title: 'Show unread notifications',
      assigneeIds: [owner.user.id, teammate.user.id],
      dueDate: dayKey(new Date()),
    });
    const issueId = issue.body.issue.id;
    const tomorrow = (() => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + 1);
      return dayKey(date);
    })();

    const today = await owner.agent.post(`/api/issues/${issueId}/snooze`).send({ until: dayKey(new Date()) });
    expect(today.status).toBe(400);
    const hidden = await outsider.agent.post(`/api/issues/${issueId}/snooze`).send({ until: tomorrow });
    expect(hidden.status).toBe(404);

    const snoozed = await owner.agent.post(`/api/issues/${issueId}/snooze`).send({ until: tomorrow });
    expect(snoozed.status).toBe(200);
    expect(snoozed.body.issue.snoozedUntil).toBe(tomorrow);

    const mine = await owner.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(mine.body.total).toBe(0);
    expect(mine.body.snoozed.map((item: { until: string; issue: { title: string } }) => `${item.until}:${item.issue.title}`)).toEqual([
      `${tomorrow}:Show unread notifications`,
    ]);
    const theirs = await teammate.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(theirs.body.total).toBe(1);
    expect(theirs.body.snoozed).toEqual([]);

    const back = await owner.agent.delete(`/api/issues/${issueId}/snooze`);
    expect(back.status).toBe(200);
    expect(back.body.issue.snoozedUntil).toBeNull();
    const restored = await owner.agent.get(`/api/workspaces/${workspace.id}/my-work`);
    expect(restored.body.total).toBe(1);
    expect(restored.body.counts.dueSoon).toBe(1);
  });

  it('filters a project to issues with no assignee and lists them for the workspace', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const archived = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    const open = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states', priority: 'low' });
    const urgent = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie', priority: 'urgent' });
    const owned = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Already owned', assigneeIds: [owner.user.id] });
    const finished = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Shipped without an owner', status: 'done' });
    const buried = await owner.agent.post(`/api/projects/${archived.body.project.id}/issues`).send({ title: 'Leave it' });
    await owner.agent.patch(`/api/projects/${archived.body.project.id}`).send({ archived: true });

    const filtered = await owner.agent.get(`/api/projects/${projectId}/issues?assignee=none`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.issues.map((item: { title: string }) => item.title).sort()).toEqual(['Shipped without an owner', 'Sign the cookie', 'Write the empty states']);

    const saved = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'No owner',
      filters: { assignee: 'none' },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.view.filters.assignee).toBe('none');

    const denied = await outsider.agent.get(`/api/workspaces/${workspace.id}/unassigned`);
    expect(denied.status).toBe(404);
    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/unassigned`);
    expect(listed.body.total).toBe(2);
    expect(listed.body.issues.map((item: { title: string }) => item.title)).toEqual(['Sign the cookie', 'Write the empty states']);
    expect(owned.body.issue.title).toBe('Already owned');
    expect(finished.body.issue.status).toBe('done');
    expect(buried.body.issue.title).toBe('Leave it');
    expect(open.body.issue.assignees).toEqual([]);
    expect(urgent.body.issue.priority).toBe('urgent');
  });

  it('ends the active cycle and leaves open issues on it', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;

    const missing = await owner.agent.post(`/api/projects/${projectId}/cycles/end`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('no_active_cycle');

    const started = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 12',
      startsAt: '2026-11-16',
      endsAt: '2026-11-23',
    });
    const cycleId = started.body.cycle.id;
    const open = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Ship the session cookie' });
    const finished = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the notes', status: 'done' });
    await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ cycleId });
    await owner.agent.patch(`/api/issues/${finished.body.issue.id}`).send({ cycleId });

    const hidden = await outsider.agent.post(`/api/projects/${projectId}/cycles/end`);
    expect(hidden.status).toBe(404);
    await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    const blocked = await owner.agent.post(`/api/projects/${projectId}/cycles/end`);
    expect(blocked.status).toBe(409);
    await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: false });

    const ended = await owner.agent.post(`/api/projects/${projectId}/cycles/end`);
    expect(ended.status).toBe(200);
    expect(ended.body.cycle).toMatchObject({ name: 'Cycle 12', status: 'completed' });
    const stayed = await owner.agent.get(`/api/issues/${open.body.issue.id}`);
    expect(stayed.body.issue.cycle).toEqual({ id: cycleId, name: 'Cycle 12' });
    const board = await owner.agent.get(`/api/projects/${projectId}/issues`).query({ cycle: 'active' });
    expect(board.body.issues).toEqual([]);

    const next = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 13',
      startsAt: '2026-11-24',
      endsAt: '2026-12-07',
    });
    expect(next.status).toBe(201);
    const still = await owner.agent.get(`/api/issues/${open.body.issue.id}`);
    expect(still.body.issue.cycle.name).toBe('Cycle 12');
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    expect(activity.body.activities.some((item: { message: string }) => item.message.includes('ended Cycle 12 on API'))).toBe(true);
  });

  it('assigns or clears several issues in one workspace', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const second = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Store the signing key' });

    const assigned = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      assigneeId: teammate.user.id,
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.issues.map((issue: { assignees: { id: string }[] }) => issue.assignees.map((person) => person.id))).toEqual([
      [teammate.user.id],
      [teammate.user.id],
    ]);

    const stranger = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id],
      assigneeId: '507f1f77bcf86cd799439011',
    });
    expect(stranger.status).toBe(400);
    expect(stranger.body.error.code).toBe('invalid_assignees');

    const cleared = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      assigneeId: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.issues.every((issue: { assignees: unknown[] }) => issue.assignees.length === 0)).toBe(true);
  });

  it('sets or clears the due date on several issues', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const second = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Store the signing key' });
    const today = new Date();
    const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 2)).toISOString().slice(0, 10);

    const hidden = await outsider.agent.post('/api/issues/bulk').send({ issueIds: [first.body.issue.id], dueDate: due });
    expect(hidden.status).toBe(404);

    const dated = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      dueDate: due,
    });
    expect(dated.status).toBe(200);
    expect(dated.body.issues.map((issue: { dueDate: string }) => issue.dueDate.slice(0, 10))).toEqual([due, due]);

    const again = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      dueDate: due,
    });
    expect(again.status).toBe(200);
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const dueNotes = activity.body.activities.filter((item: { message: string }) => item.message.includes('due date'));
    expect(dueNotes).toHaveLength(2);

    const soon = await owner.agent.get(`/api/workspaces/${workspace.id}/due`);
    expect(soon.body.issues.map((issue: { title: string }) => issue.title).sort()).toEqual(['Store the signing key', 'Write the empty states']);

    const cleared = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      dueDate: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.issues.every((issue: { dueDate: string | null }) => issue.dueDate === null)).toBe(true);
    const after = await owner.agent.get(`/api/workspaces/${workspace.id}/due`);
    expect(after.body.total).toBe(0);
  });

  it('sets or clears the cycle and milestone on several issues', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const other = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Web Client', key: 'WEB' });
    const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset)).toISOString().slice(0, 10);
    const started = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 12',
      startsAt: day(-1),
      endsAt: day(6),
    });
    const cycleId = started.body.cycle.id;
    const foreignCycle = await owner.agent.post(`/api/projects/${other.body.project.id}/cycles`).send({
      name: 'Cycle 4',
      startsAt: day(0),
      endsAt: day(13),
    });
    const milestone = await owner.agent.post(`/api/projects/${projectId}/milestones`).send({ name: 'Cookie cutover', targetDate: day(14) });
    const milestoneId = milestone.body.milestone.id;
    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const second = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Store the signing key' });

    const hidden = await outsider.agent.post('/api/issues/bulk').send({ issueIds: [first.body.issue.id], cycleId });
    expect(hidden.status).toBe(404);

    const foreign = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      cycleId: foreignCycle.body.cycle.id,
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('invalid_cycle');
    const untouched = await owner.agent.get(`/api/issues/${first.body.issue.id}`);
    expect(untouched.body.issue.cycle).toBeNull();

    const placed = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      cycleId,
      milestoneId,
    });
    expect(placed.status).toBe(200);
    expect(placed.body.issues.every((issue: { cycle: { id: string } | null; milestone: { id: string } | null }) => issue.cycle?.id === cycleId && issue.milestone?.id === milestoneId)).toBe(true);

    const again = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      cycleId,
      milestoneId,
    });
    expect(again.status).toBe(200);
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const notes = activity.body.activities.filter((item: { message: string }) => item.message.includes('cycle') && item.message.includes('milestone'));
    expect(notes).toHaveLength(2);

    const onCycle = await owner.agent.get(`/api/projects/${projectId}/issues?cycle=active`);
    expect(onCycle.body.issues.map((issue: { title: string }) => issue.title).sort()).toEqual(['Store the signing key', 'Write the empty states']);
    const onMilestone = await owner.agent.get(`/api/projects/${projectId}/issues?milestone=${milestoneId}`);
    expect(onMilestone.body.total).toBe(2);
    const cycles = await owner.agent.get(`/api/projects/${projectId}/cycles`);
    expect(cycles.body.cycles.find((cycle: { id: string }) => cycle.id === cycleId)).toMatchObject({ total: 2 });
    const milestones = await owner.agent.get(`/api/projects/${projectId}/milestones`);
    expect(milestones.body.milestones.find((item: { id: string }) => item.id === milestoneId)).toMatchObject({ total: 2 });

    const cleared = await owner.agent.post('/api/issues/bulk').send({
      issueIds: [first.body.issue.id, second.body.issue.id],
      cycleId: null,
      milestoneId: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.issues.every((issue: { cycle: unknown; milestone: unknown }) => issue.cycle === null && issue.milestone === null)).toBe(true);
    const emptyCycle = await owner.agent.get(`/api/projects/${projectId}/issues?cycle=active`);
    expect(emptyCycle.body.total).toBe(0);
    const emptyMilestone = await owner.agent.get(`/api/projects/${projectId}/issues?milestone=${milestoneId}`);
    expect(emptyMilestone.body.total).toBe(0);
  });

  it('renames the active cycle and keeps its issues', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const day = (offset: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };

    const started = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 12',
      startsAt: day(-1),
      endsAt: day(6),
    });
    const cycleId = started.body.cycle.id;
    const open = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Keep this on the cycle' });
    await owner.agent.patch(`/api/issues/${open.body.issue.id}`).send({ cycleId });

    const hidden = await outsider.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ name: 'Nope' });
    expect(hidden.status).toBe(404);

    const empty = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({});
    expect(empty.status).toBe(400);

    const backwards = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({
      startsAt: day(4),
      endsAt: day(1),
    });
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.code).toBe('invalid_cycle_dates');

    const past = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ endsAt: day(-1) });
    expect(past.status).toBe(400);

    const updated = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({
      name: 'Cycle 12 extended',
      endsAt: day(20),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.cycle).toMatchObject({ name: 'Cycle 12 extended', startsAt: day(-1), endsAt: day(20), status: 'active', total: 1 });

    const same = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({
      name: 'Cycle 12 extended',
      startsAt: day(-1),
      endsAt: day(20),
    });
    expect(same.status).toBe(200);

    const stayed = await owner.agent.get(`/api/issues/${open.body.issue.id}`);
    expect(stayed.body.issue.cycle).toEqual({ id: cycleId, name: 'Cycle 12 extended' });

    const ended = await owner.agent.post(`/api/projects/${projectId}/cycles/end`);
    expect(ended.status).toBe(200);
    const closed = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ name: 'Too late' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('cycle_closed');

    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const updates = activity.body.activities.filter((item: { message: string }) => item.message.includes('updated Cycle 12 extended on API'));
    expect(updates).toHaveLength(1);
  });

  it('sets a point budget on the active cycle', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset)).toISOString().slice(0, 10);

    const started = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Cycle 12',
      startsAt: day(-1),
      endsAt: day(6),
      capacity: 20,
    });
    expect(started.status).toBe(201);
    expect(started.body.cycle.capacity).toBe(20);
    const cycleId = started.body.cycle.id;

    const hidden = await outsider.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ capacity: 10 });
    expect(hidden.status).toBe(404);
    const zero = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ capacity: 0 });
    expect(zero.status).toBe(400);
    const huge = await owner.agent.post(`/api/projects/${projectId}/cycles`).send({
      name: 'Too big',
      startsAt: day(0),
      endsAt: day(6),
      capacity: 201,
    });
    expect(huge.status).toBe(400);

    const issue = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Keep this on the cycle', estimate: 8 });
    await owner.agent.patch(`/api/issues/${issue.body.issue.id}`).send({ cycleId });
    const tightened = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ capacity: 5 });
    expect(tightened.status).toBe(200);
    expect(tightened.body.cycle).toMatchObject({ capacity: 5, points: 8 });

    const again = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ capacity: 5 });
    expect(again.status).toBe(200);
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const notes = activity.body.activities.filter((item: { message: string }) => item.message.includes('updated Cycle 12 on API'));
    expect(notes).toHaveLength(1);

    const cleared = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ capacity: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.cycle.capacity).toBeNull();

    await owner.agent.post(`/api/projects/${projectId}/cycles/end`);
    const closed = await owner.agent.patch(`/api/projects/${projectId}/cycles/${cycleId}`).send({ capacity: 12 });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('cycle_closed');
  });

  it('lists active cycles and puts one over its budget first', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const api = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const docs = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Docs', key: 'DOCS' });
    const web = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Web Client', key: 'WEB' });
    const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset)).toISOString().slice(0, 10);

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/cycles`);
    expect(hidden.status).toBe(404);

    const apiCycle = await owner.agent.post(`/api/projects/${api.body.project.id}/cycles`).send({
      name: 'Cycle 12',
      startsAt: day(-1),
      endsAt: day(6),
      capacity: 20,
    });
    const apiIssue = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({ title: 'Keep the session', estimate: 8 });
    await owner.agent.patch(`/api/issues/${apiIssue.body.issue.id}`).send({ cycleId: apiCycle.body.cycle.id });

    const docsCycle = await owner.agent.post(`/api/projects/${docs.body.project.id}/cycles`).send({
      name: 'Cycle 2',
      startsAt: day(0),
      endsAt: day(1),
    });
    const docsIssue = await owner.agent.post(`/api/projects/${docs.body.project.id}/issues`).send({ title: 'Write the guide', estimate: 2 });
    await owner.agent.patch(`/api/issues/${docsIssue.body.issue.id}`).send({ cycleId: docsCycle.body.cycle.id });

    const webCycle = await owner.agent.post(`/api/projects/${web.body.project.id}/cycles`).send({
      name: 'Cycle 4',
      startsAt: day(0),
      endsAt: day(13),
      capacity: 5,
    });
    const webIssue = await owner.agent.post(`/api/projects/${web.body.project.id}/issues`).send({ title: 'Drag the cards', estimate: 8 });
    await owner.agent.patch(`/api/issues/${webIssue.body.issue.id}`).send({ cycleId: webCycle.body.cycle.id });

    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/cycles`);
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(3);
    expect(listed.body.cycles.map((cycle: { name: string; overBudget: boolean; project: { key: string }; points: number; capacity: number | null }) => ({
      name: cycle.name,
      key: cycle.project.key,
      overBudget: cycle.overBudget,
      points: cycle.points,
      capacity: cycle.capacity,
    }))).toEqual([
      { name: 'Cycle 4', key: 'WEB', overBudget: true, points: 8, capacity: 5 },
      { name: 'Cycle 2', key: 'DOCS', overBudget: false, points: 2, capacity: null },
      { name: 'Cycle 12', key: 'API', overBudget: false, points: 8, capacity: 20 },
    ]);

    const archived = await owner.agent.patch(`/api/projects/${docs.body.project.id}`).send({ archived: true });
    expect(archived.status).toBe(200);
    const afterArchive = await owner.agent.get(`/api/workspaces/${workspace.id}/cycles`);
    expect(afterArchive.body.cycles.map((cycle: { project: { key: string } }) => cycle.project.key)).toEqual(['WEB', 'API']);

    const ended = await owner.agent.post(`/api/projects/${web.body.project.id}/cycles/end`);
    expect(ended.status).toBe(200);
    const afterEnd = await owner.agent.get(`/api/workspaces/${workspace.id}/cycles`);
    expect(afterEnd.body.total).toBe(1);
    expect(afterEnd.body.cycles[0]).toMatchObject({ name: 'Cycle 12', overBudget: false, project: { key: 'API' } });

    const tightened = await owner.agent.patch(`/api/projects/${api.body.project.id}/cycles/${apiCycle.body.cycle.id}`).send({ capacity: 3 });
    expect(tightened.status).toBe(200);
    const over = await owner.agent.get(`/api/workspaces/${workspace.id}/cycles`);
    expect(over.body.cycles[0]).toMatchObject({ name: 'Cycle 12', overBudget: true, points: 8, capacity: 3 });
  });

  it('renames a milestone and moves its date without dropping issues', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const shift = (days: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      return dayKey(date);
    };

    const created = await owner.agent.post(`/api/projects/${projectId}/milestones`).send({ name: 'Cookie cutover', targetDate: shift(-2) });
    const milestoneId = created.body.milestone.id;
    await owner.agent.post(`/api/projects/${projectId}/milestones`).send({ name: 'Board polish' });
    const issue = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie' });
    await owner.agent.patch(`/api/issues/${issue.body.issue.id}`).send({ milestoneId });

    const hidden = await outsider.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({ name: 'Nope' });
    expect(hidden.status).toBe(404);
    const empty = await owner.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({});
    expect(empty.status).toBe(400);
    const duplicate = await owner.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({ name: 'board polish' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('milestone_exists');

    const updated = await owner.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({
      name: 'Signed cookies',
      targetDate: shift(14),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.milestone).toMatchObject({ name: 'Signed cookies', targetDate: shift(14), total: 1, done: 0 });

    const same = await owner.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({
      name: 'Signed cookies',
      targetDate: shift(14),
    });
    expect(same.status).toBe(200);

    const stayed = await owner.agent.get(`/api/issues/${issue.body.issue.id}`);
    expect(stayed.body.issue.milestone).toEqual({ id: milestoneId, name: 'Signed cookies' });

    const cleared = await owner.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({ targetDate: null });
    expect(cleared.body.milestone.targetDate).toBeNull();
    const roadmap = await owner.agent.get(`/api/workspaces/${workspace.id}/roadmap`);
    expect(roadmap.body.milestones.find((item: { id: string }) => item.id === milestoneId)).toMatchObject({
      name: 'Signed cookies',
      state: 'undated',
      targetDate: null,
    });

    await owner.agent.patch(`/api/projects/${projectId}`).send({ archived: true });
    const blocked = await owner.agent.patch(`/api/projects/${projectId}/milestones/${milestoneId}`).send({ name: 'Too late' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('project_archived');

    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const updates = activity.body.activities.filter((item: { message: string }) => item.message.includes('updated the milestone'));
    expect(updates).toHaveLength(2);
  });

  it('renames a project and keeps its key and issue numbers', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const member = await registerUser(authAgent(), 'Jonah Patel');
    const outsider = await registerUser(authAgent(), 'Priya Nair');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: member.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({
      name: 'API Platform',
      key: 'API',
      description: 'Auth, workspaces, and the issue API.',
    });
    const projectId = project.body.project.id;
    const issue = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie' });
    await owner.agent.post(`/api/workspaces/${workspace.id}/favorites`).send({ kind: 'project', targetId: projectId });

    const hidden = await outsider.agent.patch(`/api/projects/${projectId}`).send({ name: 'Nope' });
    expect(hidden.status).toBe(404);
    const denied = await member.agent.patch(`/api/projects/${projectId}`).send({ name: 'Nope' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden');
    const blank = await owner.agent.patch(`/api/projects/${projectId}`).send({ name: ' ' });
    expect(blank.status).toBe(400);

    const updated = await owner.agent.patch(`/api/projects/${projectId}`).send({
      name: 'API Services',
      description: 'Signed cookies and the session store.',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.project).toMatchObject({
      name: 'API Services',
      key: 'API',
      description: 'Signed cookies and the session store.',
    });

    const same = await owner.agent.patch(`/api/projects/${projectId}`).send({
      name: 'API Services',
      description: 'Signed cookies and the session store.',
    });
    expect(same.status).toBe(200);

    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/projects`);
    expect(listed.body.projects.find((item: { id: string }) => item.id === projectId)).toMatchObject({
      name: 'API Services',
      key: 'API',
      description: 'Signed cookies and the session store.',
    });
    const stayed = await owner.agent.get(`/api/issues/${issue.body.issue.id}`);
    expect(stayed.body.issue.key).toBe('API-1');
    expect(stayed.body.issue.project).toMatchObject({ key: 'API', name: 'API Services' });

    const favorites = await owner.agent.get(`/api/workspaces/${workspace.id}/favorites`);
    expect(favorites.body.favorites.find((item: { kind: string }) => item.kind === 'project')).toMatchObject({
      label: 'API Services',
      hint: 'API',
    });

    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const renames = activity.body.activities.filter((item: { message: string }) => item.message.includes('renamed API to API Services'));
    expect(renames).toHaveLength(1);
  });

  it('limits workspace activity to one project and keeps issue links', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const elsewhere = await createWorkspace(owner.agent, 'Elsewhere');
    const api = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const web = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Web Client', key: 'WEB' });
    const foreign = await owner.agent.post(`/api/workspaces/${elsewhere.id}/projects`).send({ name: 'Other', key: 'OTH' });
    const apiIssue = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({ title: 'Sign the cookie' });
    await owner.agent.post(`/api/projects/${web.body.project.id}/issues`).send({ title: 'Smooth the drag' });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/activity?project=${api.body.project.id}`);
    expect(hidden.status).toBe(404);
    const missing = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?project=${foreign.body.project.id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');

    const filtered = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?project=${api.body.project.id}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.activities.length).toBeGreaterThan(0);
    expect(filtered.body.activities.every((item: { projectId: string }) => item.projectId === api.body.project.id)).toBe(true);
    expect(filtered.body.activities.some((item: { message: string }) => item.message.includes('WEB'))).toBe(false);
    const linked = filtered.body.activities.find((item: { issueId: string | null }) => item.issueId === apiIssue.body.issue.id);
    expect(linked?.issueId).toBe(apiIssue.body.issue.id);

    const all = await owner.agent.get(`/api/workspaces/${workspace.id}/activity`);
    expect(all.body.activities.some((item: { message: string }) => item.message.includes('WEB'))).toBe(true);
    expect(all.body.activities.some((item: { message: string }) => item.message.includes('API'))).toBe(true);
  });

  it('lists open issues that have not changed for a week', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const old = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const finished = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Ship the notes', status: 'done' });
    const fresh = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie' });
    const commented = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Store the signing key' });
    const buried = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    const buriedIssue = await owner.agent.post(`/api/projects/${buried.body.project.id}/issues`).send({ title: 'Leave it' });
    const ago = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await Issue.updateOne({ _id: old.body.issue.id }, { $set: { updatedAt: ago } }, { timestamps: false });
    await Issue.updateOne({ _id: finished.body.issue.id }, { $set: { updatedAt: ago } }, { timestamps: false });
    await Issue.updateOne({ _id: commented.body.issue.id }, { $set: { updatedAt: ago } }, { timestamps: false });
    await Issue.updateOne({ _id: buriedIssue.body.issue.id }, { $set: { updatedAt: ago } }, { timestamps: false });
    await owner.agent.post(`/api/issues/${commented.body.issue.id}/comments`).send({ body: 'Still looking at this.' });
    await owner.agent.patch(`/api/projects/${buried.body.project.id}`).send({ archived: true });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/quiet`);
    expect(hidden.status).toBe(404);

    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/quiet`);
    expect(listed.status).toBe(200);
    expect(listed.body.days).toBe(7);
    expect(listed.body.issues.map((item: { title: string }) => item.title)).toEqual(['Write the empty states']);
    expect(listed.body.total).toBe(1);

    const wider = await owner.agent.get(`/api/workspaces/${workspace.id}/quiet?days=30`);
    expect(wider.body.total).toBe(0);
    expect(fresh.body.issue.title).toBe('Sign the cookie');

    const board = await owner.agent.get(`/api/projects/${projectId}/issues?quiet=true`);
    expect(board.body.issues.map((item: { title: string }) => item.title)).toEqual(['Write the empty states']);

    const saved = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Quiet',
      filters: { quiet: true },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.view.filters.quiet).toBe(true);
  });

  it('lists open issues that are overdue or due within the week', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const today = new Date();
    const day = (offset: number) => {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
      return date.toISOString().slice(0, 10);
    };
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Enforce roles', dueDate: day(-1), priority: 'urgent' });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Show notifications', dueDate: day(0) });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Clear the cookie', dueDate: day(1) });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Drag columns', dueDate: day(2) });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Plan the quarter', dueDate: day(20) });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Ship the notes', status: 'done', dueDate: day(-2) });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const buried = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    await owner.agent.post(`/api/projects/${buried.body.project.id}/issues`).send({ title: 'Leave it', dueDate: day(-1) });
    await owner.agent.patch(`/api/projects/${buried.body.project.id}`).send({ archived: true });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/due`);
    expect(hidden.status).toBe(404);

    const soon = await owner.agent.get(`/api/workspaces/${workspace.id}/due?days=1`);
    expect(soon.status).toBe(200);
    expect(soon.body.days).toBe(1);
    expect(soon.body.issues.map((item: { title: string }) => item.title)).toEqual(['Enforce roles', 'Show notifications', 'Clear the cookie']);
    expect(soon.body.issues[0].overdue).toBe(true);
    expect(soon.body.total).toBe(3);

    const week = await owner.agent.get(`/api/workspaces/${workspace.id}/due`);
    expect(week.body.days).toBe(7);
    expect(week.body.issues.map((item: { title: string }) => item.title)).toEqual([
      'Enforce roles',
      'Show notifications',
      'Clear the cookie',
      'Drag columns',
    ]);
    expect(week.body.total).toBe(4);

    const wider = await owner.agent.get(`/api/workspaces/${workspace.id}/due?days=30`);
    expect(wider.body.total).toBe(5);
    expect(wider.body.issues.at(-1).title).toBe('Plan the quarter');

    const board = await owner.agent.get(`/api/projects/${projectId}/issues?dueSoon=true`);
    expect(board.body.issues.map((item: { title: string }) => item.title).sort()).toEqual(
      ['Clear the cookie', 'Drag columns', 'Enforce roles', 'Show notifications'].sort(),
    );

    const saved = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Due soon',
      filters: { dueSoon: true },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.view.filters.dueSoon).toBe(true);
    expect(dayKey(today)).toBe(day(0));
  });

  it('lists open issues that are still blocked', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const waiting = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Paginate comments', priority: 'high' });
    const foundation = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Enforce roles' });
    const finished = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Ship the notes', status: 'done' });
    const free = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie' });
    const buried = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    const buriedIssue = await owner.agent.post(`/api/projects/${buried.body.project.id}/issues`).send({ title: 'Leave it' });
    await owner.agent.post(`/api/issues/${waiting.body.issue.id}/blockers`).send({ blockerId: foundation.body.issue.id });
    await owner.agent.post(`/api/issues/${finished.body.issue.id}/blockers`).send({ blockerId: foundation.body.issue.id });
    await owner.agent.post(`/api/issues/${buriedIssue.body.issue.id}/blockers`).send({ blockerId: foundation.body.issue.id });
    await owner.agent.patch(`/api/projects/${buried.body.project.id}`).send({ archived: true });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/blocked`);
    expect(hidden.status).toBe(404);

    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/blocked`);
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.issues.map((item: { title: string }) => item.title)).toEqual(['Paginate comments']);
    expect(listed.body.issues[0].blockedBy.map((item: { key: string }) => item.key)).toEqual([`API-${foundation.body.issue.number}`]);
    expect(free.body.issue.title).toBe('Sign the cookie');

    const board = await owner.agent.get(`/api/projects/${projectId}/issues?blocked=true`);
    expect(board.body.issues.map((item: { title: string }) => item.title)).toEqual(['Paginate comments']);

    const saved = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'Blocked',
      filters: { blocked: true },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.view.filters.blocked).toBe(true);

    await owner.agent.patch(`/api/issues/${foundation.body.issue.id}`).send({ status: 'done' });
    const cleared = await owner.agent.get(`/api/workspaces/${workspace.id}/blocked`);
    expect(cleared.body.total).toBe(0);
  });

  it('limits workspace activity to one kind of change', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const teammate = await registerUser(authAgent(), 'Priya Nair');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: teammate.email, role: 'member' });
    const api = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const web = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Web Client', key: 'WEB' });
    const waiting = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({ title: 'Paginate comments' });
    const foundation = await owner.agent.post(`/api/projects/${api.body.project.id}/issues`).send({ title: 'Enforce roles' });
    await owner.agent.post(`/api/issues/${waiting.body.issue.id}/comments`).send({ body: 'The first page should stay small.' });
    await owner.agent.post(`/api/issues/${waiting.body.issue.id}/blockers`).send({ blockerId: foundation.body.issue.id });
    await owner.agent.post(`/api/projects/${web.body.project.id}/issues`).send({ title: 'Smooth the drag' });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/activity?kind=comments`);
    expect(hidden.status).toBe(404);
    const unknown = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?kind=labels`);
    expect(unknown.status).toBe(400);

    const comments = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?kind=comments`);
    expect(comments.status).toBe(200);
    expect(comments.body.activities.length).toBeGreaterThan(0);
    expect(comments.body.activities.every((item: { message: string }) => item.message.toLowerCase().includes('comment'))).toBe(true);
    expect(comments.body.activities.some((item: { message: string }) => item.message.includes('WEB'))).toBe(false);

    const blockers = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?kind=blockers`);
    expect(blockers.body.activities.every((item: { message: string }) => item.message.includes('blocked'))).toBe(true);
    expect(blockers.body.activities.some((item: { message: string }) => item.message.includes('blocked by'))).toBe(true);

    const issues = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?kind=issues&project=${api.body.project.id}`);
    expect(issues.body.activities.some((item: { message: string }) => item.message.includes('Paginate comments'))).toBe(true);
    expect(issues.body.activities.some((item: { message: string }) => item.message.toLowerCase().includes('commented'))).toBe(false);
    expect(issues.body.activities.some((item: { message: string }) => item.message.includes('WEB'))).toBe(false);

    const members = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?kind=members`);
    expect(members.body.activities.some((item: { message: string }) => item.message.includes('Priya Nair'))).toBe(true);
    expect(members.body.activities.some((item: { message: string }) => item.message.includes('Paginate comments'))).toBe(false);

    const elsewhere = await owner.agent.get(`/api/workspaces/${workspace.id}/activity?kind=comments&project=${web.body.project.id}`);
    expect(elsewhere.body.activities).toEqual([]);
  });

  it('counts open work for each member', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const member = await registerUser(authAgent(), 'Priya Nair');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    await owner.agent.post(`/api/workspaces/${workspace.id}/invites`).send({ email: member.email, role: 'member' });
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const today = new Date();
    const day = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10);
    const shared = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Enforce roles',
      dueDate: day(-1),
      estimate: 8,
      assigneeIds: [owner.user.id, member.user.id],
    });
    const later = await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Drag columns',
      dueDate: day(2),
      estimate: 5,
      assigneeIds: [member.user.id],
    });
    await owner.agent.post(`/api/issues/${later.body.issue.id}/blockers`).send({ blockerId: shared.body.issue.id });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({
      title: 'Ship the notes',
      status: 'done',
      assigneeIds: [owner.user.id],
    });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const buried = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    await owner.agent.post(`/api/projects/${buried.body.project.id}/issues`).send({
      title: 'Leave it',
      assigneeIds: [owner.user.id],
      estimate: 2,
    });
    await owner.agent.patch(`/api/projects/${buried.body.project.id}`).send({ archived: true });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/workload`);
    expect(hidden.status).toBe(404);

    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/workload`);
    expect(listed.status).toBe(200);
    expect(listed.body.people.map((person: { user: { name: string } }) => person.user.name)).toEqual(['Priya Nair', 'Maya Chen']);
    expect(listed.body.people[0]).toMatchObject({ open: 2, overdue: 1, blocked: 1, points: 13 });
    expect(listed.body.people[0].issues.map((issue: { title: string }) => issue.title)).toEqual(['Enforce roles', 'Drag columns']);
    expect(listed.body.people[1]).toMatchObject({ open: 1, overdue: 1, blocked: 0, points: 8 });
    expect(listed.body.people[1].issues.map((issue: { title: string }) => issue.title)).toEqual(['Enforce roles']);

    await owner.agent.patch(`/api/issues/${shared.body.issue.id}`).send({ status: 'done' });
    const after = await owner.agent.get(`/api/workspaces/${workspace.id}/workload`);
    expect(after.body.people.map((person: { user: { name: string }; open: number; blocked: number }) => ({
      name: person.user.name,
      open: person.open,
      blocked: person.blocked,
    }))).toEqual([
      { name: 'Priya Nair', open: 1, blocked: 0 },
      { name: 'Maya Chen', open: 0, blocked: 0 },
    ]);
  });

  it('keeps the issues a person opened, newest first', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const other = await createWorkspace(owner.agent, 'Elsewhere');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const foreignProject = await owner.agent.post(`/api/workspaces/${other.id}/projects`).send({ name: 'Other', key: 'OTH' });
    const foreign = await owner.agent.post(`/api/projects/${foreignProject.body.project.id}/issues`).send({ title: 'Leave it' });
    const first = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states' });
    const second = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Store the signing key' });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/recent`);
    expect(hidden.status).toBe(404);
    const hiddenWrite = await outsider.agent.post(`/api/workspaces/${workspace.id}/recent`).send({ issueId: first.body.issue.id });
    expect(hiddenWrite.status).toBe(404);

    const missing = await owner.agent.post(`/api/workspaces/${workspace.id}/recent`).send({ issueId: foreign.body.issue.id });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('invalid_recent');

    await owner.agent.post(`/api/workspaces/${workspace.id}/recent`).send({ issueId: first.body.issue.id });
    await owner.agent.post(`/api/workspaces/${workspace.id}/recent`).send({ issueId: second.body.issue.id });
    const opened = await owner.agent.post(`/api/workspaces/${workspace.id}/recent`).send({ issueId: first.body.issue.id });
    expect(opened.status).toBe(200);
    expect(opened.body.recent.map((item: { key: string }) => item.key)).toEqual(['API-1', 'API-2']);

    const rest = [];
    for (let index = 0; index < 7; index += 1) {
      const created = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: `Follow up ${index}` });
      rest.push(created.body.issue.id as string);
      await owner.agent.post(`/api/workspaces/${workspace.id}/recent`).send({ issueId: created.body.issue.id });
    }
    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/recent`);
    expect(listed.body.recent).toHaveLength(8);
    expect(listed.body.recent.map((item: { title: string }) => item.title)).not.toContain('Store the signing key');
    expect(listed.body.recent[0].title).toBe('Follow up 6');

    await owner.agent.delete(`/api/issues/${rest[6]}`);
    const after = await owner.agent.get(`/api/workspaces/${workspace.id}/recent`);
    expect(after.body.recent.map((item: { title: string }) => item.title)).not.toContain('Follow up 6');
    expect(after.body.recent[0].title).toBe('Follow up 5');
  });

  it('lists open issues that have no estimate', async () => {
    const owner = await registerUser(authAgent(), 'Maya Chen');
    const outsider = await registerUser(authAgent(), 'Jonah Patel');
    const workspace = await createWorkspace(owner.agent, 'Northwind');
    const project = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'API Platform', key: 'API' });
    const projectId = project.body.project.id;
    const archived = await owner.agent.post(`/api/workspaces/${workspace.id}/projects`).send({ name: 'Old', key: 'OLD' });
    const urgent = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Sign the cookie', priority: 'urgent' });
    await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Write the empty states', priority: 'low' });
    const sized = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Store the signing key', estimate: 3 });
    const finished = await owner.agent.post(`/api/projects/${projectId}/issues`).send({ title: 'Ship the notes', status: 'done' });
    const buried = await owner.agent.post(`/api/projects/${archived.body.project.id}/issues`).send({ title: 'Leave it' });
    await owner.agent.patch(`/api/projects/${archived.body.project.id}`).send({ archived: true });

    const hidden = await outsider.agent.get(`/api/workspaces/${workspace.id}/unestimated`);
    expect(hidden.status).toBe(404);

    const board = await owner.agent.get(`/api/projects/${projectId}/issues?unestimated=true`);
    expect(board.body.issues.map((item: { title: string }) => item.title).sort()).toEqual(['Ship the notes', 'Sign the cookie', 'Write the empty states']);

    const saved = await owner.agent.post(`/api/projects/${projectId}/views`).send({
      name: 'No estimate',
      filters: { unestimated: true },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.view.filters.unestimated).toBe(true);

    const listed = await owner.agent.get(`/api/workspaces/${workspace.id}/unestimated`);
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(2);
    expect(listed.body.issues.map((item: { title: string }) => item.title)).toEqual(['Sign the cookie', 'Write the empty states']);
    expect(sized.body.issue.estimate).toBe(3);
    expect(finished.body.issue.status).toBe('done');
    expect(buried.body.issue.title).toBe('Leave it');

    await owner.agent.patch(`/api/issues/${urgent.body.issue.id}`).send({ estimate: 5 });
    const after = await owner.agent.get(`/api/workspaces/${workspace.id}/unestimated`);
    expect(after.body.issues.map((item: { title: string }) => item.title)).toEqual(['Write the empty states']);
  });
});
