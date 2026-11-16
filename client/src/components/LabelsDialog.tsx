import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { LABEL_COLORS, type Label } from '../lib/types';
import { Modal } from './ui';

export function LabelsDialog({ workspaceId, open, canDelete, onClose }: { workspaceId: string; open: boolean; canDelete: boolean; onClose: () => void }) {
  const labels = useQuery({ queryKey: ['labels', workspaceId], queryFn: () => api.labels(workspaceId), enabled: open });
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setName('');
    setColor(LABEL_COLORS[0]);
    setError('');
  }, [open]);

  const create = useMutation({
    mutationFn: () => api.createLabel(workspaceId, { name: name.trim(), color }),
    onSuccess: async () => {
      setName('');
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['labels', workspaceId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  return (
    <Modal open={open} title="Labels" onClose={onClose}>
      <p className="text-[13px] text-muted">Rename or recolor a label. Issues and templates keep it.</p>
      <ul className="mt-4 space-y-3">
        {(labels.data ?? []).map((label) => (
          <LabelRow key={label.id} workspaceId={workspaceId} label={label} canDelete={canDelete} onError={setError} />
        ))}
      </ul>
      {!labels.data?.length ? <p className="mt-4 text-[13px] text-muted">No labels yet.</p> : null}
      <form
        className="mt-4 space-y-3 border-t border-line pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          if (name.trim()) create.mutate();
        }}
      >
        <span className="label">New label</span>
        <div className="flex flex-wrap items-center gap-2">
          <input className="field max-w-48" aria-label="New label name" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
          <ColorChoices value={color} onChange={setColor} />
          <button className="btn-ghost" type="submit" disabled={!name.trim() || create.isPending}>
            Add label
          </button>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
    </Modal>
  );
}

function LabelRow({
  workspaceId,
  label,
  canDelete,
  onError,
}: {
  workspaceId: string;
  label: Label;
  canDelete: boolean;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  useEffect(() => {
    setName(label.name);
    setColor(label.color);
  }, [label.name, label.color]);
  const dirty = name.trim() !== label.name || color !== label.color;
  const save = useMutation({
    mutationFn: () => api.updateLabel(workspaceId, label.id, { name: name.trim(), color }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['labels', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['issues'] });
      await queryClient.invalidateQueries({ queryKey: ['issue'] });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (reason) => onError(errorMessage(reason)),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteLabel(workspaceId, label.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['labels', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['issues'] });
      await queryClient.invalidateQueries({ queryKey: ['issue'] });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (reason) => onError(errorMessage(reason)),
  });
  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex items-center gap-2">
        <input className="field" aria-label={`Name for ${label.name}`} value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
        <button className="btn-ghost shrink-0" type="button" disabled={!dirty || !name.trim() || save.isPending} onClick={() => save.mutate()}>
          Save
        </button>
        {canDelete ? (
          <button className="btn-quiet shrink-0 px-2 text-[12px]" type="button" aria-label={`Delete ${label.name}`} disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </button>
        ) : null}
      </div>
      <div className="mt-2">
        <ColorChoices value={color} onChange={setColor} label={label.name} />
      </div>
    </li>
  );
}

function ColorChoices({ value, onChange, label = 'new label' }: { value: string; onChange: (color: string) => void; label?: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label={`Color for ${label}`}>
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`h-5 w-5 rounded-full ${value.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-brand ring-offset-2' : ''}`}
          style={{ background: color }}
          aria-label={color}
          aria-pressed={value.toLowerCase() === color.toLowerCase()}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
