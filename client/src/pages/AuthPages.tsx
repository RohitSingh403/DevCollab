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
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div>
            <p className="text-[13px] font-medium text-muted">Team workspace for software</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl sm:leading-[1.05]">
              Projects, issues, and the people assigned to them.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-muted">
              One place for roles, boards, comments, and the record of what changed. Built for a team that already has the work.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link className="btn-primary" to="/register">
                Create account
              </Link>
              <Link className="btn-ghost" to="/login">
                Sign in
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-pop" aria-hidden="true">
            <div className="flex items-center gap-1.5 border-b border-line bg-white px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="ml-3 text-[12px] text-faint">Northwind Labs / API Platform</span>
            </div>
            <div className="grid grid-cols-[148px_1fr]">
              <div className="border-r border-line bg-white p-3 text-[12px] text-muted">
                <p className="rounded-md bg-slate-100 px-2 py-1.5 font-medium text-ink">Overview</p>
                <p className="px-2 py-1.5">Projects</p>
                <p className="px-2 py-1.5">Members</p>
                <p className="px-2 py-1.5">Activity</p>
              </div>
              <div className="p-3">
                <table className="w-full overflow-hidden rounded-lg border border-line bg-white text-left text-[12px]">
                  <tbody>
                    {previewIssues.map(([key, title, status, priority]) => (
                      <tr key={key} className="border-b border-line last:border-0">
                        <td className="px-3 py-2.5 font-mono text-[11px] text-faint">{key}</td>
                        <td className="px-2 py-2.5 font-medium text-ink">{title}</td>
                        <td className="px-3 py-2.5 text-muted">{status}</td>
                        <td className="px-3 py-2.5 text-muted">{priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
        <section className="border-t border-line bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-px bg-line px-0 py-px sm:grid-cols-3">
            {[
              ['01', 'Workspaces and roles', 'Owners, admins, and members. Invite someone who already has an account, or send a one-time link.'],
              ['02', 'Issues with a record', 'Status, priority, labels, assignees, due dates, comments, and a history of every change.'],
              ['03', 'Live team activity', 'Comments and assignments show up for the rest of the workspace. Counts come from the issues themselves.'],
            ].map(([index, title, body]) => (
              <div key={title} className="bg-white px-6 py-8">
                <p className="font-mono text-[11px] text-faint">{index}</p>
                <h2 className="mt-3 text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-muted">{body}</p>
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
        <p className="text-xs text-muted">At least 8 characters, with a letter and a number. A starter workspace is created with the account.</p>
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
