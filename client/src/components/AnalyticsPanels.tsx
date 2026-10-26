import { PRIORITY_LABEL, STATUS_LABEL, type IssueStatus } from '../lib/types';
import type { Analytics } from '../lib/types';
import { Avatar, StatusDot } from './ui';

const barClass: Record<IssueStatus, string> = {
  backlog: 'bg-slate-400',
  todo: 'bg-blue-600',
  in_progress: 'bg-amber-500',
  in_review: 'bg-violet-500',
  done: 'bg-emerald-600',
};

export function StatGrid({ analytics }: { analytics: Analytics }) {
  const cards = [
    ['Open', analytics.totals.open, false],
    ['In progress', analytics.totals.inProgress, false],
    ['Overdue', analytics.totals.overdue, analytics.totals.overdue > 0],
    ['Done this week', analytics.totals.completedThisWeek, false],
  ] as const;
  return (
    <section className="panel grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, alert]) => (
        <article key={label} className="border-b border-line px-5 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
          <p className="text-[12px] font-medium text-muted">{label}</p>
          <p className={`mt-1 text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums ${alert ? 'text-danger' : 'text-ink'}`}>{value}</p>
        </article>
      ))}
    </section>
  );
}

export function AnalyticsPanels({ analytics }: { analytics: Analytics }) {
  const maxDay = Math.max(1, ...analytics.activityByDay.map((day) => day.count));
  const maxStatus = Math.max(1, ...analytics.byStatus.map((row) => row.count));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="panel p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold">Status</h2>
          <p className="text-[12px] text-faint">{analytics.totals.issues} issues</p>
        </div>
        <ul className="mt-4 space-y-3">
          {analytics.byStatus.map((row) => (
            <li key={row.status}>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={row.status} />
                  {STATUS_LABEL[row.status]}
                </span>
                <span className="tabular-nums text-muted">{row.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${barClass[row.status]}`} style={{ width: row.count === 0 ? '0%' : `${Math.max(4, (row.count / maxStatus) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel p-5">
        <h2 className="text-[13px] font-semibold">Open by priority</h2>
        <ul className="mt-3 divide-y divide-line text-[13px]">
          {analytics.byPriority.map((row) => (
            <li key={row.priority} className="flex justify-between py-2">
              <span>{PRIORITY_LABEL[row.priority]}</span>
              <span className="tabular-nums text-muted">{row.count}</span>
            </li>
          ))}
        </ul>
        <h2 className="mt-5 text-[13px] font-semibold">Assignees</h2>
        <ul className="mt-3 space-y-2.5">
          {analytics.assigneeLoad.length ? (
            analytics.assigneeLoad.map((row) => (
              <li key={row.user.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2">
                  <Avatar name={row.user.name} color={row.user.avatarColor} size="sm" />
                  {row.user.name}
                </span>
                <span className="tabular-nums text-muted">{row.count}</span>
              </li>
            ))
          ) : (
            <li className="text-[13px] text-muted">No open assignments yet.</li>
          )}
        </ul>
      </section>
      <section className="panel p-5 lg:col-span-2">
        <h2 className="text-[13px] font-semibold">Activity, last 14 days</h2>
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {analytics.activityByDay.map((day) => (
            <div key={day.date} className="flex h-full flex-1 flex-col justify-end" title={`${day.date}: ${day.count}`}>
              <div
                className={`rounded-sm ${day.count === 0 ? 'bg-slate-200' : 'bg-ink'}`}
                style={{ height: day.count === 0 ? '3px' : `${Math.max(12, (day.count / maxDay) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-faint">
          <span>{analytics.activityByDay[0]?.date}</span>
          <span>{analytics.activityByDay.at(-1)?.date}</span>
        </div>
      </section>
    </div>
  );
}
