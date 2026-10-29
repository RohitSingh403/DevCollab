import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { BlockedMark, EmptyState, PageHeader, PriorityMark, StatusBadge, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dueLabel } from '../lib/format';
import type { MyWorkGroup } from '../lib/types';

const tone: Record<MyWorkGroup['id'], string> = {
  overdue: 'text-danger',
  dueSoon: 'text-ink',
  later: 'text-ink',
  undated: 'text-ink',
};

export function MyWorkPage() {
  const { workspaceId = '' } = useParams();
  const work = useQuery({ queryKey: ['my-work', workspaceId], queryFn: () => api.myWork(workspaceId) });
  useDocumentTitle('My work');

  return (
    <div className="space-y-6">
      <PageHeader
        title="My work"
        description="Open issues assigned to you in this workspace, with the closest deadlines first."
      />
      {work.isPending ? <p className="text-sm text-muted">Loading your issues…</p> : null}
      {work.isError ? <p className="text-sm text-danger">{errorMessage(work.error)}</p> : null}
      {work.data ? (
        <div className="panel grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
          <Count label="Overdue" value={work.data.counts.overdue} danger={work.data.counts.overdue > 0} />
          <Count label="Due this week" value={work.data.counts.dueSoon} />
          <Count label="Due later" value={work.data.counts.later} />
          <Count label="No due date" value={work.data.counts.undated} />
        </div>
      ) : null}
      {work.data && work.data.total === 0 ? (
        <EmptyState
          title="Nothing is assigned to you"
          body="When a teammate assigns you an issue, it shows up here until it is done."
          action={
            <Link className="btn-primary" to={`/w/${workspaceId}/projects`}>
              Browse projects
            </Link>
          }
        />
      ) : null}
      {work.data?.groups
        .filter((group) => group.issues.length > 0)
        .map((group) => (
          <section key={group.id}>
            <h2 className={`mb-2 text-[13px] font-semibold ${tone[group.id]}`}>
              {group.label}
              <span className="ml-2 font-normal text-faint">{group.issues.length}</span>
            </h2>
            <ul className="panel divide-y divide-line">
              {group.issues.map((issue) => (
                <li key={issue.id}>
                  <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="grid gap-2 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <span className="min-w-0">
                      <span className="font-mono text-[11px] text-muted">{issue.key}</span>
                      <span className="mt-0.5 block truncate text-[14px] font-medium text-ink">{issue.title}</span>
                      <span className="mt-0.5 block text-[12px] text-faint">{issue.project.name}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3">
                      {issue.blocked ? <BlockedMark /> : null}
                      <StatusBadge status={issue.status} />
                      <PriorityMark priority={issue.priority} />
                      <span className={`text-[12px] ${issue.overdue ? 'text-danger' : 'text-muted'}`}>{dueLabel(issue.dueDate, issue.overdue) ?? 'No due date'}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function Count({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold tracking-[-0.03em] ${danger ? 'text-danger' : 'text-ink'}`}>{value}</p>
    </div>
  );
}
