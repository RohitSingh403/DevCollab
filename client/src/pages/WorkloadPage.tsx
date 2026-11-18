import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Avatar, BlockedMark, EmptyState, EstimateMark, PageHeader, PriorityMark, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dueLabel } from '../lib/format';

export function WorkloadPage() {
  const { workspaceId = '' } = useParams();
  const workload = useQuery({ queryKey: ['workload', workspaceId], queryFn: () => api.workload(workspaceId) });
  useDocumentTitle('Workload');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workload"
        description="Open issues in active projects, counted for each person they are assigned to. A shared issue counts for everyone on it."
      />
      {workload.isPending ? <p className="text-sm text-muted">Loading workload…</p> : null}
      {workload.isError ? <p className="text-sm text-danger">{errorMessage(workload.error)}</p> : null}
      {workload.data?.people.length === 0 ? (
        <EmptyState title="No members yet" body="People you invite will show up here with the open issues assigned to them." />
      ) : null}
      {workload.data?.people.map((person) => (
        <section key={person.user.id}>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Avatar name={person.user.name} color={person.user.avatarColor} size="sm" />
            <h2 className="text-[13px] font-semibold">{person.user.name}</h2>
            <span className="text-[12px] text-muted">{person.open} open</span>
            <span className={`text-[12px] ${person.overdue ? 'font-medium text-danger' : 'text-muted'}`}>{person.overdue} overdue</span>
            <span className="text-[12px] text-muted">{person.blocked} blocked</span>
            <span className="text-[12px] text-muted">{person.points} points</span>
          </div>
          {person.issues.length ? (
            <ul className="panel divide-y divide-line">
              {person.issues.map((issue) => (
                <li key={issue.id}>
                  <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-brand-soft">
                    <span className="min-w-0">
                      <span className="font-mono text-[11px] text-muted">{issue.key}</span>
                      <span className="mt-0.5 block truncate text-sm font-medium">{issue.title}</span>
                      <span className="mt-0.5 block text-[12px] text-faint">{issue.project.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {issue.blocked ? <BlockedMark /> : null}
                      <EstimateMark estimate={issue.estimate} />
                      <PriorityMark priority={issue.priority} />
                      <span className={`text-[12px] ${issue.overdue ? 'font-medium text-danger' : 'text-muted'}`}>
                        {dueLabel(issue.dueDate, issue.overdue) ?? 'No due date'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel px-4 py-6 text-sm text-muted">No open issues.</p>
          )}
          {person.open > person.issues.length ? (
            <p className="mt-2 text-[12px] text-muted">Showing {person.issues.length} of {person.open}.</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
