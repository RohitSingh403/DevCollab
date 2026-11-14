import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { filterCommands, type CommandItem } from '../lib/commands';
import { api } from '../lib/api';
import { Icon } from './ui';

export function commandShortcut() {
  const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  return apple ? '⌘K' : 'Ctrl K';
}

export function CommandMenu({ open, workspaceId, onClose }: { open: boolean; workspaceId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const projects = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => api.projects(workspaceId), enabled: open });
  const trimmed = query.trim();
  const issues = useQuery({
    queryKey: ['search', workspaceId, trimmed],
    queryFn: () => api.search(workspaceId, trimmed),
    enabled: open && trimmed.length >= 2,
  });

  const places: CommandItem[] = [
    { id: 'overview', group: 'Go to', label: 'Overview', hint: 'Workspace', to: `/w/${workspaceId}` },
    { id: 'my-work', group: 'Go to', label: 'My work', hint: 'Assigned to you', to: `/w/${workspaceId}/my-work` },
    { id: 'projects', group: 'Go to', label: 'Projects', hint: 'All projects', to: `/w/${workspaceId}/projects` },
    { id: 'members', group: 'Go to', label: 'Members', hint: 'People and roles', to: `/w/${workspaceId}/members` },
    { id: 'activity', group: 'Go to', label: 'Activity', hint: 'Recent changes', to: `/w/${workspaceId}/activity` },
    { id: 'inbox', group: 'Go to', label: 'Notifications', hint: 'Inbox', to: '/notifications' },
  ];
  const projectItems: CommandItem[] = (projects.data ?? []).map((project) => ({
    id: `project-${project.id}`,
    group: 'Projects',
    label: project.name,
    hint: project.archived ? 'Archived' : project.key,
    to: `/w/${workspaceId}/projects/${project.id}`,
  }));
  const issueItems: CommandItem[] = (issues.data ?? []).map((issue) => ({
    id: `issue-${issue.id}`,
    group: 'Issues',
    label: issue.title,
    hint: `${issue.key} · ${issue.project.name}`,
    to: `/w/${workspaceId}/issues/${issue.id}`,
  }));
  const items = [...filterCommands([...places, ...projectItems], query), ...(trimmed.length >= 2 ? issueItems : [])];
  const selected = items[Math.min(active, Math.max(items.length - 1, 0))];

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, issues.data]);

  if (!open) return null;

  const go = (item: CommandItem) => {
    onClose();
    navigate(item.to);
  };

  const groups = items.reduce<{ group: CommandItem['group']; items: CommandItem[] }[]>((rows, item) => {
    const last = rows[rows.length - 1];
    if (!last || last.group !== item.group) rows.push({ group: item.group, items: [item] });
    else last.items.push(item);
    return rows;
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 p-4 sm:pt-[12vh]">
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close command menu" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="relative z-10 mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-line bg-white shadow-pop"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icon name="search" className="h-4 w-4 text-faint" />
          <input
            ref={inputRef}
            className="h-12 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
            placeholder="Search or jump to…"
            aria-label="Search or jump to"
            aria-controls={listId}
            aria-activedescendant={selected ? `${listId}-${selected.id}` : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && selected) {
                event.preventDefault();
                go(selected);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-auto p-1">
          {groups.map((group) => (
            <div key={group.group} className="mb-1">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{group.group}</p>
              {group.items.map((item) => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                const isActive = item.id === selected?.id;
                return (
                  <button
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${isActive ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {trimmed.length >= 2 && issues.isPending && !items.length ? <p className="px-3 py-6 text-center text-[13px] text-muted">Searching…</p> : null}
          {!items.length && !(trimmed.length >= 2 && issues.isPending) ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted">No matches.</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-[11px] text-faint">
          <span>↑↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
