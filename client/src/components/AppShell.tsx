import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import { disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { useRealtime } from '../hooks/useRealtime';
import { Avatar, Icon, Logo, Modal, type IconName } from './ui';

const links: { label: string; suffix: string; icon: IconName }[] = [
  { label: 'Overview', suffix: '', icon: 'overview' },
  { label: 'Projects', suffix: '/projects', icon: 'projects' },
  { label: 'Members', suffix: '/members', icon: 'members' },
  { label: 'Activity', suffix: '/activity', icon: 'activity' },
];

export function AppShell() {
  const { workspaceId: paramId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navOpen = useUiStore((state) => state.navOpen);
  const setNavOpen = useUiStore((state) => state.setNavOpen);
  const remembered = useUiStore((state) => state.workspaceId);
  const rememberWorkspace = useUiStore((state) => state.rememberWorkspace);
  const pushToast = useUiStore((state) => state.pushToast);
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const activeId = paramId ?? remembered ?? workspaces.data?.[0]?.id;
  useRealtime(activeId);
  const [notesOpen, setNotesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const notesRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paramId) rememberWorkspace(paramId);
  }, [paramId, rememberWorkspace]);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    if (!notesOpen && !accountOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notesOpen && notesRef.current && !notesRef.current.contains(target)) setNotesOpen(false);
      if (accountOpen && accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [notesOpen, accountOpen]);

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      disconnectSocket();
      setUser(null);
      queryClient.clear();
      navigate('/login');
    },
  });

  const rename = useMutation({
    mutationFn: () => api.updateProfile(name.trim()),
    onSuccess: (next) => {
      setUser(next);
      queryClient.setQueryData(['me'], next);
      setProfileOpen(false);
      pushToast('Profile updated');
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  const markRead = useMutation({
    mutationFn: api.markRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[232px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      {navOpen ? <button className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col bg-sidebar text-slate-300 transition lg:static ${navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex h-14 items-center border-b border-white/10 px-4">
          <Logo tone="inverse" />
        </div>
        <div className="px-3 pt-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Workspace</span>
            <select
              className="field-dark"
              value={activeId ?? ''}
              aria-label="Workspace"
              onChange={(event) => {
                rememberWorkspace(event.target.value);
                setNavOpen(false);
                navigate(`/w/${event.target.value}`);
              }}
            >
              {(workspaces.data ?? []).map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-2" aria-label="Workspace">
          {links.map((link) => (
            <NavLink
              key={link.label}
              to={activeId ? `/w/${activeId}${link.suffix}` : '/app'}
              end={link.suffix === ''}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`
              }
            >
              <Icon name={link.icon} />
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/notifications"
            onClick={() => setNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`
            }
          >
            <Icon name="bell" />
            Notifications
            {unread ? <span className="ml-auto rounded bg-brand px-1.5 text-[11px] font-medium text-white">{unread}</span> : null}
          </NavLink>
        </nav>
        <div className="border-t border-white/10 p-2">
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-white/5"
            type="button"
            onClick={() => {
              setNavOpen(false);
              navigate('/app?new=1');
            }}
          >
            <span className="text-sm text-slate-300">New workspace</span>
          </button>
          <button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-white/5" type="button" onClick={() => setProfileOpen(true)}>
            {user ? <Avatar name={user.name} color={user.avatarColor} size="sm" /> : null}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">{user?.name}</span>
              <span className="block truncate text-xs text-slate-400">{user?.email}</span>
            </span>
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4">
          <button className="btn-ghost px-2 lg:hidden" type="button" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          {activeId ? <SearchBox workspaceId={activeId} /> : <div className="flex-1" />}
          <div className="relative" ref={notesRef}>
            <button
              className="btn-ghost relative px-2"
              type="button"
              aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'}
              aria-expanded={notesOpen}
              onClick={() => {
                setAccountOpen(false);
                setNotesOpen((open) => !open);
              }}
            >
              <Icon name="bell" />
              {unread ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-brand px-1.5 text-[10px] font-semibold leading-4 text-white">{unread}</span>
              ) : null}
            </button>
            {notesOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-line bg-white p-1 shadow-pop">
                <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-faint">Inbox</p>
                {(notifications.data?.notifications ?? []).slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      if (!item.read) markRead.mutate(item.id);
                      setNotesOpen(false);
                      if (item.link) navigate(item.link);
                    }}
                  >
                    <span className={`block text-sm ${item.read ? 'text-muted' : 'font-medium text-ink'}`}>{item.message}</span>
                    <span className="mt-0.5 block text-xs text-faint">{timeAgo(item.createdAt)}</span>
                  </button>
                ))}
                {!notifications.data?.notifications.length ? <p className="px-3 py-4 text-sm text-muted">You are caught up.</p> : null}
                <button
                  className="btn-quiet w-full"
                  type="button"
                  onClick={() => {
                    setNotesOpen(false);
                    navigate('/notifications');
                  }}
                >
                  View all
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative" ref={accountRef}>
            <button
              className="flex items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              type="button"
              aria-label="Account menu"
              aria-expanded={accountOpen}
              onClick={() => {
                setNotesOpen(false);
                setAccountOpen((open) => !open);
              }}
            >
              {user ? <Avatar name={user.name} color={user.avatarColor} size="sm" /> : null}
            </button>
            {accountOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-line bg-white p-1 shadow-pop">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
                <button
                  className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    setProfileOpen(true);
                  }}
                >
                  Account settings
                </button>
                <button
                  className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-danger hover:bg-red-50"
                  type="button"
                  onClick={() => logout.mutate()}
                >
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
      <Modal open={profileOpen} title="Account settings" onClose={() => setProfileOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <label className="block">
            <span className="label">Name</span>
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
          </label>
          <p className="text-sm text-muted">{user?.email}</p>
          <button className="btn-primary" type="submit" disabled={rename.isPending}>
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}

function SearchBox({ workspaceId }: { workspaceId: string }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const navigate = useNavigate();
  const results = useQuery({
    queryKey: ['search', workspaceId, deferred],
    queryFn: () => api.search(workspaceId, deferred),
    enabled: deferred.length >= 2,
  });
  return (
    <div className="relative min-w-0 flex-1">
      <label className="sr-only" htmlFor="workspace-search">
        Search issues
      </label>
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        id="workspace-search"
        className="field max-w-md pl-8"
        placeholder="Search issues"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      {deferred.length >= 2 ? (
        <div className="absolute z-30 mt-1 w-full max-w-md rounded-lg border border-line bg-white p-1 shadow-pop">
          {(results.data ?? []).map((issue) => (
            <button
              key={issue.id}
              type="button"
              className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => {
                setQ('');
                navigate(`/w/${workspaceId}/issues/${issue.id}`);
              }}
            >
              <span className="font-mono text-xs text-muted">{issue.key}</span>
              <span className="mt-0.5 block text-sm">{issue.title}</span>
            </button>
          ))}
          {results.isFetched && !results.data?.length ? <p className="px-3 py-3 text-sm text-muted">No matching issues.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
