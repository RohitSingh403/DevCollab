import { useState } from 'react';
import type { Cycle } from '../lib/types';
import { Modal } from './ui';

function formatDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function dayFromNow(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function CycleBar({
  cycle,
  filtered,
  pending,
  onToggle,
  onStart,
}: {
  cycle: Cycle | null;
  filtered: boolean;
  pending: boolean;
  onToggle: () => void;
  onStart: (input: { name: string; startsAt: string; endsAt: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = cycle?.done ?? 0;
  const total = cycle?.total ?? 0;
  const points = cycle?.points ?? 0;
  const pointsDone = cycle?.pointsDone ?? 0;
  const progress = points > 0 ? pointsDone / points : total > 0 ? done / total : 0;
  return (
    <section className="panel flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        {cycle ? (
          <>
            <p className="text-[13px] font-semibold text-ink">
              {cycle.name}
              <span className="ml-2 font-normal text-muted">
                {formatDay(cycle.startsAt)} – {formatDay(cycle.endsAt)}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {done} of {total} done
              {points > 0 ? ` · ${pointsDone} of ${points} points` : ''}
            </p>
            <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-ink">No active cycle</p>
            <p className="mt-1 text-[12px] text-muted">Start one to group the issues the team is working on now.</p>
          </>
        )}
      </div>
      <div className="flex gap-2">
        {cycle ? (
          <button className={filtered ? 'btn-primary' : 'btn-ghost'} type="button" onClick={onToggle}>
            {filtered ? 'Showing this cycle' : 'This cycle'}
          </button>
        ) : null}
        <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
          {cycle ? 'Start the next cycle' : 'Start cycle'}
        </button>
      </div>
      <StartCycleModal
        open={open}
        pending={pending}
        replacing={Boolean(cycle)}
        onClose={() => setOpen(false)}
        onStart={(input) => {
          onStart(input);
          setOpen(false);
        }}
      />
    </section>
  );
}

function StartCycleModal({
  open,
  pending,
  replacing,
  onClose,
  onStart,
}: {
  open: boolean;
  pending: boolean;
  replacing: boolean;
  onClose: () => void;
  onStart: (input: { name: string; startsAt: string; endsAt: string }) => void;
}) {
  const [name, setName] = useState('');
  const [endsAt, setEndsAt] = useState(dayFromNow(13));
  return (
    <Modal
      open={open}
      title={replacing ? 'Start the next cycle' : 'Start a cycle'}
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length < 2) return;
          onStart({ name: name.trim(), startsAt: dayFromNow(0), endsAt });
          setName('');
        }}
      >
        <label className="block text-sm">
          <span className="text-muted">Name</span>
          <input className="field mt-1" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Ends</span>
          <input className="field mt-1" type="date" value={endsAt} min={dayFromNow(0)} onChange={(event) => setEndsAt(event.target.value)} required />
        </label>
        {replacing ? <p className="text-[12px] text-muted">Open issues in the current cycle move into this one. Finished issues stay behind.</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" type="submit" disabled={pending || name.trim().length < 2}>
            Start
          </button>
        </div>
      </form>
    </Modal>
  );
}
