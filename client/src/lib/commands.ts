export interface CommandItem {
  id: string;
  group: 'Go to' | 'Create' | 'Projects' | 'Issues' | 'Recent';
  label: string;
  hint: string;
  to: string;
}

export function filterCommands(items: CommandItem[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items.filter((item) => item.group !== 'Issues');
  return items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(q));
}
