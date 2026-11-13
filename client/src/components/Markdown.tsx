import type { ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../lib/markdown';

function InlineText({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, index) => {
    if (node.type === 'text') return <span key={index}>{node.text}</span>;
    if (node.type === 'break') return <br key={index} />;
    if (node.type === 'mention') {
      return (
        <span key={index} className="rounded bg-brand-soft px-0.5 font-medium text-brand">
          {node.text}
        </span>
      );
    }
    if (node.type === 'bold') {
      return (
        <strong key={index} className="font-semibold">
          <InlineText nodes={node.children} />
        </strong>
      );
    }
    return (
      <a key={index} href={node.href} target="_blank" rel="noreferrer noopener" className="text-brand underline">
        <InlineText nodes={node.children} />
      </a>
    );
  });
}

export function MarkdownText({ body, names }: { body: string; names: string[] }) {
  const blocks = parseMarkdown(body, names);
  if (!blocks.length) return null;
  return (
    <div className="mt-3 space-y-2 text-sm leading-6">
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index} className="whitespace-pre-wrap">
            <InlineText nodes={block.children} />
          </p>
        ) : block.ordered ? (
          <ol key={index} className="list-decimal space-y-1 pl-5">
            {items(block.items)}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {items(block.items)}
          </ul>
        ),
      )}
    </div>
  );
}

function items(rows: Inline[][]): ReactNode {
  return rows.map((row, index) => (
    <li key={index}>
      <InlineText nodes={row} />
    </li>
  ));
}
