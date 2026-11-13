import { describe, expect, it } from 'vitest';
import { checklistProgress } from '../lib/checklist';

describe('checklist progress', () => {
  it('counts finished steps', () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3 });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 });
    expect(checklistProgress(undefined)).toEqual({ done: 0, total: 0 });
  });
});
