import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnalyticsPanels, StatGrid } from '../components/AnalyticsPanels';
import { EmptyState, Modal, PageHeader, RoleBadge, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useUiStore } from '../stores/uiStore';

export function WorkspaceHome() {
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces });
  const remembered = useUiStore((state) => state.workspaceId);
  const [params] = useSearchParams();
  const forceNew = params.get('new') === '1';
  useDocumentTitle('Workspaces');
  if (workspaces.isPending) return <p className="text-sm text-muted">Loading workspaces…</p>;
  if (!forceNew && workspaces.data?.length) {
    const next = workspaces.data.find((workspace) => workspace.id === remembered) ?? workspaces.data[0];
    return <Navigate to={`/w/${next.id}`} replace />;
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Create a workspace" description="A workspace is the home for a team: projects, members, and the issues they share." />
      <div className="mt-6">
        <CreateWorkspaceForm />
      </div>
    </div>
  );
}

export function CreateWorkspaceForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remember = useUiStore((state) => state.rememberWorkspace);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api.createWorkspace({ name, description }),
    onSuccess: async (workspace) => {
      remember(workspace.id);
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      if (onCreated) onCreated(workspace.id);
      else navigate(`/w/${workspace.id}`);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
      </label>
      <label className="block">
        <span className="label">Description</span>
        <textarea className="field min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <button className="btn-primary" type="submit" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  );
}

export function OverviewPage() {
  const { workspaceId = '' } = useParams();
  const workspace = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => api.workspace(workspaceId) });
  const analytics = useQuery({ queryKey: ['analytics', workspaceId], queryFn: () => api.analytics(`/api/workspaces/${workspaceId}/analytics`) });
  const projects = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => api.projects(workspaceId) });
  const activity = useQuery({
    queryKey: ['activity', workspaceId],
    queryFn: () => api.activity(`/api/workspaces/${workspaceId}/activity`),
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  useDocumentTitle(workspace.data?.name ?? 'Overview');
  const canManage = workspace.data?.role === 'owner' || workspace.data?.role === 'admin';

  if (workspace.isPending) return <p className="text-sm text-muted">Loading workspace…</p>;
  if (workspace.isError) return <p className="text-sm text-danger">{errorMessage(workspace.error)}</p>;
  const current = workspace.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {current.name}
            <RoleBadge role={current.role} />
          </span>
        }
        description={current.description || 'No description yet.'}
        actions={
          <>
            {canManage ? (
              <button className="btn-ghost" type="button" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
            ) : null}
            <Link className="btn-primary" to={`/w/${workspaceId}/projects`}>
              View projects
            </Link>
          </>
        }
      />
      {analytics.data ? <StatGrid analytics={analytics.data} /> : <p className="text-sm text-muted">Loading analytics…</p>}
      {analytics.data ? <AnalyticsPanels analytics={analytics.data} /> : null}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Projects</h2>
          <div className="panel divide-y divide-line">
            {(projects.data ?? []).map((project) => (
              <Link key={project.id} to={`/w/${workspaceId}/projects/${project.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span>
                  <span className="font-mono text-xs text-muted">{project.key}</span>
                  <span className="mt-0.5 block text-sm font-medium">{project.name}</span>
                </span>
                <span className="text-sm text-muted">{project.openIssueCount} open</span>
              </Link>
            ))}
            {!projects.data?.length ? <EmptyState title="No projects yet" body="Projects group issues by product area, with their own keys and boards." action={<Link className="btn-primary" to={`/w/${workspaceId}/projects`}>Create a project</Link>} /> : null}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
          <ul className="panel divide-y divide-line">
            {(activity.data?.activities ?? []).slice(0, 8).map((item) => (
              <li key={item.id} className="px-4 py-3 text-sm">
                <p>{item.message}</p>
                <p className="mt-1 text-xs text-faint">{timeAgo(item.createdAt)}</p>
              </li>
            ))}
            {!activity.data?.activities.length ? <li className="px-4 py-6 text-sm text-muted">Activity will show up as the team files work.</li> : null}
          </ul>
        </section>
      </div>
      {current ? <WorkspaceSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} workspaceId={workspaceId} name={current.name} description={current.description} canDelete={current.role === 'owner'} /> : null}
    </div>
  );
}

function WorkspaceSettings({
  open,
  onClose,
  workspaceId,
  name,
  description,
  canDelete,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  name: string;
  description: string;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const [nextName, setNextName] = useState(name);
  const [nextDescription, setNextDescription] = useState(description);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setNextName(name);
    setNextDescription(description);
    setConfirm('');
    setError('');
  }, [open, name, description]);
  const save = useMutation({
    mutationFn: () => api.updateWorkspace(workspaceId, { name: nextName, description: nextDescription }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onClose();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      window.location.assign('/app');
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  return (
    <Modal open={open} title="Workspace settings" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="field" value={nextName} onChange={(event) => setNextName(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Description</span>
          <textarea className="field min-h-24" value={nextDescription} onChange={(event) => setNextDescription(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={save.isPending}>
          Save changes
        </button>
      </form>
      {canDelete ? (
        <div className="mt-8 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-danger">Delete workspace</h3>
          <p className="mt-1 text-sm text-muted">Type {name} to delete every project and issue in this workspace.</p>
          <input className="field mt-3" value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-label="Confirm workspace name" />
          <button className="btn-danger mt-3" type="button" disabled={confirm !== name || remove.isPending} onClick={() => remove.mutate()}>
            Delete workspace
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
