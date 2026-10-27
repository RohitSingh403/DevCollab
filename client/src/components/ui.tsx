import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { initials } from '../lib/format';
import type { IssueStatus, Priority, Role } from '../lib/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import { useUiStore } from '../stores/uiStore';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="#121417" />
        <path d="M6.5 8.2h6.2M6.5 12h11M6.5 15.8h8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {compact ? null : <span className="text-[14px] font-semibold tracking-[-0.02em] text-ink">DevCollab</span>}
    </span>
  );
}

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
    projects: <path d="M4 7h16M4 12h16M4 17h10" />,
    members: (
      <>
        <circle cx="9" cy="8" r="2.2" />
        <path d="M4.5 17c.6-2.2 2.3-3.2 4.5-3.2s3.9 1 4.5 3.2" />
        <circle cx="16" cy="9" r="1.7" />
        <path d="M15 13.8c1.6.2 2.8 1.1 3.4 3.2" />
      </>
    ),
    activity: <path d="M4 16l4-5 3 3 5-7 4 4" />,
    bell: (
      <>
        <path d="M6 16h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v3.9L6 16z" />
        <path d="M10 16a2 2 0 0 0 4 0" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="5" />
        <path d="M15 15l4 4" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export type IconName = 'overview' | 'projects' | 'members' | 'activity' | 'bell' | 'search' | 'menu';

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />;
}

export function FullScreenLoader({ label = 'Loading DevCollab' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas" role="status">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span
      className={`grid ${dimension} shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white`}
      style={{ background: color }}
      title={name}
    >
      {initials(name) || '•'}
    </span>
  );
}

const statusDot: Record<IssueStatus, string> = {
  backlog: 'bg-slate-400',
  todo: 'bg-blue-600',
  in_progress: 'bg-amber-500',
  in_review: 'bg-violet-500',
  done: 'bg-emerald-600',
};

export function StatusDot({ status }: { status: IssueStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${statusDot[status]}`} aria-hidden="true" />;
}

const priorityClass: Record<Priority, string> = {
  low: 'bg-slate-300',
  medium: 'bg-sky-500',
  high: 'bg-amber-500',
  urgent: 'bg-red-600',
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-[12px] font-medium text-ink">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityMark({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-sm ${priorityClass[priority]}`} aria-hidden="true" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const roleClass: Record<Role, string> = {
  owner: 'bg-ink text-white',
  admin: 'bg-slate-100 text-ink',
  member: 'bg-white text-muted',
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`inline-flex rounded-full border border-line px-2 py-0.5 text-[11px] font-medium capitalize ${roleClass[role]}`}>{role}</span>;
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        {meta ? <div className="mb-1 text-sm text-muted">{meta}</div> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <div className="page-lead">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
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
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-white p-5 shadow-pop"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
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
    <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
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
          className="pointer-events-auto rounded-md border border-line bg-white px-3 py-2.5 text-left text-sm text-ink shadow-pop"
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
