import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { FullScreenLoader, ToastViewport, useDocumentTitle } from './components/ui';
import { ApiError, api, errorMessage } from './lib/api';
import { useAuthStore } from './stores/authStore';
import { ActivityPage, NotificationsPage } from './pages/ActivityPage';
import { LandingPage, LoginPage, RegisterPage } from './pages/AuthPages';
import { InvitePage } from './pages/InvitePage';
import { IssuePage } from './pages/IssuePage';
import { MembersPage } from './pages/MembersPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { OverviewPage, WorkspaceHome } from './pages/OverviewPage';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';

function SessionGate({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const ready = useAuthStore((state) => state.ready);
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  useLayoutEffect(() => {
    if (query.isSuccess) setUser(query.data);
  }, [query.isSuccess, query.data, setUser]);

  if (query.isPending || (query.isSuccess && !ready)) return <FullScreenLoader />;
  if (query.isError) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="text-lg">{errorMessage(query.error)}</p>
          <button className="btn-primary mt-4" type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  return children;
}

function Protected({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Guest({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user) return children;
  const from = (location.state as { from?: string } | null)?.from;
  return <Navigate to={from && from.startsWith('/') ? from : '/app'} replace />;
}

function NotFound() {
  useDocumentTitle('Not found');
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">That page is not in this workspace.</p>
        <a className="btn-primary mt-6" href="/">
          Back home
        </a>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <SessionGate>
      <Routes>
        <Route path="/" element={<Guest><LandingPage /></Guest>} />
        <Route path="/login" element={<Guest><LoginPage /></Guest>} />
        <Route path="/register" element={<Guest><RegisterPage /></Guest>} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route path="/app" element={<WorkspaceHome />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/w/:workspaceId" element={<OverviewPage />} />
          <Route path="/w/:workspaceId/my-work" element={<MyWorkPage />} />
          <Route path="/w/:workspaceId/projects" element={<ProjectsPage />} />
          <Route path="/w/:workspaceId/projects/:projectId" element={<ProjectPage />} />
          <Route path="/w/:workspaceId/issues/:issueId" element={<IssuePage />} />
          <Route path="/w/:workspaceId/members" element={<MembersPage />} />
          <Route path="/w/:workspaceId/activity" element={<ActivityPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ToastViewport />
    </SessionGate>
  );
}
