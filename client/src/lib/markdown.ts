import { readMention } from './mentions';

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'break' }
  | { type: 'mention'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

export function safeHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseInlines(input: string, names: string[], breaks: boolean, allowLink = true, allowBold = true): Inline[] {
  const nodes: Inline[] = [];
  let text = '';
  let index = 0;
  const pushText = () => {
    if (!text) return;
    nodes.push({ type: 'text', text });
    text = '';
  };

  while (index < input.length) {
    if (breaks && input[index] === '\n') {
      pushText();
      nodes.push({ type: 'break' });
      index += 1;
      continue;
    }

    if (allowBold && (input.startsWith('**', index) || input.startsWith('__', index))) {
      const marker = input.slice(index, index + 2);
      const close = input.indexOf(marker, index + 2);
      if (close !== -1) {
        pushText();
        nodes.push({ type: 'bold', children: parseInlines(input.slice(index + 2, close), names, false, allowLink, false) });
        index = close + 2;
        continue;
      }
    }

    if (allowLink && input[index] === '[') {
      const labelEnd = input.indexOf(']', index + 1);
      if (labelEnd !== -1 && input[labelEnd + 1] === '(') {
        const hrefEnd = input.indexOf(')', labelEnd + 2);
        if (hrefEnd !== -1) {
          const href = safeHref(input.slice(labelEnd + 2, hrefEnd));
          if (href) {
            pushText();
            nodes.push({
              type: 'link',
              href,
              children: parseInlines(input.slice(index + 1, labelEnd), names, false, false, allowBold),
            });
            index = hrefEnd + 1;
            continue;
          }
        }
      }
    }

    const mention = readMention(input, index, names);
    if (mention) {
      pushText();
      nodes.push({ type: 'mention', text: input.slice(index, index + 1 + mention.length) });
      index += 1 + mention.length;
      continue;
    }

    text += input[index];
    index += 1;
  }
  pushText();
  return nodes;
}

export function parseMarkdown(body: string, names: string[] = []): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', children: parseInlines(paragraph.join('\n'), names, true) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      type: 'list',
      ordered: list.ordered,
      items: list.items.map((item) => parseInlines(item, names, false)),
    });
    list = null;
  };

  for (const line of lines) {
    const item = /^(?:\s*)(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /^\s*\d+\./.test(line);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item[1] ?? '');
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
