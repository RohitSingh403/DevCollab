import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import { disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { useRealtime } from '../hooks/useRealtime';
import { Avatar, Logo, Modal } from './ui';

const links = [
  { label: 'Overview', suffix: '' },
  { label: 'Projects', suffix: '/projects' },
  { label: 'Members', suffix: '/members' },
  { label: 'Activity', suffix: '/activity' },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? '');

  useEffect(() => {
    if (paramId) rememberWorkspace(paramId);
  }, [paramId, rememberWorkspace]);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

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
      setAccountOpen(false);
      pushToast('Profile updated');
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  const markRead = useMutation({
    mutationFn: api.markRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-acid focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>
      {navOpen ? <button className="fixed inset-0 z-30 bg-black/50 lg:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-white/10 bg-ink-950 p-4 transition lg:static ${navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Logo />
        <label className="mt-6 block">
          <span className="label">Workspace</span>
          <select
            className="field"
            value={activeId ?? ''}
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
        <button
          className="btn-ghost mt-3 w-full"
          type="button"
          onClick={() => {
            setNavOpen(false);
            navigate('/app?new=1');
          }}
        >
          New workspace
        </button>
        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Workspace">
          {links.map((link) => (
            <NavLink
              key={link.label}
              to={activeId ? `/w/${activeId}${link.suffix}` : '/app'}
              end={link.suffix === ''}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-acid text-ink-950' : 'text-mist-300 hover:bg-white/5 hover:text-mist-50'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/notifications"
            onClick={() => setNavOpen(false)}
            className={({ isActive }) =>
              `rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-acid text-ink-950' : 'text-mist-300 hover:bg-white/5 hover:text-mist-50'}`
            }
          >
            Notifications
          </NavLink>
        </nav>
        <button className="mt-4 flex items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/5" type="button" onClick={() => setAccountOpen(true)}>
          {user ? <Avatar name={user.name} color={user.avatarColor} /> : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user?.name}</span>
            <span className="block truncate text-xs text-mist-500">{user?.email}</span>
          </span>
        </button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-ink-950/80 px-4 py-3 backdrop-blur">
          <button className="btn-ghost lg:hidden" type="button" onClick={() => setNavOpen(true)}>
            Menu
          </button>
          {activeId ? <SearchBox workspaceId={activeId} /> : <div className="flex-1" />}
          <div className="relative">
            <button className="btn-ghost" type="button" onClick={() => setNotesOpen((open) => !open)} aria-expanded={notesOpen}>
              Inbox
              {notifications.data?.unread ? (
                <span className="rounded-full bg-acid px-1.5 text-xs text-ink-950">{notifications.data.unread}</span>
              ) : null}
            </button>
            {notesOpen ? (
              <div className="panel absolute right-0 mt-2 w-80 p-2">
                {(notifications.data?.notifications ?? []).slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5"
                    onClick={() => {
                      if (!item.read) markRead.mutate(item.id);
                      setNotesOpen(false);
                      if (item.link) navigate(item.link);
                    }}
                  >
                    <span className={item.read ? 'text-mist-400' : 'text-mist-50'}>{item.message}</span>
                    <span className="mt-1 block text-xs text-mist-500">{timeAgo(item.createdAt)}</span>
                  </button>
                ))}
                {!notifications.data?.notifications.length ? <p className="px-3 py-4 text-sm text-mist-500">You are caught up.</p> : null}
                <button className="btn-quiet w-full" type="button" onClick={() => { setNotesOpen(false); navigate('/notifications'); }}>
                  View all
                </button>
              </div>
            ) : null}
          </div>
          <button className="btn-quiet" type="button" onClick={() => setMenuOpen((open) => !open)}>
            Account
          </button>
          {menuOpen ? (
            <button className="btn-danger" type="button" onClick={() => logout.mutate()}>
              Log out
            </button>
          ) : null}
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <Modal open={accountOpen} title="Your account" onClose={() => setAccountOpen(false)}>
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
          <p className="text-sm text-mist-400">{user?.email}</p>
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
      <input
        id="workspace-search"
        className="field"
        placeholder="Search issues"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      {deferred.length >= 2 ? (
        <div className="panel absolute z-30 mt-2 w-full p-2">
          {(results.data ?? []).map((issue) => (
            <button
              key={issue.id}
              type="button"
              className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/5"
              onClick={() => {
                setQ('');
                navigate(`/w/${workspaceId}/issues/${issue.id}`);
              }}
            >
              <span className="font-mono text-xs text-mist-400">{issue.key}</span>
              <span className="mt-0.5 block text-sm">{issue.title}</span>
            </button>
          ))}
          {results.isFetched && !results.data?.length ? <p className="px-3 py-3 text-sm text-mist-500">No matching issues.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
