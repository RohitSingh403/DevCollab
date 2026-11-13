import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { checklistProgress } from '../lib/checklist';
import type { Issue } from '../lib/types';
import { useUiStore } from '../stores/uiStore';

export function Checklist({ issue }: { issue: Issue }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [text, setText] = useState('');
  const items = issue.checklist ?? [];
  const progress = checklistProgress(items);

  const apply = (next: Issue) => {
    queryClient.setQueryData(['issue', issue.id], next);
    void queryClient.invalidateQueries({ queryKey: ['issues'] });
    void queryClient.invalidateQueries({ queryKey: ['my-work'] });
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
  };

  const add = useMutation({
    mutationFn: (value: string) => api.addChecklistItem(issue.id, value),
    onSuccess: (next) => {
      setText('');
      apply(next);
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ itemId, ...input }: { itemId: string; text?: string; done?: boolean }) => api.updateChecklistItem(issue.id, itemId, input),
    onSuccess: apply,
    onError: (error) => pushToast(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.deleteChecklistItem(issue.id, itemId),
    onSuccess: apply,
    onError: (error) => pushToast(errorMessage(error)),
  });

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Checklist</h2>
        {progress.total ? (
          <p className="text-[12px] tabular-nums text-muted">
            {progress.done} of {progress.total}
          </p>
        ) : null}
      </div>
      {progress.total ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full bg-ink" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Break this issue into steps you can check off.</p>
      )}
      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-1"
              checked={item.done}
              aria-label={item.done ? `Reopen ${item.text}` : `Check ${item.text}`}
              onChange={() => update.mutate({ itemId: item.id, done: !item.done })}
            />
            <StepText
              text={item.text}
              done={item.done}
              onSave={(next) => {
                if (next !== item.text) update.mutate({ itemId: item.id, text: next });
              }}
            />
            <button
              type="button"
              className="btn-ghost shrink-0 px-2 py-1 text-[12px]"
              aria-label={`Remove ${item.text}`}
              onClick={() => remove.mutate(item.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = text.trim();
          if (value) add.mutate(value);
        }}
      >
        <input
          className="field"
          aria-label="New checklist step"
          placeholder="Add a step"
          maxLength={140}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={!text.trim() || add.isPending}>
          Add
        </button>
      </form>
    </section>
  );
}

function StepText({ text, done, onSave }: { text: string; done: boolean; onSave: (text: string) => void }) {
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);
  return (
    <input
      className={`min-w-0 flex-1 bg-transparent text-[14px] outline-none ${done ? 'text-faint line-through' : 'text-ink'}`}
      aria-label={`Step: ${text}`}
      value={value}
      maxLength={140}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (!next) {
          setValue(text);
          return;
        }
        setValue(next);
        onSave(next);
      }}
    />
  );
}
