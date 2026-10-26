import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Modal, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { suggestKey } from '../lib/format';

export function ProjectsPage() {
  const { workspaceId = '' } = useParams();
  const projects = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => api.projects(workspaceId) });
  const [open, setOpen] = useState(false);
  useDocumentTitle('Projects');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold">Projects</h1>
          <p className="mt-2 text-mist-400">Each project has a key, a board, and its own issue history.</p>
        </div>
        <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
          New project
        </button>
      </div>
      {projects.isPending ? <p>Loading projects…</p> : null}
      {projects.isError ? <p className="text-rose">{errorMessage(projects.error)}</p> : null}
      {projects.data && !projects.data.length ? (
        <EmptyState title="Start with one project" body="A key like API or WEB prefixes every issue the team files." action={<button className="btn-primary" type="button" onClick={() => setOpen(true)}>New project</button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(projects.data ?? []).map((project) => {
            const progress = project.issueCount ? Math.round(((project.issueCount - project.openIssueCount) / project.issueCount) * 100) : 0;
            return (
              <Link key={project.id} to={`/w/${workspaceId}/projects/${project.id}`} className="panel p-4 hover:border-acid/40">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-acid">{project.key}</span>
                  <span className="text-sm text-mist-400">{project.openIssueCount} open</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold">{project.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-mist-400">{project.description || 'No description yet.'}</p>
                <div className="mt-4 h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full bg-mint" style={{ width: `${progress}%` }} />
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
        {error ? <p className="text-sm text-rose" role="alert">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={create.isPending}>
          Create project
        </button>
      </form>
    </Modal>
  );
}
