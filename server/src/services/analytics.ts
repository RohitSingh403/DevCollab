import mongoose, { type FilterQuery } from 'mongoose';
import { STATUSES, type IssueStatus, type Priority } from '../constants';
import { Activity } from '../models/Activity';
import { Issue } from '../models/Issue';
import { serializeUser } from '../serializers';

function fillDays(rows: { _id: string; count: number }[], days: number) {
  const map = new Map(rows.map((row) => [row._id, row.count]));
  const result: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = day.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}

function normalize(match: FilterQuery<unknown>) {
  const next: Record<string, unknown> = { ...match };
  for (const key of ['workspace', 'project', 'issue', 'user']) {
    const value = next[key];
    if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
      next[key] = new mongoose.Types.ObjectId(value);
    }
  }
  return next;
}

export async function buildAnalytics(issueMatch: FilterQuery<unknown>, activityMatch: FilterQuery<unknown>) {
  const issues = normalize(issueMatch);
  const activity = normalize(activityMatch);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [byStatusRaw, byPriorityRaw, overdue, completedThisWeek, total, assigneeLoad, activityRaw] = await Promise.all([
    Issue.aggregate<{ _id: IssueStatus; count: number }>([
      { $match: issues },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Issue.aggregate<{ _id: Priority; count: number }>([
      { $match: { ...issues, status: { $ne: 'done' } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    Issue.countDocuments({ ...issues, dueDate: { $lt: now }, status: { $ne: 'done' } }),
    Issue.countDocuments({ ...issues, completedAt: { $gte: weekAgo } }),
    Issue.countDocuments(issues),
    Issue.aggregate<{ _id: unknown; count: number; user: { _id: unknown; name: string; email: string; avatarColor: string } }>([
      { $match: { ...issues, status: { $ne: 'done' } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
    ]),
    Activity.aggregate<{ _id: string; count: number }>([
      { $match: { ...activity, createdAt: { $gte: twoWeeksAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const statusMap = new Map(byStatusRaw.map((row) => [row._id, row.count]));
  const priorityMap = new Map(byPriorityRaw.map((row) => [row._id, row.count]));
  const inProgress = statusMap.get('in_progress') ?? 0;
  const inReview = statusMap.get('in_review') ?? 0;
  const done = statusMap.get('done') ?? 0;

  return {
    totals: {
      issues: total,
      open: total - done,
      inProgress,
      inReview,
      done,
      overdue,
      completedThisWeek,
    },
    byStatus: STATUSES.map((status) => ({ status, count: statusMap.get(status) ?? 0 })),
    byPriority: (['urgent', 'high', 'medium', 'low'] as Priority[]).map((priority) => ({
      priority,
      count: priorityMap.get(priority) ?? 0,
    })),
    activityByDay: fillDays(activityRaw, 14),
    assigneeLoad: assigneeLoad.map((row) => ({
      count: row.count,
      user: serializeUser(row.user),
    })),
  };
}
