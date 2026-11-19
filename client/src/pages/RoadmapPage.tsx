import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { RoadmapMilestone } from '../lib/types';

const GROUPS: { state: RoadmapMilestone['state']; title: string; detail: string }[] = [
  { state: 'overdue', title: 'Overdue', detail: 'The date has passed and work is still open.' },
  { state: 'upcoming', title: 'Coming up', detail: 'Dated targets that still have open issues, or no issues yet.' },
  { state: 'undated', title: 'No date', detail: 'Named targets without a day on the calendar.' },
  { state: 'complete', title: 'Done', detail: 'Every issue on the milestone is finished.' },
];

function formatDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function RoadmapRow({ workspaceId, milestone }: { workspaceId: string; milestone: RoadmapMilestone }) {
  const progress = milestone.total > 0 ? milestone.done / milestone.total : 0;
  return (
    <li>
      <Link
        to={`/w/${workspaceId}/projects/${milestone.project.id}?milestone=${milestone.id}`}
        className="block px-4 py-3 hover:bg-brand-soft"
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand">{milestone.project.key}</span>
            <span className="ml-2 text-sm font-medium text-ink">{milestone.name}</span>
            <span className="mt-1 block text-[12px] text-muted">{milestone.project.name}</span>
          </span>
          <span className={`text-[12px] ${milestone.state === 'overdue' ? 'font-medium text-danger' : 'text-muted'}`}>
            {milestone.targetDate ? formatDay(milestone.targetDate) : 'No date'}
            <span className="ml-2 tabular-nums">
              {milestone.done} of {milestone.total}
              <span className="text-faint"> · </span>
              {milestone.pointsDone} of {milestone.points} points
            </span>
          </span>
        </span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <span className={`block h-full rounded-full ${milestone.state === 'overdue' ? 'bg-danger' : 'bg-brand'}`} style={{ width: `${progress * 100}%` }} />
        </span>
      </Link>
    </li>
  );
}

export function RoadmapPage() {
  const { workspaceId = '' } = useParams();
  const roadmap = useQuery({ queryKey: ['roadmap', workspaceId], queryFn: () => api.roadmap(workspaceId) });
  useDocumentTitle('Roadmap');
  const milestones = roadmap.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Roadmap" description="Milestones across the active projects in this workspace, ordered by what needs attention first." />
      {roadmap.isPending ? <p className="text-sm text-muted">Loading roadmap…</p> : null}
      {roadmap.isError ? <p className="text-sm text-danger">{errorMessage(roadmap.error)}</p> : null}
      {roadmap.data && !milestones.length ? (
        <EmptyState title="No milestones yet" body="Add a milestone on a project, with a name and an optional date. It will show up here." action={<Link className="btn-primary" to={`/w/${workspaceId}/projects`}>View projects</Link>} />
      ) : null}
      {GROUPS.map((group) => {
        const rows = milestones.filter((milestone) => milestone.state === group.state);
        if (!rows.length) return null;
        return (
          <section key={group.state}>
            <h2 className="text-sm font-semibold text-ink">{group.title}</h2>
            <p className="mb-2 mt-1 text-[12px] text-muted">{group.detail}</p>
            <ul className="panel divide-y divide-line">
              {rows.map((milestone) => (
                <RoadmapRow key={milestone.id} workspaceId={workspaceId} milestone={milestone} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
