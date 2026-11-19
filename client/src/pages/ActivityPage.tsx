import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, PageHeader, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Activity, NotificationPreferences } from '../lib/types';

const INBOX_CHOICES: { key: keyof NotificationPreferences; label: string; detail: string }[] = [
  { key: 'assignments', label: 'Assignments', detail: 'When someone assigns you an issue' },
  { key: 'comments', label: 'Comments', detail: 'Comments on issues you follow or are assigned to' },
  { key: 'mentions', label: 'Mentions', detail: 'When a comment names you' },
  { key: 'status', label: 'Status changes', detail: 'When an issue you follow moves to another status' },
  { key: 'blockers', label: 'Blockers', detail: 'When an issue you follow is blocked or unblocked' },
  { key: 'reminders', label: 'Due reminders', detail: 'The day an issue is due, and again after that day passes' },
];

const ACTIVITY_KINDS = [
  { id: 'issues', label: 'Issues', noun: 'issue changes' },
  { id: 'comments', label: 'Comments', noun: 'comments' },
  { id: 'blockers', label: 'Blockers', noun: 'blocker changes' },
  { id: 'cycles', label: 'Cycles', noun: 'cycle changes' },
  { id: 'milestones', label: 'Milestones', noun: 'milestone changes' },
  { id: 'members', label: 'Members', noun: 'membership changes' },
];

export function ActivityText({ workspaceId, item, className = 'text-sm' }: { workspaceId: string; item: Activity; className?: string }) {
  if (item.issueId) {
    return (
      <Link className={`${className} hover:text-brand`} to={`/w/${workspaceId}/issues/${item.issueId}`}>
        {item.message}
      </Link>
    );
  }
  if (item.projectId) {
    return (
      <Link className={`${className} hover:text-brand`} to={`/w/${workspaceId}/projects/${item.projectId}`}>
        {item.message}
      </Link>
    );
  }
  return <p className={className}>{item.message}</p>;
}

export function ActivityPage() {
  const { workspaceId = '' } = useParams();
  const [page, setPage] = useState(1);
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState('');
  const projects = useQuery({ queryKey: ['projects', workspaceId], queryFn: () => api.projects(workspaceId) });
  const activity = useQuery({
    queryKey: ['activity', workspaceId, page, projectId, kind],
    queryFn: () => api.activity(`/api/workspaces/${workspaceId}/activity`, page, projectId || undefined, kind || undefined),
  });
  useDocumentTitle('Activity');
  const selected = (projects.data ?? []).find((project) => project.id === projectId);
  const kindLabel = ACTIVITY_KINDS.find((item) => item.id === kind)?.noun;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Activity"
        description="A running history of issues, comments, and membership changes in this workspace."
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              className="field w-auto"
              aria-label="Filter by kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All activity</option>
              {ACTIVITY_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className="field w-auto"
              aria-label="Filter by project"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All projects</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} {project.name}
                  {project.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </div>
        }
      />
      {activity.isError ? <p className="text-sm text-danger">{errorMessage(activity.error)}</p> : null}
      <ul className="panel divide-y divide-line">
        {(activity.data?.activities ?? []).map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-3">
            <Avatar name={item.actor.name} color={item.actor.avatarColor} size="sm" />
            <div>
              <ActivityText workspaceId={workspaceId} item={item} />
              <p className="mt-1 text-xs text-faint">{timeAgo(item.createdAt)}</p>
            </div>
          </li>
        ))}
        {activity.data && !activity.data.activities.length ? (
          <li className="px-4 py-8 text-sm text-muted">
            {kindLabel
              ? `No ${kindLabel} in this history${selected ? ` for ${selected.key}` : ''}.`
              : selected
                ? `Nothing has happened in ${selected.key} yet.`
                : 'Activity will show up as the team files work.'}
          </li>
        ) : null}
      </ul>
      {activity.data && activity.data.pages > 1 ? (
        <div className="flex gap-2">
          <button className="btn-ghost" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </button>
          <button className="btn-ghost" type="button" disabled={page >= activity.data.pages} onClick={() => setPage((current) => current + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const preferences = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: api.notificationPreferences,
    enabled: prefsOpen,
  });
  const [prefError, setPrefError] = useState('');
  const savePreference = useMutation({
    mutationFn: (input: Partial<NotificationPreferences>) => api.updateNotificationPreferences(input),
    onSuccess: (next) => {
      setPrefError('');
      queryClient.setQueryData(['notification-preferences'], next);
    },
    onError: (reason) => setPrefError(errorMessage(reason)),
  });
  useDocumentTitle('Notifications');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Notifications</h1>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" type="button" aria-expanded={prefsOpen} onClick={() => setPrefsOpen((open) => !open)}>
            Preferences
          </button>
          <button className="btn-ghost" type="button" onClick={() => api.markAllRead().then(() => notifications.refetch())}>
            Mark all read
          </button>
        </div>
      </div>
      {prefsOpen ? (
        <section className="panel px-4 py-3">
          <h2 className="text-sm font-semibold">Inbox preferences</h2>
          <p className="mt-1 text-[12px] text-muted">These choices are yours. Alerts already in the inbox stay here.</p>
          {preferences.isPending ? <p className="mt-3 text-sm text-muted">Loading preferences…</p> : null}
          {preferences.data ? (
            <ul className="mt-3 divide-y divide-line">
              {INBOX_CHOICES.map((choice) => (
                <li key={choice.key} className="flex items-start justify-between gap-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">{choice.label}</span>
                    <span className="mt-0.5 block text-[12px] text-muted">{choice.detail}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={choice.label}
                    checked={preferences.data[choice.key]}
                    disabled={savePreference.isPending}
                    onChange={() => savePreference.mutate({ [choice.key]: !preferences.data[choice.key] })}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {prefError ? <p className="mt-2 text-sm text-danger" role="alert">{prefError}</p> : null}
        </section>
      ) : null}
      <ul className="panel divide-y divide-line">
        {(notifications.data?.notifications ?? []).map((item) => (
          <li key={item.id} className={`px-4 py-3 ${item.read ? 'opacity-70' : ''}`}>
            <a href={item.link || '/notifications'} className="text-sm hover:text-brand" onClick={() => { if (!item.read) void api.markRead(item.id); }}>
              {item.message}
            </a>
            <p className="mt-1 text-xs text-faint">{timeAgo(item.createdAt)}</p>
          </li>
        ))}
        {notifications.data && !notifications.data.notifications.length ? <li className="px-4 py-8 text-sm text-muted">No notifications yet. Assignments, comments, and due reminders show up here.</li> : null}
      </ul>
    </div>
  );
}
