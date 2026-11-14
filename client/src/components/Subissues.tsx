import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { Issue, IssueLink } from '../lib/types';
import { useUiStore } from '../stores/uiStore';
import { StatusBadge } from './ui';

export function Subissues({ workspaceId, issue }: { workspaceId: string; issue: Issue }) {
  const children = issue.children ?? [];
  const progress = issue.subissues ?? { total: children.length, done: children.filter((child) => child.status === 'done').length };
  return (
    <section className="panel mt-8 p-4">
      <h2 className="text-sm font-semibold">
        Sub-issues
        {progress.total ? <span className="ml-2 font-normal text-faint">{progress.done} of {progress.total} done</span> : null}
      </h2>
      {children.length ? (
        <ul className="mt-3 divide-y divide-line">
          {children.map((child) => (
            <li key={child.id} className="flex items-center gap-3 py-2">
              <ChildLink workspaceId={workspaceId} child={child} />
              <StatusBadge status={child.status} />
              <DetachChild parentId={issue.id} childId={child.id} label={child.key} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">No sub-issues yet.</p>
      )}
      <NewSubissue issue={issue} />
      <AttachSearch workspaceId={workspaceId} issue={issue} takenIds={[issue.id, issue.parent?.id ?? '', ...children.map((child) => child.id)].filter(Boolean)} />
    </section>
  );
}

function ChildLink({ workspaceId, child }: { workspaceId: string; child: IssueLink }) {
  return (
    <Link to={`/w/${workspaceId}/issues/${child.id}`} className="min-w-0 flex-1">
      <span className="font-mono text-[11px] text-muted">{child.key}</span>
      <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">{child.title}</span>
    </Link>
  );
}

function DetachChild({ parentId, childId, label }: { parentId: string; childId: string; label: string }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const remove = useMutation({
    mutationFn: () => api.updateIssue(childId, { parentId: null }),
    onSuccess: (next) => {
      queryClient.setQueryData(['issue', next.id], next);
      void queryClient.invalidateQueries({ queryKey: ['issue', parentId] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  return (
    <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[12px]" aria-label={`Remove ${label}`} onClick={() => remove.mutate()}>
      Remove
    </button>
  );
}

function NewSubissue({ issue }: { issue: Issue }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: (nextTitle: string) =>
      api.createIssue(issue.project.id, {
        title: nextTitle,
        status: 'todo',
        priority: 'medium',
        parentId: issue.id,
      }),
    onSuccess: (created) => {
      setTitle('');
      queryClient.setQueryData(['issue', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['issue', issue.id] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = title.trim();
        if (next.length >= 3) create.mutate(next);
      }}
    >
      <input
        className="field"
        aria-label="New sub-issue"
        placeholder="Add a sub-issue"
        maxLength={140}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="btn-primary shrink-0" type="submit" disabled={title.trim().length < 3 || create.isPending}>
        Add
      </button>
    </form>
  );
}

function AttachSearch({ workspaceId, issue, takenIds }: { workspaceId: string; issue: Issue; takenIds: string[] }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const results = useQuery({
    queryKey: ['subissue-search', workspaceId, deferred],
    queryFn: () => api.search(workspaceId, deferred),
    enabled: deferred.length >= 2,
  });
  const attach = useMutation({
    mutationFn: (childId: string) => api.updateIssue(childId, { parentId: issue.id }),
    onSuccess: (next) => {
      setQ('');
      queryClient.setQueryData(['issue', next.id], next);
      void queryClient.invalidateQueries({ queryKey: ['issue', issue.id] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  const choices = (results.data ?? []).filter((item) => !takenIds.includes(item.id));
  return (
    <div className="relative mt-3">
      <label className="sr-only" htmlFor={`subissue-${issue.id}`}>
        Add an existing issue
      </label>
      <input
        id={`subissue-${issue.id}`}
        className="field"
        placeholder="Add an existing issue by title or key"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      {deferred.length >= 2 ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white p-1 shadow-pop">
          {results.isPending ? <p className="px-2 py-2 text-[12px] text-muted">Searching…</p> : null}
          {!results.isPending && choices.length === 0 ? <p className="px-2 py-2 text-[12px] text-faint">No matching issues</p> : null}
          {choices.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
              onClick={() => attach.mutate(item.id)}
              disabled={attach.isPending}
            >
              <span className="font-mono text-[11px] text-muted">{item.key}</span>
              <span className="mt-0.5 block truncate text-[13px] text-ink">{item.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
