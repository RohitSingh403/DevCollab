import { ApiError } from '../errors';
import { Issue } from '../models/Issue';
import type { Realtime } from '../realtime';

const WATCH_LIMIT = 40;

export function notifyAudience(issue: { reporter?: unknown; assignees?: unknown[]; watchers?: unknown[] }) {
  const raw = [issue.reporter, ...(issue.assignees ?? []), ...(issue.watchers ?? [])];
  const ids = raw.map((value) => {
    if (!value) return '';
    if (typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
    return String(value);
  });
  return [...new Set(ids.filter((id) => /^[a-f\d]{24}$/i.test(id)))];
}

export async function setWatching(
  issueId: string,
  userId: string,
  watching: boolean,
  rt?: Realtime,
) {
  const issue = await Issue.findById(issueId).select('watchers workspace project');
  if (!issue) throw new ApiError(404, 'Issue not found', 'not_found');
  const current = (issue.watchers ?? []).map((id) => String(id));
  const already = current.includes(userId);
  if (watching && !already) {
    if (current.length >= WATCH_LIMIT) {
      throw new ApiError(400, `An issue can have at most ${WATCH_LIMIT} watchers`, 'watcher_limit');
    }
    await Issue.updateOne({ _id: issueId }, { $addToSet: { watchers: userId } });
  }
  if (!watching && already) {
    await Issue.updateOne({ _id: issueId }, { $pull: { watchers: userId } });
  }
  rt?.toWorkspace(String(issue.workspace), 'issue:updated', { issueId, projectId: String(issue.project) });
}
