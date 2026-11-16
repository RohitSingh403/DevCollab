import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MarkdownPane } from './Markdown';
import { api, errorMessage } from '../lib/api';
import { ESTIMATES, LABEL_COLORS, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type IssueStatus, type Priority } from '../lib/types';

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
  const templates = useQuery({ queryKey: ['templates', projectId], queryFn: () => api.templates(projectId) });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<IssueStatus>('todo');
  const [priority, setPriority] = useState<Priority>('medium');
  const [estimate, setEstimate] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [step, setStep] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
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
        estimate: estimate === '' ? null : estimate,
        checklist: checklist.map((item) => item.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issues', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      onCreated();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  const saveTemplate = useMutation({
    mutationFn: () =>
      api.createTemplate(projectId, {
        name: templateName.trim(),
        title: title.trim(),
        description,
        status,
        priority,
        estimate: estimate === '' ? null : estimate,
        labelIds,
        checklist: checklist.map((item) => item.trim()).filter(Boolean),
      }),
    onSuccess: async (template) => {
      setTemplateName('');
      setTemplateId(template.id);
      await queryClient.invalidateQueries({ queryKey: ['templates', projectId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  const removeTemplate = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(projectId, id),
    onSuccess: async () => {
      setTemplateId('');
      await queryClient.invalidateQueries({ queryKey: ['templates', projectId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = (templates.data ?? []).find((item) => item.id === id);
    if (!template) return;
    if (template.title) setTitle(template.title);
    setDescription(template.description);
    setStatus(template.status);
    setPriority(template.priority);
    setEstimate(template.estimate ?? '');
    setLabelIds(template.labels.map((label) => label.id));
    setChecklist(template.checklist);
  }

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
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-48 flex-1">
          <span className="label">Template</span>
          <select className="field" aria-label="Template" value={templateId} onChange={(event) => applyTemplate(event.target.value)}>
            <option value="">Blank issue</option>
            {(templates.data ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        {templateId && (templates.data ?? []).find((template) => template.id === templateId)?.canDelete ? (
          <button className="btn-ghost" type="button" disabled={removeTemplate.isPending} onClick={() => removeTemplate.mutate(templateId)}>
            Delete template
          </button>
        ) : null}
      </div>
      <label className="block">
        <span className="label">Title</span>
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} />
      </label>
      <div>
        <span className="label">Description</span>
        <MarkdownPane value={description} names={(members.data ?? []).map((member) => member.user.name)}>
          <textarea
            className="field min-h-24"
            aria-label="Description"
            placeholder="Add context. Bold, lists, and links work."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </MarkdownPane>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
          <span className="label">Estimate</span>
          <select
            className="field"
            aria-label="Estimate"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value ? Number(event.target.value) : '')}
          >
            <option value="">None</option>
            {ESTIMATES.map((item) => (
              <option key={item} value={item}>
                {item}
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
      <fieldset>
        <legend className="label">Checklist</legend>
        {checklist.length ? (
          <ul className="mb-2 space-y-1">
            {checklist.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{item}</span>
                <button
                  className="btn-quiet px-2 text-[12px]"
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => setChecklist((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-[13px] text-muted">Steps are copied onto the new issue, unchecked.</p>
        )}
        <div className="flex gap-2">
          <input
            className="field"
            aria-label="Checklist step"
            placeholder="Add a step"
            value={step}
            maxLength={140}
            onChange={(event) => setStep(event.target.value)}
          />
          <button
            className="btn-ghost"
            type="button"
            disabled={!step.trim() || checklist.length >= 12}
            onClick={() => {
              setChecklist((current) => [...current, step.trim()]);
              setStep('');
            }}
          >
            Add
          </button>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-40 flex-1">
          <span className="label">Save these fields as a template</span>
          <input
            className="field"
            aria-label="Template name"
            placeholder="Bug"
            value={templateName}
            maxLength={40}
            onChange={(event) => setTemplateName(event.target.value)}
          />
        </label>
        <button
          className="btn-ghost"
          type="button"
          disabled={templateName.trim().length < 2 || saveTemplate.isPending}
          onClick={() => {
            setError('');
            saveTemplate.mutate();
          }}
        >
          {saveTemplate.isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>
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
