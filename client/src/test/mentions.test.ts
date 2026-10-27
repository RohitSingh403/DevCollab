import { describe, expect, it } from 'vitest';
import { commentSegments, insertMention, matchingMembers, mentionAtCursor } from '../lib/mentions';

describe('mentions', () => {
  it('finds the @ query at the caret and ignores email addresses', () => {
    expect(mentionAtCursor('see @Pri', 8)).toEqual({ start: 4, query: 'Pri' });
    expect(mentionAtCursor('email a@b.com', 12)).toBeNull();
    expect(mentionAtCursor('done @Priya Nair thanks', 4)).toBeNull();
  });

  it('inserts the full name and highlights a real teammate', () => {
    const next = insertMention('see @Pri', 4, 8, 'Priya Nair');
    expect(next).toEqual({ value: 'see @Priya Nair ', caret: 16 });
    const parts = commentSegments('Ask @Priya Nair, not @Nobody.', ['Priya Nair', 'Ann']);
    expect(parts.filter((part) => part.mention).map((part) => part.text)).toEqual(['@Priya Nair']);
  });

  it('prefers names that start with the query', () => {
    const matches = matchingMembers([{ name: 'Jonah Lee' }, { name: 'Priya Nair' }, { name: 'Apriya Shah' }], 'pri');
    expect(matches.map((member) => member.name)).toEqual(['Priya Nair', 'Apriya Shah']);
  });
});
