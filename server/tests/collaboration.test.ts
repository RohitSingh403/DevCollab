import { describe, expect, it } from 'vitest';
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
});
