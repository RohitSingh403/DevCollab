import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import type { Realtime } from '../realtime';
import { recordActivity } from './activity';
import { getIssue } from './issues';

const MAX_STEPS = 30;

async function load(issueId: string) {
  const issue = await Issue.findById(issueId);
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  return issue;
}

async function publish(
  issue: { _id: unknown; workspace: unknown; project: unknown },
  actor: { id: string; name: string },
  message: (key: string) => string,
  rt?: Realtime,
) {
  const dto = await getIssue(String(issue._id), actor.id);
  await recordActivity(
    {
      workspaceId: String(issue.workspace),
      projectId: String(issue.project),
      issueId: dto.id,
      actorId: actor.id,
      type: 'issue.checklist',
      message: message(dto.key),
    },
    rt,
  );
  rt?.toWorkspace(String(issue.workspace), 'issue:updated', { issueId: dto.id, projectId: String(issue.project) });
  return dto;
}

export async function addChecklistItem(
  input: { issueId: string; actor: { id: string; name: string }; text: string },
  rt?: Realtime,
) {
  const issue = await load(input.issueId);
  if (issue.checklist.length >= MAX_STEPS) {
    throw new ApiError(400, 'A checklist can have at most 30 steps', 'checklist_limit');
  }
  issue.checklist.push({ text: input.text, done: false });
  await issue.save();
  return publish(issue, input.actor, (key) => `${input.actor.name} added a step to ${key}`, rt);
}

export async function updateChecklistItem(
  input: { issueId: string; itemId: string; actor: { id: string; name: string }; text?: string; done?: boolean },
  rt?: Realtime,
) {
  const issue = await load(input.issueId);
  const item = issue.checklist.id(input.itemId);
  if (!item) throw new ApiError(404, 'Checklist step not found', 'not_found');

  let renamed = false;
  let toggled: boolean | null = null;
  if (input.text !== undefined && input.text !== item.text) {
    item.text = input.text;
    renamed = true;
  }
  if (input.done !== undefined && input.done !== item.done) {
    item.done = input.done;
    toggled = input.done;
  }
  if (!renamed && toggled === null) return getIssue(String(issue._id), input.actor.id);

  await issue.save();
  const message =
    toggled === true
      ? (key: string) => `${input.actor.name} checked a step on ${key}`
      : toggled === false
        ? (key: string) => `${input.actor.name} reopened a step on ${key}`
        : (key: string) => `${input.actor.name} renamed a step on ${key}`;
  return publish(issue, input.actor, message, rt);
}

export async function deleteChecklistItem(
  input: { issueId: string; itemId: string; actor: { id: string; name: string } },
  rt?: Realtime,
) {
  const issue = await load(input.issueId);
  const item = issue.checklist.id(input.itemId);
  if (!item) throw new ApiError(404, 'Checklist step not found', 'not_found');
  item.deleteOne();
  await issue.save();
  return publish(issue, input.actor, (key) => `${input.actor.name} removed a step from ${key}`, rt);
}
