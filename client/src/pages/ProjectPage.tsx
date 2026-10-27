import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IssueBoard } from '../components/IssueBoard';
import { IssueForm } from '../components/IssueForm';
import { StatGrid } from '../components/AnalyticsPanels';
import { Avatar, EmptyState, Modal, PageHeader, PriorityMark, StatusBadge, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dueLabel } from '../lib/format';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type IssueStatus, type ViewFilters } from '../lib/types';
import { currentFilters, hasViewFilter, sameFilters } from '../lib/views';
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
  const views = useQuery({ queryKey: ['views', projectId], queryFn: () => api.views(projectId) });
  const [creating, setCreating] = useState(false);
  const [savingView, setSavingView] = useState(false);
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
  const filters = currentFilters(params, user?.id ?? '');
  const matchedView = (views.data ?? []).find((item) => sameFilters(item.filters, filters));
  const otherFilters = Boolean(filters.status || filters.priority || filters.overdue || filters.q);
  const allActive = !matchedView && !otherFilters && !filters.assignee;
  const mineActive = !matchedView && (filters.assignee === 'me' || filters.assignee === user?.id) && !otherFilters;

  function applyFilters(nextFilters: ViewFilters) {
    const next = new URLSearchParams();
    if (nextFilters.status) next.set('status', nextFilters.status);
    if (nextFilters.priority) next.set('priority', nextFilters.priority);
    if (nextFilters.assignee) next.set('assignee', nextFilters.assignee);
    if (nextFilters.overdue) next.set('overdue', 'true');
    if (nextFilters.q) next.set('q', nextFilters.q);
    if (nextFilters.layout === 'list') next.set('view', 'list');
    setParams(next);
  }

  const removeView = useMutation({
    mutationFn: (viewId: string) => api.deleteView(projectId, viewId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['views', projectId] }),
    onError: (error) => pushToast(errorMessage(error)),
  });

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
      <div className="panel">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-2">
          <FilterChip active={allActive} onClick={() => applyFilters({ status: '', priority: '', assignee: '', overdue: false, q: '', layout: filters.layout })}>
            All issues
          </FilterChip>
          <FilterChip
            active={mineActive}
            onClick={() => applyFilters({ status: '', priority: '', assignee: 'me', overdue: false, q: '', layout: filters.layout })}
          >
            Assigned to me
          </FilterChip>
          {(views.data ?? []).map((item) => (
            <span
              key={item.id}
              className={`inline-flex h-7 items-center rounded-full border text-[12px] ${matchedView?.id === item.id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink'}`}
            >
              <button type="button" className="px-2.5" onClick={() => applyFilters(item.filters)}>
                {item.name}
              </button>
              {item.shared ? <span className={`pr-2 text-[10px] uppercase tracking-wide ${matchedView?.id === item.id ? 'text-white/70' : 'text-faint'}`}>Shared</span> : null}
              {item.canDelete ? (
                <button
                  type="button"
                  className={`px-1.5 ${matchedView?.id === item.id ? 'text-white/80 hover:text-white' : 'text-faint hover:text-ink'}`}
                  aria-label={`Delete ${item.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete the view “${item.name}”?`)) removeView.mutate(item.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          <button
            className="btn-quiet ml-auto"
            type="button"
            disabled={!hasViewFilter(filters) || Boolean(matchedView?.mine)}
            onClick={() => setSavingView(true)}
          >
            Save view
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-2">
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
          <option value="me">Assigned to me</option>
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
      </div>
      <SaveViewModal open={savingView} onClose={() => setSavingView(false)} projectId={projectId} filters={filters} />
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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] ${active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:bg-slate-50'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SaveViewModal({
  open,
  onClose,
  projectId,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  filters: ViewFilters;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName('');
    setShared(false);
    setError('');
  }, [open]);
  const save = useMutation({
    mutationFn: () => api.createView(projectId, { name: name.trim(), shared, filters }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['views', projectId] });
      onClose();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  return (
    <Modal open={open} title="Save view" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2) save.mutate();
          else setError('Name the view with at least 2 characters.');
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="My urgent work" required minLength={2} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-0.5" type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
          <span>
            Share with this project
            <span className="mt-0.5 block text-[12px] text-muted">
              Teammates can open it. A filter assigned to you follows whoever opens the view.
            </span>
          </span>
        </label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save view'}
        </button>
      </form>
    </Modal>
  );
}
