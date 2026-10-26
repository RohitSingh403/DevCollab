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
});
