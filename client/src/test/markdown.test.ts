import { describe, expect, it } from 'vitest';
import { parseMarkdown, safeHref } from '../lib/markdown';

describe('comment markdown', () => {
  it('renders bold, lists, and https links', () => {
    const blocks = parseMarkdown('Force **Secure** now.\n\n- HttpOnly\n- SameSite\n\n1. Draft\n2. Ship\n\nSee [the guide](https://example.com/cookies).');
    expect(blocks[0]).toEqual({ type: 'paragraph', children: [{ type: 'text', text: 'Force ' }, { type: 'bold', children: [{ type: 'text', text: 'Secure' }] }, { type: 'text', text: ' now.' }] });
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false, items: [[{ type: 'text', text: 'HttpOnly' }], [{ type: 'text', text: 'SameSite' }]] });
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: true });
    expect(blocks[3]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'See ' },
        { type: 'link', href: 'https://example.com/cookies', children: [{ type: 'text', text: 'the guide' }] },
        { type: 'text', text: '.' },
      ],
    });
  });

  it('keeps mentions inside bold text', () => {
    const blocks = parseMarkdown('**Ask @Priya Nair** please', ['Priya Nair']);
    expect(blocks[0]).toMatchObject({
      children: [
        { type: 'bold', children: [{ type: 'text', text: 'Ask ' }, { type: 'mention', text: '@Priya Nair' }] },
        { type: 'text', text: ' please' },
      ],
    });
  });

  it('leaves html and unsafe links as text', () => {
    const blocks = parseMarkdown('<script>alert(1)</script> [bad](javascript:alert(1)) <b>nope</b>');
    const text = JSON.stringify(blocks);
    expect(text).toContain('<script>alert(1)</script>');
    expect(text).toContain('[bad](javascript:alert(1))');
    expect(text).not.toContain('"type":"link"');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('https://example.com')).toBe('https://example.com/');
  });
});
