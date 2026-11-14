import { useState, type ReactNode } from 'react';
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

export function MarkdownText({ body, names, className = 'mt-3 space-y-2 text-sm leading-6' }: { body: string; names: string[]; className?: string }) {
  const blocks = parseMarkdown(body, names);
  if (!blocks.length) return null;
  return (
    <div className={className}>
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

export function MarkdownPane({ value, names, children }: { value: string; names: string[]; children: ReactNode }) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Description formatting">
        <button type="button" role="tab" aria-selected={!preview} className={tabClass(!preview)} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={preview} className={tabClass(preview)} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      {preview ? (
        <div className="min-h-24 rounded-lg border border-line bg-white px-3 py-2">
          {value.trim() ? (
            <MarkdownText body={value} names={names} className="space-y-2 text-sm leading-6" />
          ) : (
            <p className="text-sm text-muted">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function tabClass(active: boolean) {
  return `h-7 rounded-full px-2.5 text-[12px] font-medium ${active ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'}`;
}

function items(rows: Inline[][]): ReactNode {
  return rows.map((row, index) => (
    <li key={index}>
      <InlineText nodes={row} />
    </li>
  ));
}
