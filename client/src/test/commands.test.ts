import { describe, expect, it } from 'vitest';
import { filterCommands, type CommandItem } from '../lib/commands';

const items: CommandItem[] = [
  { id: 'work', group: 'Go to', label: 'My work', hint: 'Assigned to you', to: '/my-work' },
  { id: 'inbox', group: 'Go to', label: 'Notifications', hint: 'Inbox', to: '/notifications' },
  { id: 'api', group: 'Projects', label: 'API Platform', hint: 'API', to: '/projects/api' },
  { id: 'issue', group: 'Issues', label: 'Replace the session store', hint: 'API-1 · API Platform', to: '/issues/1' },
];

describe('command menu matching', () => {
  it('shows pages and projects before a search', () => {
    expect(filterCommands(items, '').map((item) => item.id)).toEqual(['work', 'inbox', 'api']);
  });

  it('matches a page, a project key, or an issue hint', () => {
    expect(filterCommands(items, 'my').map((item) => item.label)).toEqual(['My work']);
    expect(filterCommands(items, 'api').map((item) => item.id)).toEqual(['api', 'issue']);
    expect(filterCommands(items, 'API-1').map((item) => item.id)).toEqual(['issue']);
    expect(filterCommands(items, 'inbox').map((item) => item.label)).toEqual(['Notifications']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterCommands(items, 'zzz')).toEqual([]);
  });
});
