import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import type { Analytics } from '../lib/types';
import { Avatar } from './ui';

export function StatGrid({ analytics }: { analytics: Analytics }) {
  const cards = [
    ['Open', analytics.totals.open],
    ['In progress', analytics.totals.inProgress],
    ['Overdue', analytics.totals.overdue],
    ['Done this week', analytics.totals.completedThisWeek],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <article key={label} className="panel px-4 py-4">
          <p className="text-sm text-mist-400">{label}</p>
          <p className="mt-2 font-display text-4xl font-bold tabular-nums">{value}</p>
        </article>
      ))}
    </div>
  );
}

export function AnalyticsPanels({ analytics }: { analytics: Analytics }) {
  const maxDay = Math.max(1, ...analytics.activityByDay.map((day) => day.count));
  const maxStatus = Math.max(1, ...analytics.byStatus.map((row) => row.count));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="panel p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Status</h3>
          <p className="text-xs text-mist-500">{analytics.totals.issues} issues</p>
        </div>
        <ul className="mt-4 space-y-3">
          {analytics.byStatus.map((row) => (
            <li key={row.status}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{STATUS_LABEL[row.status]}</span>
                <span className="tabular-nums text-mist-400">{row.count}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5">
                <div className="h-2 rounded-full bg-acid" style={{ width: `${(row.count / maxStatus) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel p-4">
        <h3 className="font-semibold">Priority of open work</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {analytics.byPriority.map((row) => (
            <li key={row.priority} className="flex justify-between">
              <span>{PRIORITY_LABEL[row.priority]}</span>
              <span className="tabular-nums text-mist-400">{row.count}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 font-semibold">Busier assignees</h3>
        <ul className="mt-3 space-y-2">
          {analytics.assigneeLoad.length ? (
            analytics.assigneeLoad.map((row) => (
              <li key={row.user.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <Avatar name={row.user.name} color={row.user.avatarColor} size="sm" />
                  {row.user.name}
                </span>
                <span className="tabular-nums text-mist-400">{row.count}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-mist-500">No open assignments yet.</li>
          )}
        </ul>
      </section>
      <section className="panel p-4 lg:col-span-2">
        <h3 className="font-semibold">Activity, last 14 days</h3>
        <div className="mt-4 flex h-28 items-end gap-1.5">
          {analytics.activityByDay.map((day) => (
            <div key={day.date} className="flex h-full flex-1 flex-col justify-end" title={`${day.date}: ${day.count}`}>
              <div
              className="rounded-t bg-mint/80"
              style={{ height: day.count === 0 ? '0%' : `${Math.max(8, (day.count / maxDay) * 100)}%` }}
            />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
