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
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="DevCollab home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-[13px] text-muted sm:flex" aria-label="Site">
          <a className="hover:text-ink" href="#product">
            Product
          </a>
          <a className="hover:text-ink" href="#workflow">
            Workflow
          </a>
        </nav>
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

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
        <Logo />
        <p className="text-[13px] text-muted">A workspace for the issues a software team already has.</p>
        <div className="flex gap-2">
          <Link className="btn-quiet" to="/login">
            Sign in
          </Link>
          <Link className="btn-primary" to="/register">
            Create account
          </Link>
        </div>
      </div>
    </footer>
  );
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar px-10 py-10 text-stone-300 lg:flex">
        <Logo tone="light" />
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-stone-500">DevCollab</p>
          <h2 className="mt-3 max-w-sm text-3xl font-semibold tracking-[-0.04em] text-white">The work, the people, and the record of what changed.</h2>
          <ul className="mt-6 space-y-2 text-[14px] text-stone-400">
            <li>Boards, cycles, and estimates in one project</li>
            <li>Roles, invites, and a live inbox</li>
            <li>Comments, checklists, blockers, and sub-issues</li>
          </ul>
        </div>
        <p className="text-[12px] text-stone-500">Demo team: maya@devcollab.dev</p>
      </aside>
      <main className="flex flex-col bg-canvas">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8 lg:justify-end">
          <Link to="/" className="lg:hidden" aria-label="DevCollab home">
            <Logo />
          </Link>
          <Link className="text-[13px] text-muted hover:text-ink" to="/">
            Back home
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-0">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-ink">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card">{children}</div>
        </div>
      </main>
    </div>
  );
}

const previewIssues = [
  ['API-12', 'Signed cookie sessions', 'In progress', 'High'],
  ['API-9', 'Role checks on project routes', 'In review', 'Urgent'],
  ['WEB-4', 'Board columns for every status', 'Todo', 'Medium'],
];

const features = [
  ['Boards and lists', 'Drag an issue across columns, or switch to a list when you need the whole project in one scan.'],
  ['Cycles and estimates', 'One active cycle per project. Point totals show how much of it is done.'],
  ['My work', 'Open issues assigned to you, grouped by what is overdue, due this week, and later.'],
  ['Discussion', 'Comments with mentions, a short markdown set, watchers, and an inbox that updates live.'],
  ['Checklists and sub-issues', 'Break a task into steps, or into issues that keep their own status and key.'],
  ['Roles', 'Owners, admins, and members. Invite by email or with a one-time link.'],
];

export function LandingPage() {
  useDocumentTitle('Work together');
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:py-24">
          <div>
            <p className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-medium text-brand">Team workspace for software</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.045em] text-ink sm:text-5xl sm:leading-[1.05]">
              Projects, issues, and the people assigned to them.
            </h1>
            <p className="mt-4 max-w-md text-[16px] leading-7 text-muted">
              One place for roles, boards, comments, and the record of what changed. A new account opens on a starter workspace, so the first session is not an empty board.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link className="btn-primary h-10 px-4" to="/register">
                Create account
              </Link>
              <Link className="btn-ghost h-10 px-4" to="/login">
                Sign in
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-pop" aria-hidden="true">
            <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
              <span className="ml-3 text-[12px] text-muted">Northwind Labs / API Platform</span>
            </div>
            <div className="grid min-h-[280px] grid-cols-[132px_1fr]">
              <div className="bg-sidebar p-3 text-[12px] text-stone-400">
                <p className="rounded-md bg-white/10 px-2 py-1.5 font-medium text-white">Overview</p>
                <p className="px-2 py-1.5">My work</p>
                <p className="px-2 py-1.5">Projects</p>
                <p className="px-2 py-1.5">Members</p>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-canvas p-3">
                {previewIssues.map(([key, title, status]) => (
                  <article key={key} className="rounded-xl bg-white p-2.5 shadow-card">
                    <p className="font-mono text-[10px] text-faint">{key}</p>
                    <p className="mt-1 text-[12px] font-medium leading-4 text-ink">{title}</p>
                    <p className="mt-3 text-[10px] text-muted">{status}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="product" className="border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="max-w-lg text-2xl font-semibold tracking-[-0.03em] text-ink">Everything the team uses after the issue is filed.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(([title, body]) => (
                <article key={title} className="rounded-2xl border border-line bg-canvas p-5">
                  <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-muted">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="workflow" className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-3">
            {[
              ['01', 'Open a workspace', 'Create an account and you land in a starter workspace with a project, a board, and activity.'],
              ['02', 'File the work', 'Issues get a key, a status, assignees, a due date, and a place in the current cycle.'],
              ['03', 'Keep the team current', 'Comments, assignments, and due reminders show up in the inbox without a refresh.'],
            ].map(([index, title, body]) => (
              <div key={title}>
                <p className="font-mono text-[12px] text-brand">{index}</p>
                <h2 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
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
