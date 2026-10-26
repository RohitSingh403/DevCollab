import { Link } from 'react-router-dom';
import { dueLabel, groupIssues } from '../lib/format';
import { STATUSES, STATUS_LABEL, type Issue, type IssueStatus, type Priority } from '../lib/types';
import { Avatar, PriorityMark } from './ui';

const priorityBar: Record<Priority, string> = {
  low: 'bg-slate-300',
  medium: 'bg-sky-500',
  high: 'bg-amber-500',
  urgent: 'bg-red-600',
};

export function IssueBoard({
  workspaceId,
  issues,
  onMove,
}: {
  workspaceId: string;
  issues: Issue[];
  onMove: (id: string, status: IssueStatus) => void;
}) {
  const grouped = groupIssues(issues);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {STATUSES.map((status) => (
        <section
          key={status}
          className="min-w-0 rounded-lg bg-slate-100/80"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            if (id) onMove(id, status);
          }}
          aria-label={`${STATUS_LABEL[status]} column`}
        >
          <header className="flex items-center justify-between px-3 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{STATUS_LABEL[status]}</h3>
            <span className="text-xs tabular-nums text-faint">{grouped[status].length}</span>
          </header>
          <div className="space-y-2 px-2 pb-2">
            {grouped[status].map((issue) => (
              <article
                key={issue.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', issue.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                className="relative cursor-grab overflow-hidden rounded-md border border-line bg-white p-3 shadow-sm active:cursor-grabbing"
              >
                <span className={`absolute inset-y-0 left-0 w-0.5 ${priorityBar[issue.priority]}`} aria-hidden="true" />
                <div className="flex items-center justify-between gap-2 pl-1">
                  <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="font-mono text-[11px] text-muted hover:text-brand">
                    {issue.key}
                  </Link>
                  <PriorityMark priority={issue.priority} />
                </div>
                <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="mt-1.5 block pl-1 text-sm font-medium leading-snug text-ink hover:text-brand">
                  {issue.title}
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2 pl-1">
                  <div className="flex -space-x-1">
                    {issue.assignees.slice(0, 3).map((user) => (
                      <Avatar key={user.id} name={user.name} color={user.avatarColor} size="sm" />
                    ))}
                  </div>
                  <span className={`text-xs ${issue.overdue ? 'font-medium text-danger' : 'text-faint'}`}>
                    {dueLabel(issue.dueDate, issue.overdue) ?? (issue.commentCount ? `${issue.commentCount} comments` : '')}
                  </span>
                </div>
              </article>
            ))}
            {!grouped[status].length ? <p className="px-2 py-6 text-center text-xs text-faint">No issues</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
