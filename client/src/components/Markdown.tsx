import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { canonicalIssueKey, issueKeysIn, parseMarkdown, type Inline } from '../lib/markdown';

export interface IssueLink {
  id: string;
  title: string;
}

export function useIssueLinks(workspaceId: string, texts: string[]) {
  const keys = [...new Set(texts.flatMap((text) => issueKeysIn(text)))].sort();
  const query = useQuery({
    queryKey: ['issue-links', workspaceId, keys.join('|')],
    queryFn: () => api.resolveIssueKeys(workspaceId, keys),
    enabled: Boolean(workspaceId) && keys.length > 0,
  });
  const links: Record<string, IssueLink> = {};
  for (const issue of query.data ?? []) links[issue.key] = { id: issue.id, title: issue.title };
  return links;
}

function InlineText({ nodes, workspaceId, links }: { nodes: Inline[]; workspaceId?: string; links?: Record<string, IssueLink> }) {
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
    if (node.type === 'issue') {
      const found = links?.[canonicalIssueKey(node.text)];
      if (!found || !workspaceId) return <span key={index}>{node.text}</span>;
      return (
        <Link key={index} to={`/w/${workspaceId}/issues/${found.id}`} title={found.title} className="font-mono text-brand underline">
          {node.text}
        </Link>
      );
    }
    if (node.type === 'bold') {
      return (
        <strong key={index} className="font-semibold">
          <InlineText nodes={node.children} workspaceId={workspaceId} links={links} />
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

export function MarkdownText({
  body,
  names,
  className = 'mt-3 space-y-2 text-sm leading-6',
  workspaceId,
  links,
}: {
  body: string;
  names: string[];
  className?: string;
  workspaceId?: string;
  links?: Record<string, IssueLink>;
}) {
  const blocks = parseMarkdown(body, names);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index} className="whitespace-pre-wrap">
            <InlineText nodes={block.children} workspaceId={workspaceId} links={links} />
          </p>
        ) : block.ordered ? (
          <ol key={index} className="list-decimal space-y-1 pl-5">
            {items(block.items, workspaceId, links)}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {items(block.items, workspaceId, links)}
          </ul>
        ),
      )}
    </div>
  );
}

export function MarkdownPane({
  value,
  names,
  children,
  workspaceId,
  links,
}: {
  value: string;
  names: string[];
  children: ReactNode;
  workspaceId?: string;
  links?: Record<string, IssueLink>;
}) {
  const previewLinks = useIssueLinks(workspaceId ?? '', [value]);
  const merged = { ...links, ...previewLinks };
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
            <MarkdownText body={value} names={names} className="space-y-2 text-sm leading-6" workspaceId={workspaceId} links={merged} />
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

function items(rows: Inline[][], workspaceId?: string, links?: Record<string, IssueLink>): ReactNode {
  return rows.map((row, index) => (
    <li key={index}>
      <InlineText nodes={row} workspaceId={workspaceId} links={links} />
    </li>
  ));
}
