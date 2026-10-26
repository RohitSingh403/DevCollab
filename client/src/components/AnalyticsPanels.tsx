import { PRIORITY_LABEL, STATUS_LABEL, type IssueStatus } from '../lib/types';
import type { Analytics } from '../lib/types';
import { Avatar } from './ui';

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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, alert]) => (
        <article key={label} className="panel px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-danger' : 'text-ink'}`}>{value}</p>
        </article>
      ))}
    </div>
  );
}

export function AnalyticsPanels({ analytics }: { analytics: Analytics }) {
  const maxDay = Math.max(1, ...analytics.activityByDay.map((day) => day.count));
  const maxStatus = Math.max(1, ...analytics.byStatus.map((row) => row.count));
  return (
    <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Status</h2>
          <p className="text-xs text-faint">{analytics.totals.issues} issues</p>
        </div>
        <ul className="mt-4 space-y-3">
          {analytics.byStatus.map((row) => (
            <li key={row.status}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{STATUS_LABEL[row.status]}</span>
                <span className="tabular-nums text-muted">{row.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${barClass[row.status]}`} style={{ width: `${(row.count / maxStatus) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel p-4">
        <h2 className="text-sm font-semibold">Open work by priority</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {analytics.byPriority.map((row) => (
            <li key={row.priority} className="flex justify-between py-1.5">
              <span>{PRIORITY_LABEL[row.priority]}</span>
              <span className="tabular-nums text-muted">{row.count}</span>
            </li>
          ))}
        </ul>
        <h2 className="mt-5 text-sm font-semibold">Assignees</h2>
        <ul className="mt-2 space-y-2">
          {analytics.assigneeLoad.length ? (
            analytics.assigneeLoad.map((row) => (
              <li key={row.user.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <Avatar name={row.user.name} color={row.user.avatarColor} size="sm" />
                  {row.user.name}
                </span>
                <span className="tabular-nums text-muted">{row.count}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted">No open assignments yet.</li>
          )}
        </ul>
      </section>
      <section className="panel p-4 lg:col-span-2">
        <h2 className="text-sm font-semibold">Activity, last 14 days</h2>
        <div className="mt-4 flex h-24 items-end gap-1">
          {analytics.activityByDay.map((day) => (
            <div key={day.date} className="flex h-full flex-1 flex-col justify-end" title={`${day.date}: ${day.count}`}>
              <div
                className="rounded-sm bg-brand/80"
                style={{ height: day.count === 0 ? '0%' : `${Math.max(8, (day.count / maxDay) * 100)}%` }}
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
