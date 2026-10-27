import { addComment, createIssue } from './issues';
import { createProject } from './projects';
import { createLabel, createWorkspace } from './workspaces';

function daysFromNow(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function workspaceName(name: string) {
  const first = name.trim().split(/\s+/)[0] || 'Your';
  const possessive = /s$/i.test(first) ? `${first}'` : `${first}'s`;
  return `${possessive} workspace`.slice(0, 80);
}

export async function provisionStarter(actor: { id: string; name: string }) {
  const workspace = await createWorkspace(
    actor,
    workspaceName(actor.name),
    'A starter workspace so the board, overview, and activity feed are already in use. Invite your team, then replace these issues with real work.',
  );
  const feature = await createLabel(workspace.id, actor.id, 'feature', '#175cd3');
  const docs = await createLabel(workspace.id, actor.id, 'docs', '#0e7c66');
  const project = await createProject(workspace.id, actor, {
    name: 'First project',
    key: 'APP',
    description: 'Sample issues for the board. Delete them when the real project is ready.',
  });
  const actorRef = { id: actor.id, name: actor.name };

  await createIssue({
    projectId: project.id,
    actor: actorRef,
    title: 'Invite a teammate to this workspace',
    description: 'Owners and admins can invite by email. Someone with an account joins immediately. Everyone else gets a one-time link.',
    status: 'todo',
    priority: 'high',
    assigneeIds: [actor.id],
    labelIds: [feature.id],
    dueDate: daysFromNow(6),
  });
  const moving = await createIssue({
    projectId: project.id,
    actor: actorRef,
    title: 'Move a card between board columns',
    description: 'Drag a card, or open the issue and change its status. The activity feed records the change.',
    status: 'in_progress',
    priority: 'medium',
    assigneeIds: [actor.id],
    labelIds: [feature.id],
    dueDate: daysFromNow(2),
  });
  await createIssue({
    projectId: project.id,
    actor: actorRef,
    title: 'Replace these sample issues with real work',
    description: 'The sample issues are here so a new account is not an empty page. File the work your team actually has.',
    status: 'backlog',
    priority: 'low',
    assigneeIds: [],
    labelIds: [docs.id],
    dueDate: null,
  });
  await createIssue({
    projectId: project.id,
    actor: actorRef,
    title: 'Check the overview after an issue is done',
    description: 'Done this week counts issues that moved to Done. Reopening one clears that timestamp.',
    status: 'done',
    priority: 'medium',
    assigneeIds: [actor.id],
    labelIds: [feature.id],
    dueDate: daysFromNow(-1),
  });
  await addComment({
    issueId: moving.id,
    actor: actorRef,
    body: 'Drag the card to another column, or change Status on the issue. Once a teammate joins, mention them with @their name and they get an inbox alert.',
  });
  return workspace;
}
