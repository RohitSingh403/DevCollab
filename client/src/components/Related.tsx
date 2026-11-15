import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { Issue } from '../lib/types';
import { useUiStore } from '../stores/uiStore';
import { StatusBadge } from './ui';

export function Related({ workspaceId, issue }: { workspaceId: string; issue: Issue }) {
  const items = issue.related ?? [];
  const takenIds = [issue.id, ...items.map((item) => item.id)];
  return (
    <section className="panel mt-8 p-4">
      <h2 className="text-sm font-semibold">
        Related
        <span className="ml-2 font-normal text-faint">{items.length}</span>
      </h2>
      {items.length ? (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <Link to={`/w/${workspaceId}/issues/${item.id}`} className="min-w-0 flex-1">
                <span className="font-mono text-[11px] text-muted">{item.key}</span>
                <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">{item.title}</span>
              </Link>
              <StatusBadge status={item.status} />
              <RemoveRelated issueId={issue.id} relatedId={item.id} label={item.key} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">No related issues yet.</p>
      )}
      <RelatedSearch workspaceId={workspaceId} issueId={issue.id} takenIds={takenIds} />
    </section>
  );
}

function RemoveRelated({ issueId, relatedId, label }: { issueId: string; relatedId: string; label: string }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const remove = useMutation({
    mutationFn: () => api.removeRelated(issueId, relatedId),
    onSuccess: (next) => {
      queryClient.setQueryData(['issue', next.id], next);
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  return (
    <button className="btn-quiet shrink-0 px-2 text-[12px]" type="button" aria-label={`Remove relation to ${label}`} onClick={() => remove.mutate()} disabled={remove.isPending}>
      Remove
    </button>
  );
}

function RelatedSearch({ workspaceId, issueId, takenIds }: { workspaceId: string; issueId: string; takenIds: string[] }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const results = useQuery({
    queryKey: ['related-search', workspaceId, deferred],
    queryFn: () => api.search(workspaceId, deferred),
    enabled: deferred.length >= 2,
  });
  const add = useMutation({
    mutationFn: (relatedId: string) => api.addRelated(issueId, relatedId),
    onSuccess: (next) => {
      setQ('');
      queryClient.setQueryData(['issue', issueId], next);
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  const choices = (results.data ?? []).filter((item) => !takenIds.includes(item.id));

  return (
    <div className="relative mt-3">
      <label className="sr-only" htmlFor={`related-${issueId}`}>
        Add a related issue
      </label>
      <input
        id={`related-${issueId}`}
        className="field"
        placeholder="Add a related issue by title or key"
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
              onClick={() => add.mutate(item.id)}
              disabled={add.isPending}
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
