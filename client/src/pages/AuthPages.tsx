import { useMutation, useQueryClient } from '@tanstack/react-query';
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

function StoryPanel() {
  return (
    <section className="relative hidden overflow-hidden border-r border-white/10 px-10 py-10 lg:flex lg:flex-col">
      <Logo />
      <p className="mt-16 font-mono text-xs uppercase tracking-[0.22em] text-acid">For software teams</p>
      <h1 className="mt-4 max-w-xl font-display text-5xl font-extrabold leading-[0.95]">
        Issues, roles, and the conversation around the work.
      </h1>
      <p className="mt-5 max-w-md text-mist-300">
        DevCollab is the shared side of building software: workspaces, projects, assignments, and a live trail of what changed.
      </p>
      <div className="mt-10 grid max-w-lg grid-cols-3 gap-3" aria-hidden="true">
        {['Backlog', 'In progress', 'Done'].map((column, index) => (
          <div key={column} className="rounded-2xl border border-white/10 bg-ink-900/70 p-3">
            <p className="text-xs text-mist-400">{column}</p>
            <div className={`mt-3 h-16 rounded-xl ${index === 1 ? 'bg-acid/20' : 'bg-white/5'}`} />
            <div className="mt-2 h-10 rounded-xl bg-white/5" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function LandingPage() {
  useDocumentTitle('Work together');
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <StoryPanel />
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="lg:hidden">
          <Logo />
        </div>
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.22em] text-acid lg:mt-0">DevCollab</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight sm:text-5xl">A workshop for the team shipping the product.</h1>
        <p className="mt-4 max-w-md text-mist-300">
          Create a workspace, invite the people doing the work, and keep issues, comments, and activity in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn-primary" to="/register">
            Create account
          </Link>
          <Link className="btn-ghost" to="/login">
            Sign in
          </Link>
        </div>
      </section>
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <StoryPanel />
      <section className="flex items-center justify-center px-6 py-12">
        <form
          className="w-full max-w-md"
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
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="font-display text-4xl font-bold">Sign in</h2>
          <p className="mt-2 text-sm text-mist-400">
            New here? <Link className="text-acid" to="/register">Create an account</Link>
          </p>
          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Email</span>
              <input className="field" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
          </div>
          {error ? (
            <p className="mt-4 text-sm text-rose" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn-primary mt-6 w-full" type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
          {import.meta.env.DEV ? (
            <button
              className="btn-quiet mt-3 w-full"
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
      </section>
    </div>
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <StoryPanel />
      <section className="flex items-center justify-center px-6 py-12">
        <form
          className="w-full max-w-md"
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
          <h2 className="font-display text-4xl font-bold">Create account</h2>
          <p className="mt-2 text-sm text-mist-400">
            Already collaborating? <Link className="text-acid" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </p>
          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="label">Name</span>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input className="field" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input className="field" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
          </div>
          {error ? (
            <p className="mt-4 text-sm text-rose" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn-primary mt-6 w-full" type="submit" disabled={register.isPending}>
            {register.isPending ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  );
}
