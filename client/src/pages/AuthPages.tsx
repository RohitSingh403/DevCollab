import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Logo, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { safeNext } from '../lib/format';
import { useAuthStore } from '../stores/authStore';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/[0-9]/, 'Include a number'),
});

function SiteHeader() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="DevCollab home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link className="btn-quiet" to="/login">
            Sign in
          </Link>
          <Link className="btn-primary" to="/register">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6 rounded-lg border border-line bg-white p-5 shadow-sm">{children}</div>
      </main>
    </div>
  );
}

const previewIssues = [
  ['API-12', 'Signed cookie sessions', 'In progress', 'High'],
  ['API-9', 'Role checks on project routes', 'In review', 'Urgent'],
  ['WEB-4', 'Board columns for every status', 'Todo', 'Medium'],
];

export function LandingPage() {
  useDocumentTitle('Work together');
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <p className="text-sm font-medium text-brand">For software teams</p>
            <h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight text-ink">
              The workspace where issues, roles, and discussion stay together.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted">
              Create a workspace, invite the people doing the work, and keep projects, assignments, comments, and activity in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link className="btn-primary" to="/register">
                Create account
              </Link>
              <Link className="btn-ghost" to="/login">
                Sign in
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-medium">API Platform</p>
              <span className="text-xs text-muted">5 open</span>
            </div>
            <table className="w-full text-left text-sm">
              <tbody>
                {previewIssues.map(([key, title, status, priority]) => (
                  <tr key={key} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{key}</td>
                    <td className="px-2 py-3">{title}</td>
                    <td className="px-4 py-3 text-xs text-muted">{status}</td>
                    <td className="px-4 py-3 text-xs text-muted">{priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="border-t border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
            {[
              ['Workspaces and roles', 'Owners, admins, and members. Invites for people who already have an account, and a one-time link for everyone else.'],
              ['Issues with a paper trail', 'Status, priority, labels, assignees, due dates, comments, and a history of what changed.'],
              ['A live view of the team', 'Updates and notifications arrive as the work moves. Analytics come from the issues themselves.'],
            ].map(([title, body]) => (
              <div key={title}>
                <h2 className="text-sm font-semibold text-ink">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next') || (location.state as { from?: string } | null)?.from || null);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const login = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(['me'], user);
      navigate(next);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  return (
    <AuthFrame
      title="Sign in"
      subtitle={
        <>
          New here?{' '}
          <Link className="font-medium text-brand hover:underline" to="/register">
            Create an account
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = loginSchema.safeParse({ email, password });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Check the form');
            return;
          }
          setError('');
          login.mutate();
        }}
      >
        <label className="block">
          <span className="label">Email</span>
          <input className="field" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn-primary w-full" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {import.meta.env.DEV ? (
          <button
            className="btn-quiet w-full"
            type="button"
            onClick={() => {
              setEmail('maya@devcollab.dev');
              setPassword('Password123!');
            }}
          >
            Use demo account
          </button>
        ) : null}
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const register = useMutation({
    mutationFn: () => api.register({ name, email, password }),
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(['me'], user);
      navigate(next);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  return (
    <AuthFrame
      title="Create account"
      subtitle={
        <>
          Already have an account?{' '}
          <Link className="font-medium text-brand hover:underline" to={`/login?next=${encodeURIComponent(next)}`}>
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = registerSchema.safeParse({ name, email, password });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Check the form');
            return;
          }
          setError('');
          register.mutate();
        }}
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="field" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input className="field" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="field" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <p className="text-xs text-muted">At least 8 characters, with a letter and a number.</p>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn-primary w-full" type="submit" disabled={register.isPending}>
          {register.isPending ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthFrame>
  );
}
