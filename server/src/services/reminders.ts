import { dueAlertKind } from '../dates';
import { Issue } from '../models/Issue';
import type { Realtime } from '../realtime';
import { notifyUsers } from './notifications';

export async function scanDueReminders(now = new Date(), rt?: Realtime) {
  const issues = await Issue.find({
    status: { $ne: 'done' },
    dueDate: { $ne: null },
    'assignees.0': { $exists: true },
  }).populate('project', 'key');

  let sent = 0;
  for (const issue of issues) {
    if (!issue.dueDate) continue;
    const kind = dueAlertKind(issue.dueDate, now);
    if (!kind) continue;
    const sameDate = issue.dueAlertFor?.getTime() === issue.dueDate.getTime();
    if (sameDate && (issue.dueAlertKind === kind || issue.dueAlertKind === 'overdue')) continue;

    const project = issue.project as { key?: string };
    const key = `${project.key ?? 'ISSUE'}-${issue.number}`;
    issue.dueAlertKind = kind;
    issue.dueAlertFor = issue.dueDate;
    await issue.save();
    await notifyUsers(
      {
        userIds: issue.assignees.map((id) => String(id)),
        workspaceId: String(issue.workspace),
        type: kind === 'today' ? 'issue.due' : 'issue.overdue',
        message: kind === 'today' ? `${key} ${issue.title} is due today` : `${key} ${issue.title} is overdue`,
        link: `/w/${String(issue.workspace)}/issues/${String(issue._id)}`,
      },
      rt,
    );
    sent += 1;
  }
  return sent;
}
