import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IssueBoard } from '../components/IssueBoard';
import { IssueForm } from '../components/IssueForm';
import { StatGrid } from '../components/AnalyticsPanels';
import { Avatar, EmptyState, Modal, PageHeader, PriorityMark, StatusBadge, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dueLabel } from '../lib/format';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type IssueStatus } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export function ProjectPage() {
  const { workspaceId = '', projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api.project(projectId) });
  const workspace = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => api.workspace(workspaceId) });
  const analytics = useQuery({
    queryKey: ['analytics', 'project', projectId],
    queryFn: () => api.analytics(`/api/projects/${projectId}/analytics`),
  });
  const query = new URLSearchParams();
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const assignee = params.get('assignee') ?? '';
  const q = params.get('q') ?? '';
  const overdue = params.get('overdue') ?? '';
  if (status) query.set('status', status);
  if (priority) query.set('priority', priority);
  if (assignee) query.set('assignee', assignee);
  if (q) query.set('q', q);
  if (overdue) query.set('overdue', overdue);
  query.set('limit', view === 'board' ? '100' : '20');
  query.set('page', params.get('page') ?? '1');
  const issues = useQuery({
    queryKey: ['issues', projectId, query.toString()],
    queryFn: () => api.issues(projectId, query),
  });
  const members = useQuery({ queryKey: ['members', workspaceId], queryFn: () => api.members(workspaceId) });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const user = useAuthStore((state) => state.user);
  useDocumentTitle(project.data ? `${project.data.key} ${project.data.name}` : 'Project');

  const move = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: IssueStatus }) => api.updateIssue(id, { status: next }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['issues', projectId] });
      const snapshots = queryClient.getQueriesData({ queryKey: ['issues', projectId] });
      snapshots.forEach(([key, data]) => {
        if (!data || typeof data !== 'object' || !('issues' in data)) return;
        const list = data as { issues: { id: string; status: IssueStatus; statusLabel: string }[] };
        queryClient.setQueryData(key, {
          ...list,
          issues: list.issues.map((issue) =>
            issue.id === variables.id ? { ...issue, status: variables.status, statusLabel: STATUS_LABEL[variables.status] } : issue,
          ),
        });
      });
      return { snapshots };
    },
    onError: (error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      pushToast(errorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['issues', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      navigate(`/w/${workspaceId}/projects`);
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  const canManage = workspace.data?.role === 'owner' || workspace.data?.role === 'admin';

  return (
    <div className="space-y-5">
      <PageHeader
        meta={
          <span className="inline-flex items-center gap-1.5">
            <Link className="hover:text-brand" to={`/w/${workspaceId}/projects`}>
              Projects
            </Link>
            {project.data?.key ? (
              <>
                <span aria-hidden="true">/</span>
                <span className="font-mono text-xs text-ink">{project.data.key}</span>
              </>
            ) : null}
          </span>
        }
        title={project.data?.name ?? 'Project'}
        description={project.data?.description}
        actions={
          <>
            {canManage ? (
              <button
                className="btn-danger"
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${project.data?.key ?? 'this project'} and its issues?`)) remove.mutate();
                }}
              >
                Delete project
              </button>
            ) : null}
            <button className="btn-primary" type="button" onClick={() => setCreating(true)}>
              New issue
            </button>
          </>
        }
      />
      {analytics.data ? <StatGrid analytics={analytics.data} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={status} aria-label="Filter by status" onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </select>
        <select className="field w-auto" value={priority} aria-label="Filter by priority" onChange={(event) => updateFilter('priority', event.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {PRIORITY_LABEL[item]}
            </option>
          ))}
        </select>
        <select className="field w-auto" value={assignee} aria-label="Filter by assignee" onChange={(event) => updateFilter('assignee', event.target.value)}>
          <option value="">Anyone</option>
          {(members.data ?? []).map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={overdue === 'true'} onChange={(event) => updateFilter('overdue', event.target.checked ? 'true' : '')} />
          Overdue
        </label>
        <input className="field w-48" placeholder="Filter title" value={q} aria-label="Filter by title" onChange={(event) => updateFilter('q', event.target.value)} />
        <div className="ml-auto inline-flex rounded-md border border-line bg-white p-0.5">
          {(['board', 'list'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded px-3 py-1 text-sm capitalize ${view === item ? 'bg-slate-100 font-medium text-ink' : 'text-muted'}`}
              onClick={() => updateFilter('view', item === 'board' ? '' : 'list')}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {issues.isPending ? <p className="text-sm text-muted">Loading issues…</p> : null}
      {issues.isError ? <p className="text-sm text-danger">{errorMessage(issues.error)}</p> : null}
      {issues.data && !issues.data.issues.length ? (
        <EmptyState title="Nothing in this view" body="Create an issue or clear the filters to see the rest of the project." action={<button className="btn-primary" type="button" onClick={() => setCreating(true)}>New issue</button>} />
      ) : null}
      {issues.data && issues.data.issues.length && view === 'board' ? (
        <IssueBoard workspaceId={workspaceId} issues={issues.data.issues} onMove={(id, next) => move.mutate({ id, status: next })} />
      ) : null}
      {issues.data && issues.data.issues.length && view === 'list' ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-3 font-medium">Issue</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Assignees</th>
                <th className="px-4 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {issues.data.issues.map((issue) => (
                <tr key={issue.id} className="border-t border-line hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="font-mono text-xs text-muted">
                      {issue.key}
                    </Link>
                    <Link to={`/w/${workspaceId}/issues/${issue.id}`} className="mt-0.5 block font-medium hover:text-brand">
                      {issue.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={issue.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityMark priority={issue.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex -space-x-1">
                      {issue.assignees.map((person) => (
                        <Avatar key={person.id} name={person.name} color={person.avatarColor} size="sm" />
                      ))}
                    </div>
                  </td>
                  <td className={`px-4 py-3 ${issue.overdue ? 'text-danger' : 'text-muted'}`}>{dueLabel(issue.dueDate, issue.overdue) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {issues.data && issues.data.total > issues.data.issues.length ? (
        <p className="text-sm text-muted">
          Showing {issues.data.issues.length} of {issues.data.total}. Narrow the filters to see a smaller set.
        </p>
      ) : null}
      {user && issues.data && view === 'list' && issues.data.pages > 1 ? (
        <div className="flex gap-2">
          <button className="btn-ghost" type="button" disabled={(issues.data.page ?? 1) <= 1} onClick={() => updateFilter('page', String(issues.data.page - 1))}>
            Previous
          </button>
          <button className="btn-ghost" type="button" disabled={issues.data.page >= issues.data.pages} onClick={() => updateFilter('page', String(issues.data.page + 1))}>
            Next
          </button>
        </div>
      ) : null}
      <Modal open={creating} title="New issue" onClose={() => setCreating(false)}>
        <IssueForm workspaceId={workspaceId} projectId={projectId} onCreated={() => setCreating(false)} />
      </Modal>
    </div>
  );
}
