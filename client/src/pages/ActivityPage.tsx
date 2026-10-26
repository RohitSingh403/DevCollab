import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, PageHeader, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { timeAgo } from '../lib/format';

export function ActivityPage() {
  const { workspaceId = '' } = useParams();
  const [page, setPage] = useState(1);
  const activity = useQuery({
    queryKey: ['activity', workspaceId, page],
    queryFn: () => api.activity(`/api/workspaces/${workspaceId}/activity`, page),
  });
  useDocumentTitle('Activity');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Activity" description="A running history of issues, comments, and membership changes in this workspace." />
      {activity.isError ? <p className="text-sm text-danger">{errorMessage(activity.error)}</p> : null}
      <ul className="panel divide-y divide-line">
        {(activity.data?.activities ?? []).map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-3">
            <Avatar name={item.actor.name} color={item.actor.avatarColor} size="sm" />
            <div>
              <p className="text-sm">{item.message}</p>
              <p className="mt-1 text-xs text-faint">{timeAgo(item.createdAt)}</p>
            </div>
          </li>
        ))}
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
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  useDocumentTitle('Notifications');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Notifications</h1>
        <button className="btn-ghost" type="button" onClick={() => api.markAllRead().then(() => notifications.refetch())}>
          Mark all read
        </button>
      </div>
      <ul className="panel divide-y divide-line">
        {(notifications.data?.notifications ?? []).map((item) => (
          <li key={item.id} className={`px-4 py-3 ${item.read ? 'opacity-70' : ''}`}>
            <a href={item.link || '/notifications'} className="text-sm hover:text-brand" onClick={() => { if (!item.read) void api.markRead(item.id); }}>
              {item.message}
            </a>
            <p className="mt-1 text-xs text-faint">{timeAgo(item.createdAt)}</p>
          </li>
        ))}
        {notifications.data && !notifications.data.notifications.length ? <li className="text-sm text-muted">No notifications yet.</li> : null}
      </ul>
    </div>
  );
}
