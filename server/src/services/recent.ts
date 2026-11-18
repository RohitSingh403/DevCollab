import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import { RecentIssue } from '../models/RecentIssue';

const RECENT_LIMIT = 8;

export async function listRecent(workspaceId: string, userId: string) {
  const rows = await RecentIssue.find({ workspace: workspaceId, user: userId }).sort({ viewedAt: -1 });
  const issues = await Issue.find({ _id: { $in: rows.map((row) => row.issue) } })
    .select('title number project')
    .populate('project', 'key name');
  const issueById = new Map(issues.map((issue) => [String(issue._id), issue]));
  const recent = [];
  for (const row of rows) {
    const issue = issueById.get(String(row.issue));
    if (!issue) {
      await row.deleteOne();
      continue;
    }
    const project = issue.project as { _id?: unknown; key?: string; name?: string };
    recent.push({
      id: String(row._id),
      issueId: String(issue._id),
      key: `${project.key ?? 'ISSUE'}-${issue.number}`,
      title: issue.title,
      projectId: String(project._id ?? issue.project),
      projectName: project.name ?? 'Project',
    });
  }
  return recent;
}

export async function recordRecent(workspaceId: string, userId: string, issueId: string) {
  const issue = await Issue.findOne({ _id: issueId, workspace: workspaceId }).select('_id');
  if (!issue) throw new ApiError(400, 'That issue is not in this workspace', 'invalid_recent');
  const viewedAt = new Date();
  await RecentIssue.updateOne(
    { user: userId, workspace: workspaceId, issue: issueId },
    { $set: { viewedAt } },
    { upsert: true },
  );
  const extra = await RecentIssue.find({ workspace: workspaceId, user: userId }).sort({ viewedAt: -1 }).skip(RECENT_LIMIT).select('_id');
  if (extra.length) await RecentIssue.deleteMany({ _id: { $in: extra.map((row) => row._id) } });
  return listRecent(workspaceId, userId);
}

export async function clearWorkspaceRecent(workspaceId: string) {
  await RecentIssue.deleteMany({ workspace: workspaceId });
}

export async function clearMemberRecent(workspaceId: string, userId: string) {
  await RecentIssue.deleteMany({ workspace: workspaceId, user: userId });
}

export async function clearIssueRecent(issueIds: string[]) {
  if (!issueIds.length) return;
  await RecentIssue.deleteMany({ issue: { $in: issueIds } });
}
