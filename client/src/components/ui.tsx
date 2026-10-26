import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { initials } from '../lib/format';
import type { IssueStatus, Priority, Role } from '../lib/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import { useUiStore } from '../stores/uiStore';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#e7f56a" />
        <path d="M9 11h6M9 16h14M9 21h9" stroke="#14180c" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {compact ? null : <span className="font-display text-lg font-bold tracking-tight">DevCollab</span>}
    </span>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />;
}

export function FullScreenLoader({ label = 'Loading DevCollab' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center" role="status">
      <div className="flex items-center gap-3 text-mist-300">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  return (
    <span
      className={`grid ${dimension} shrink-0 place-items-center rounded-full font-semibold text-ink-950`}
      style={{ background: color }}
      title={name}
    >
      {initials(name) || '•'}
    </span>
  );
}

const statusClass: Record<IssueStatus, string> = {
  backlog: 'bg-white/5 text-mist-300',
  todo: 'bg-sky/15 text-sky',
  in_progress: 'bg-amber/15 text-amber',
  in_review: 'bg-[#d4bfff]/15 text-[#d4bfff]',
  done: 'bg-mint/15 text-mint',
};

const priorityClass: Record<Priority, string> = {
  low: 'bg-mist-400',
  medium: 'bg-sky',
  high: 'bg-amber',
  urgent: 'bg-rose',
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityMark({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-mist-300">
      <span className={`h-2 w-2 rounded-full ${priorityClass[priority]}`} aria-hidden="true" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs capitalize text-mist-300">{role}</span>;
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-rose">{error}</span> : null}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button className="absolute inset-0 bg-black/60" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-2xl font-bold">
            {title}
          </h2>
          <button className="btn-quiet" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <h3 className="font-display text-2xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-mist-400">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(100%-2rem,22rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="pointer-events-auto rounded-2xl border border-white/10 bg-ink-800 px-4 py-3 text-left text-sm shadow-panel"
          onClick={() => dismiss(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · DevCollab` : 'DevCollab';
  }, [title]);
}
