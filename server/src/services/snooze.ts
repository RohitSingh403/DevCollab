import { dayKey, parseDay, utcDayStart } from '../dates';
import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { Snooze } from '../models/Snooze';
import { membershipFor } from './membership';

const HORIZON_DAYS = 366;

export async function activeSnoozes(userId: string, workspaceId: string, now = new Date()) {
  const start = utcDayStart(now);
  await Snooze.deleteMany({ user: userId, workspace: workspaceId, until: { $lte: start } });
  return Snooze.find({ user: userId, workspace: workspaceId, until: { $gt: start } });
}

export async function snoozedUntil(userId: string, issueId: string, now = new Date()) {
  const snooze = await Snooze.findOne({ user: userId, issue: issueId, until: { $gt: utcDayStart(now) } }).select('until');
  return snooze ? dayKey(snooze.until) : null;
}

export async function snoozeIssue(issueId: string, actorId: string, until: string, now = new Date()) {
  const issue = await Issue.findById(issueId).select('workspace status');
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  await membershipFor(actorId, String(issue.workspace));
  if (issue.status === 'done') throw new ApiError(409, 'A finished issue does not need a snooze', 'issue_done');
  const date = parseDay(until);
  const today = dayKey(now);
  if (!date || dayKey(date) <= today) throw new ApiError(400, 'Pick a date after today', 'invalid_date');
  const horizon = new Date(utcDayStart(now));
  horizon.setUTCDate(horizon.getUTCDate() + HORIZON_DAYS);
  if (date.getTime() > horizon.getTime()) throw new ApiError(400, 'Snooze covers up to a year', 'invalid_date');
  const snooze = await Snooze.findOneAndUpdate(
    { user: actorId, issue: issue._id },
    { user: actorId, workspace: issue.workspace, issue: issue._id, until: date },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { until: dayKey(snooze.until) };
}

export async function unsnoozeIssue(issueId: string, actorId: string) {
  const issue = await Issue.findById(issueId).select('workspace');
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  await membershipFor(actorId, String(issue.workspace));
  await Snooze.deleteOne({ user: actorId, issue: issue._id });
}

export async function clearIssueSnoozes(issueIds: string[]) {
  if (issueIds.length) await Snooze.deleteMany({ issue: { $in: issueIds } });
}

export async function clearMemberSnoozes(workspaceId: string, userId: string) {
  await Snooze.deleteMany({ workspace: workspaceId, user: userId });
}

export async function clearWorkspaceSnoozes(workspaceId: string) {
  await Snooze.deleteMany({ workspace: workspaceId });
}
