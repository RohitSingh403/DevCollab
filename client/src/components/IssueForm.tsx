import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { LABEL_COLORS, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type IssueStatus, type Priority } from '../lib/types';

export function IssueForm({
  workspaceId,
  projectId,
  onCreated,
}: {
  workspaceId: string;
  projectId: string;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['members', workspaceId], queryFn: () => api.members(workspaceId) });
  const labels = useQuery({ queryKey: ['labels', workspaceId], queryFn: () => api.labels(workspaceId) });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<IssueStatus>('todo');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);
  const [error, setError] = useState('');

  const createLabel = useMutation({
    mutationFn: () => api.createLabel(workspaceId, { name: labelName, color: labelColor }),
    onSuccess: (label) => {
      setLabelIds((current) => [...current, label.id]);
      setLabelName('');
      void queryClient.invalidateQueries({ queryKey: ['labels', workspaceId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  const createIssue = useMutation({
    mutationFn: () =>
      api.createIssue(projectId, {
        title,
        description,
        status,
        priority,
        assigneeIds,
        labelIds,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issues', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      onCreated();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  function toggle(list: string[], id: string, setList: (next: string[]) => void) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        createIssue.mutate();
      }}
    >
      <label className="block">
        <span className="label">Title</span>
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} />
      </label>
      <label className="block">
        <span className="label">Description</span>
        <textarea className="field min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Status</span>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as IssueStatus)}>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Priority</span>
          <select className="field" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {PRIORITY_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Due date</span>
          <input className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend className="label">Assignees</legend>
        <div className="flex flex-wrap gap-2">
          {(members.data ?? []).map((member) => (
            <label key={member.user.id} className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1 text-sm">
              <input
                type="checkbox"
                checked={assigneeIds.includes(member.user.id)}
                onChange={() => toggle(assigneeIds, member.user.id, setAssigneeIds)}
              />
              {member.user.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Labels</legend>
        <div className="flex flex-wrap gap-2">
          {(labels.data ?? []).map((label) => (
            <label key={label.id} className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1 text-sm">
              <input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => toggle(labelIds, label.id, setLabelIds)} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: label.color }} />
              {label.name}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="field max-w-40"
            placeholder="New label"
            value={labelName}
            onChange={(event) => setLabelName(event.target.value)}
            aria-label="New label name"
          />
          <div className="flex gap-1" role="group" aria-label="Label color">
            {LABEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`h-5 w-5 rounded-full ${labelColor === color ? 'ring-2 ring-brand ring-offset-2' : ''}`}
                style={{ background: color }}
                aria-label={color}
                onClick={() => setLabelColor(color)}
              />
            ))}
          </div>
          <button className="btn-ghost" type="button" disabled={!labelName.trim() || createLabel.isPending} onClick={() => createLabel.mutate()}>
            Add label
          </button>
        </div>
      </fieldset>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn-primary" type="submit" disabled={createIssue.isPending || title.trim().length < 3}>
        {createIssue.isPending ? 'Creating…' : 'Create issue'}
      </button>
    </form>
  );
}
