import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Modal, PageHeader, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { suggestKey } from '../lib/format';

export function ProjectsPage() {
  const { workspaceId = '' } = useParams();
  const projects = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => api.projects(workspaceId) });
  const [open, setOpen] = useState(false);
  useDocumentTitle('Projects');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Each project has a key, a board, and its own issue history."
        actions={
          <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
            New project
          </button>
        }
      />
      {projects.isPending ? <p className="text-sm text-muted">Loading projects…</p> : null}
      {projects.isError ? <p className="text-sm text-danger">{errorMessage(projects.error)}</p> : null}
      {projects.data && !projects.data.length ? (
        <EmptyState title="Start with one project" body="A key like API or WEB prefixes every issue the team files." action={<button className="btn-primary" type="button" onClick={() => setOpen(true)}>New project</button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(projects.data ?? []).map((project) => {
            const progress = project.issueCount ? Math.round(((project.issueCount - project.openIssueCount) / project.issueCount) * 100) : 0;
            return (
              <Link key={project.id} to={`/w/${workspaceId}/projects/${project.id}`} className="panel block p-5 transition hover:-translate-y-px hover:shadow-pop">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink">{project.key}</span>
                  <span className="text-[12px] text-muted">{project.openIssueCount} open</span>
                </div>
                <h2 className="mt-3 text-[16px] font-semibold tracking-[-0.02em]">{project.name}</h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-muted">{project.description || 'No description yet.'}</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1 flex-1 rounded-full bg-slate-100">
                    <div className="h-1 rounded-full bg-ink" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-[11px] tabular-nums text-faint">{progress}%</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <CreateProjectModal workspaceId={workspaceId} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateProjectModal({ workspaceId, open, onClose }: { workspaceId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [touchedKey, setTouchedKey] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api.createProject(workspaceId, { name, key, description }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      setName('');
      setKey('');
      setDescription('');
      setTouchedKey(false);
      onClose();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  return (
    <Modal open={open} title="New project" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          create.mutate();
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input
            className="field"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!touchedKey) setKey(suggestKey(event.target.value));
            }}
            required
          />
        </label>
        <label className="block">
          <span className="label">Key</span>
          <input
            className="field font-mono uppercase"
            value={key}
            onChange={(event) => {
              setTouchedKey(true);
              setKey(event.target.value.toUpperCase());
            }}
            required
            pattern="[A-Za-z][A-Za-z0-9]{1,5}"
          />
        </label>
        <label className="block">
          <span className="label">Description</span>
          <textarea className="field min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={create.isPending}>
          Create project
        </button>
      </form>
    </Modal>
  );
}
