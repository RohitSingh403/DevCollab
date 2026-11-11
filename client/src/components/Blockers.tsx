import { useDeferredValue } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { Issue, IssueLink } from '../lib/types';
import { useUiStore } from '../stores/uiStore';
import { StatusBadge } from './ui';

export function Blockers({ workspaceId, issue }: { workspaceId: string; issue: Issue }) {
  const blockedBy = issue.blockedBy ?? [];
  const blocking = issue.blocking ?? [];
  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2">
      <RelationList
        title="Blocked by"
        empty="Nothing is blocking this issue."
        workspaceId={workspaceId}
        issueId={issue.id}
        items={blockedBy}
        addable
        takenIds={[issue.id, ...blockedBy.map((item) => item.id)]}
      />
      <RelationList title="Blocking" empty="This issue is not blocking anything else." workspaceId={workspaceId} issueId={issue.id} items={blocking} />
    </section>
  );
}

function RelationList({
  title,
  empty,
  workspaceId,
  issueId,
  items,
  addable = false,
  takenIds = [],
}: {
  title: string;
  empty: string;
  workspaceId: string;
  issueId: string;
  items: IssueLink[];
  addable?: boolean;
  takenIds?: string[];
}) {
  return (
    <div className="panel p-4">
      <h2 className="text-sm font-semibold">
        {title}
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
              <RemoveLink issueId={addable ? issueId : item.id} blockerId={addable ? item.id : issueId} label={item.key} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">{empty}</p>
      )}
      {addable ? <BlockerSearch workspaceId={workspaceId} issueId={issueId} takenIds={takenIds} /> : null}
    </div>
  );
}

function RemoveLink({ issueId, blockerId, label }: { issueId: string; blockerId: string; label: string }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const remove = useMutation({
    mutationFn: () => api.removeBlocker(issueId, blockerId),
    onSuccess: (next) => {
      queryClient.setQueryData(['issue', next.id], next);
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  return (
    <button className="btn-quiet shrink-0 px-2 text-[12px]" type="button" aria-label={`Remove ${label}`} onClick={() => remove.mutate()} disabled={remove.isPending}>
      Remove
    </button>
  );
}

function BlockerSearch({ workspaceId, issueId, takenIds }: { workspaceId: string; issueId: string; takenIds: string[] }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const results = useQuery({
    queryKey: ['blocker-search', workspaceId, deferred],
    queryFn: () => api.search(workspaceId, deferred),
    enabled: deferred.length >= 2,
  });
  const add = useMutation({
    mutationFn: (blockerId: string) => api.addBlocker(issueId, blockerId),
    onSuccess: (next) => {
      setQ('');
      queryClient.setQueryData(['issue', issueId], next);
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  const choices = (results.data ?? []).filter((item) => !takenIds.includes(item.id));

  return (
    <div className="relative mt-3">
      <label className="sr-only" htmlFor={`blocker-${issueId}`}>
        Add a blocker
      </label>
      <input
        id={`blocker-${issueId}`}
        className="field"
        placeholder="Add a blocker by title or key"
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
