import { Link } from 'react-router-dom';
import { dueLabel, groupIssues } from '../lib/format';
import { STATUSES, STATUS_LABEL, type Issue, type IssueStatus } from '../lib/types';
import { Avatar, BlockedMark, PriorityMark, StatusDot } from './ui';

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
          className="min-w-0 rounded-xl bg-[#eef0f3] p-1.5"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            if (id) onMove(id, status);
          }}
          aria-label={`${STATUS_LABEL[status]} column`}
        >
          <header className="flex items-center justify-between px-2 py-2">
            <h3 className="inline-flex items-center gap-2 text-[12px] font-medium text-ink">
              <StatusDot status={status} />
              {STATUS_LABEL[status]}
            </h3>
            <span className="rounded-full bg-white px-1.5 text-[11px] tabular-nums text-muted">{grouped[status].length}</span>
          </header>
          <div className="space-y-1.5">
            {grouped[status].map((issue) => (
              <article
                key={issue.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', issue.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                className="cursor-grab rounded-lg border border-transparent bg-white p-3 shadow-sm transition hover:border-line active:cursor-grabbing"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="font-mono text-[11px] text-faint hover:text-ink">
                      {issue.key}
                    </Link>
                    {issue.blocked ? <BlockedMark /> : null}
                  </span>
                  <PriorityMark priority={issue.priority} />
                </div>
                <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="mt-1.5 block text-[13px] font-medium leading-5 text-ink hover:underline">
                  {issue.title}
                </Link>
                {issue.labels.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {issue.labels.slice(0, 2).map((label) => (
                      <span key={label.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: label.color }} />
                        {label.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex -space-x-1.5">
                    {issue.assignees.slice(0, 3).map((user) => (
                      <Avatar key={user.id} name={user.name} color={user.avatarColor} size="sm" />
                    ))}
                  </div>
                  <span className={`text-[11px] ${issue.overdue ? 'font-medium text-danger' : 'text-faint'}`}>
                    {dueLabel(issue.dueDate, issue.overdue) ?? (issue.commentCount ? `${issue.commentCount} comments` : '')}
                  </span>
                </div>
              </article>
            ))}
            {!grouped[status].length ? <p className="px-2 py-8 text-center text-[12px] text-faint">Empty</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
