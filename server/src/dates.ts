export function utcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dayKey(date: Date) {
  return utcDayStart(date).toISOString().slice(0, 10);
}

export function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (dayKey(date) !== value) return null;
  return date;
}

export function isOverdue(dueDate: Date | null | undefined, status: string, now = new Date()) {
  if (!dueDate || status === 'done') return false;
  return dueDate.getTime() < utcDayStart(now).getTime();
}

export function dueAlertKind(dueDate: Date, now = new Date()) {
  const start = utcDayStart(now).getTime();
  const due = dueDate.getTime();
  if (due < start) return 'overdue' as const;
  if (due < start + 24 * 60 * 60 * 1000) return 'today' as const;
  return null;
}
