import { Link } from 'react-router-dom';
import { dueLabel, groupIssues } from '../lib/format';
import { STATUSES, STATUS_LABEL, type Issue, type IssueStatus } from '../lib/types';
import { Avatar, PriorityMark } from './ui';

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
          className="min-w-0 rounded-2xl border border-white/10 bg-ink-900/50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            if (id) onMove(id, status);
          }}
          aria-label={`${STATUS_LABEL[status]} column`}
        >
          <header className="flex items-center justify-between px-3 py-3">
            <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
            <span className="text-xs text-mist-500">{grouped[status].length}</span>
          </header>
          <div className="space-y-2 px-2 pb-3">
            {grouped[status].map((issue) => (
              <article
                key={issue.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', issue.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                className="rounded-xl border border-white/10 bg-ink-950/80 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="font-mono text-xs text-mist-400 hover:text-acid">
                    {issue.key}
                  </Link>
                  <PriorityMark priority={issue.priority} />
                </div>
                <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="mt-2 block font-medium leading-snug hover:text-acid">
                  {issue.title}
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex -space-x-1">
                    {issue.assignees.slice(0, 3).map((user) => (
                      <Avatar key={user.id} name={user.name} color={user.avatarColor} size="sm" />
                    ))}
                  </div>
                  <span className={`text-xs ${issue.overdue ? 'text-rose' : 'text-mist-500'}`}>
                    {dueLabel(issue.dueDate, issue.overdue) ?? (issue.commentCount ? `${issue.commentCount} comments` : '')}
                  </span>
                </div>
              </article>
            ))}
            {!grouped[status].length ? <p className="px-2 py-6 text-center text-xs text-mist-500">Drop issues here</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
