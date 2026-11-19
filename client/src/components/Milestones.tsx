import { useEffect, useState } from 'react';
import type { Milestone } from '../lib/types';
import { Modal } from './ui';

function formatDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function Milestones({
  milestones,
  activeId,
  pending,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  canCreate = true,
}: {
  milestones: Milestone[];
  activeId: string;
  pending: boolean;
  onSelect: (id: string) => void;
  onCreate: (input: { name: string; targetDate: string | null }) => void;
  onUpdate?: (input: { id: string; name: string; targetDate: string | null }) => void;
  onDelete: (id: string) => void;
  canCreate?: boolean;
}) {
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [editing, setEditing] = useState<Milestone | null>(null);
  return (
    <section className="panel px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Milestones</h2>
          <p className="mt-1 text-[12px] text-muted">A target the issues in this project are heading toward.</p>
        </div>
        {canCreate ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate({ name: name.trim(), targetDate: targetDate || null });
              setName('');
              setTargetDate('');
            }}
          >
            <input className="field w-40" aria-label="Milestone name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
            <input className="field w-auto" aria-label="Milestone target date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            <button className="btn-primary" type="submit" disabled={pending || name.trim().length < 2}>
              Add
            </button>
          </form>
        ) : null}
      </div>
      {milestones.length ? (
        <ul className="mt-3 space-y-2">
          {milestones.map((milestone) => {
            const progress = milestone.total > 0 ? milestone.done / milestone.total : 0;
            const active = activeId === milestone.id;
            return (
              <li key={milestone.id} className="flex flex-wrap items-center gap-3">
                <button type="button" className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left ${active ? 'bg-brand-soft' : 'hover:bg-slate-50'}`} onClick={() => onSelect(active ? '' : milestone.id)}>
                  <span className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="font-medium text-ink">
                      {milestone.name}
                      {milestone.targetDate ? <span className="ml-2 font-normal text-muted">{formatDay(milestone.targetDate)}</span> : null}
                    </span>
                    <span className="tabular-nums text-[12px] text-muted">
                      {milestone.done} of {milestone.total}
                      <span className="text-faint"> · </span>
                      {milestone.pointsDone} of {milestone.points} points
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
                  </span>
                </button>
                {canCreate ? (
                  <button className="btn-quiet" type="button" aria-label={`Edit ${milestone.name}`} onClick={() => setEditing(milestone)}>
                    Edit
                  </button>
                ) : null}
                {milestone.canDelete ? (
                  <button className="btn-quiet" type="button" onClick={() => onDelete(milestone.id)}>
                    Delete
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-muted">No milestones yet.</p>
      )}
      {editing ? (
        <EditMilestoneModal
          milestone={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            onUpdate?.(input);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function EditMilestoneModal({
  milestone,
  pending,
  onClose,
  onSave,
}: {
  milestone: Milestone;
  pending: boolean;
  onClose: () => void;
  onSave: (input: { id: string; name: string; targetDate: string | null }) => void;
}) {
  const [name, setName] = useState(milestone.name);
  const [targetDate, setTargetDate] = useState(milestone.targetDate ?? '');
  useEffect(() => {
    setName(milestone.name);
    setTargetDate(milestone.targetDate ?? '');
  }, [milestone.id, milestone.name, milestone.targetDate]);
  const ready = name.trim().length >= 2;
  return (
    <Modal open title={`Edit ${milestone.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          onSave({ id: milestone.id, name: name.trim(), targetDate: targetDate || null });
        }}
      >
        <label className="block text-sm">
          <span className="text-muted">Name</span>
          <input className="field mt-1" aria-label="Edited milestone name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Target date</span>
          <input className="field mt-1" aria-label="Edited milestone date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
        <p className="text-[12px] text-muted">Issues stay on this milestone. Leave the date empty to take it off the calendar.</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" type="submit" disabled={pending || !ready}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
