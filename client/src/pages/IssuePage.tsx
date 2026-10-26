import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { timeAgo, toDateInput } from '../lib/format';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type IssueStatus, type Priority, type Role } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export function IssuePage() {
  const { workspaceId = '', issueId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const pushToast = useUiStore((state) => state.pushToast);
  const queryClient = useQueryClient();
  const issue = useQuery({ queryKey: ['issue', issueId], queryFn: () => api.issue(issueId) });
  const comments = useQuery({ queryKey: ['comments', issueId], queryFn: () => api.comments(issueId) });
  const activity = useQuery({ queryKey: ['activity', 'issue', issueId], queryFn: () => api.activity(`/api/issues/${issueId}/activity`) });
  const workspace = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => api.workspace(workspaceId) });
  const members = useQuery({ queryKey: ['members', workspaceId], queryFn: () => api.members(workspaceId) });
  const labels = useQuery({ queryKey: ['labels', workspaceId], queryFn: () => api.labels(workspaceId) });
  useDocumentTitle(issue.data ? `${issue.data.key} ${issue.data.title}` : 'Issue');

  const save = useMutation({
    mutationFn: (input: Parameters<typeof api.updateIssue>[1]) => api.updateIssue(issueId, input),
    onSuccess: (next) => {
      queryClient.setQueryData(['issue', issueId], next);
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteIssue(issueId),
    onSuccess: () => {
      navigate(`/w/${workspaceId}/projects/${issue.data?.project.id ?? ''}`);
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  const role = workspace.data?.role;
  const canDelete = Boolean(user && issue.data && (issue.data.reporter.id === user.id || role === 'owner' || role === 'admin'));

  if (issue.isPending) return <p className="text-sm text-muted">Loading issue…</p>;
  if (issue.isError) return <p className="text-sm text-danger">{errorMessage(issue.error)}</p>;
  const current = issue.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <p className="text-sm text-muted">
          <Link className="hover:text-brand" to={`/w/${workspaceId}/projects`}>
            Projects
          </Link>
          <span aria-hidden="true"> / </span>
          <Link className="hover:text-brand" to={`/w/${workspaceId}/projects/${current.project.id}`}>
            {current.project.name}
          </Link>
        </p>
        <p className="mt-3 font-mono text-xs text-muted">{current.key}</p>
        <TitleEditor title={current.title} onSave={(title) => save.mutate({ title })} />
        <DescriptionEditor description={current.description} onSave={(description) => save.mutate({ description })} />
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Comments</h2>
          <ul className="mt-3 space-y-3">
            {(comments.data ?? []).map((comment) => (
              <CommentCard key={comment.id} comment={comment} role={role} />
            ))}
          </ul>
          <CommentComposer issueId={issueId} />
        </section>
      </div>
      <aside className="space-y-4">
        <section className="panel space-y-4 p-4">
          <label className="block">
            <span className="label">Status</span>
            <select className="field" value={current.status} onChange={(event) => save.mutate({ status: event.target.value as IssueStatus })}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Priority</span>
            <select className="field" value={current.priority} onChange={(event) => save.mutate({ priority: event.target.value as Priority })}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Due date</span>
            <input
              className="field"
              type="date"
              value={toDateInput(current.dueDate)}
              onChange={(event) => save.mutate({ dueDate: event.target.value || null })}
            />
          </label>
          <fieldset>
            <legend className="label">Assignees</legend>
            <div className="space-y-2">
              {(members.data ?? []).map((member) => {
                const checked = current.assignees.some((person) => person.id === member.user.id);
                return (
                  <label key={member.user.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const ids = current.assignees.map((person) => person.id);
                        save.mutate({ assigneeIds: checked ? ids.filter((id) => id !== member.user.id) : [...ids, member.user.id] });
                      }}
                    />
                    <Avatar name={member.user.name} color={member.user.avatarColor} size="sm" />
                    {member.user.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Labels</legend>
            <div className="flex flex-wrap gap-2">
              {(labels.data ?? []).map((label) => {
                const checked = current.labels.some((item) => item.id === label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`rounded border px-2 py-0.5 text-xs ${checked ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'}`}
                    onClick={() => {
                      const ids = current.labels.map((item) => item.id);
                      save.mutate({ labelIds: checked ? ids.filter((id) => id !== label.id) : [...ids, label.id] });
                    }}
                  >
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: label.color }} />
                    {label.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="text-xs text-faint">Opened by {current.reporter.name} · {timeAgo(current.createdAt)}</p>
          {canDelete ? (
            <button
              className="btn-danger w-full"
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ${current.key}?`)) remove.mutate();
              }}
            >
              Delete issue
            </button>
          ) : null}
        </section>
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">History</h2>
          <ul className="mt-3 space-y-3">
            {(activity.data?.activities ?? []).map((item) => (
              <li key={item.id} className="text-sm">
                <p>{item.message}</p>
                <p className="text-xs text-faint">{timeAgo(item.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function TitleEditor({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="mt-1 w-full resize-none overflow-hidden bg-transparent text-2xl font-semibold leading-snug tracking-tight text-ink outline-none"
      aria-label="Issue title"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value.trim().length >= 3 && value !== title) onSave(value.trim());
      }}
    />
  );
}

function DescriptionEditor({ description, onSave }: { description: string; onSave: (description: string) => void }) {
  const [value, setValue] = useState(description);
  useEffect(() => setValue(description), [description]);
  return (
    <textarea
      className="mt-3 min-h-28 w-full resize-y rounded-md border border-transparent bg-transparent px-1 py-2 text-sm leading-6 text-ink outline-none placeholder:text-faint focus:border-line focus:bg-white focus:px-3"
      aria-label="Issue description"
      placeholder="Add context for the people picking this up."
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== description) onSave(value);
      }}
    />
  );
}

function CommentComposer({ issueId }: { issueId: string }) {
  const [body, setBody] = useState('');
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const add = useMutation({
    mutationFn: () => api.addComment(issueId, body.trim()),
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['comments', issueId] });
      await queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
    },
    onError: (error) => pushToast(errorMessage(error)),
  });
  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) add.mutate();
      }}
    >
      <label className="block">
        <span className="label">Add a comment</span>
        <textarea className="field min-h-24" value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <button className="btn-primary" type="submit" disabled={!body.trim() || add.isPending}>
        Comment
      </button>
    </form>
  );
}

function CommentCard({
  comment,
  role,
}: {
  comment: { id: string; body: string; author: { id: string; name: string; avatarColor: string }; createdAt: string; edited: boolean };
  role?: Role;
}) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const isAuthor = user?.id === comment.author.id;
  const canModerate = role === 'owner' || role === 'admin';
  const save = useMutation({
    mutationFn: () => api.updateComment(comment.id, body.trim()),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['comments'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteComment(comment.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['comments'] }),
  });
  return (
    <li className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <Avatar name={comment.author.name} color={comment.author.avatarColor} size="sm" />
          <span className="font-medium">{comment.author.name}</span>
          <span className="text-faint">{timeAgo(comment.createdAt)}{comment.edited ? ' · edited' : ''}</span>
        </span>
        <span className="flex gap-1">
          {isAuthor ? (
            <button className="btn-quiet" type="button" onClick={() => setEditing((open) => !open)}>
              Edit
            </button>
          ) : null}
          {isAuthor || canModerate ? (
            <button className="btn-quiet" type="button" onClick={() => remove.mutate()}>
              Delete
            </button>
          ) : null}
        </span>
      </div>
      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <textarea className="field min-h-20" value={body} onChange={(event) => setBody(event.target.value)} />
          <button className="btn-primary" type="submit">
            Save comment
          </button>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
      )}
    </li>
  );
}
