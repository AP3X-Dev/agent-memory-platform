// packages/core/src/__tests__/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderToMarkdown, parseFromMarkdown, diffEntries } from '../markdown.js';
import type { SemanticNode, EpisodicNode } from '../types.js';
import type { DiffResult, MarkdownEntry } from '../markdown.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSemanticNode(overrides: Partial<SemanticNode> = {}): SemanticNode {
  return {
    id: 'sem-1',
    content: 'Client X prefers formal tone',
    confidence: 0.9,
    signal_count: 5,
    decay_class: 'stable',
    tags: ['brand-voice', 'client-x'],
    created_at: '2026-03-18T00:00:00Z',
    updated_at: '2026-03-18T12:00:00Z',
    ...overrides,
  };
}

function makeEpisodicNode(overrides: Partial<EpisodicNode> = {}): EpisodicNode {
  return {
    id: 'ep-1',
    session_id: 'sess-abc',
    agent_id: 'agent-1',
    task: 'write-blog-post',
    content: 'Generated a draft for the client',
    outcome: 'approved',
    created_at: '2026-03-18T08:00:00Z',
    ...overrides,
  };
}

// ─── renderToMarkdown ─────────────────────────────────────────────────────────

describe('renderToMarkdown', () => {
  it('renders correct frontmatter and content for a SemanticNode', () => {
    const node = makeSemanticNode();
    const md = renderToMarkdown(node);

    expect(md).toContain('---');
    expect(md).toContain('id: sem-1');
    expect(md).toContain('confidence: 0.9');
    expect(md).toContain('signal_count: 5');
    expect(md).toContain('decay_class: stable');
    expect(md).toContain('  - brand-voice');
    expect(md).toContain('  - client-x');
    expect(md).toContain('created_at: "2026-03-18T00:00:00Z"');
    expect(md).toContain('updated_at: "2026-03-18T12:00:00Z"');
    expect(md).toContain('Client X prefers formal tone');
  });

  it('renders frontmatter block structure with leading and closing ---', () => {
    const node = makeSemanticNode();
    const md = renderToMarkdown(node);
    const lines = md.split('\n');

    expect(lines[0]).toBe('---');
    // Find closing --- after frontmatter fields
    const closingIdx = lines.indexOf('---', 1);
    expect(closingIdx).toBeGreaterThan(1);
    // Content comes after the closing ---
    const contentLines = lines.slice(closingIdx + 1).join('\n').trimStart();
    expect(contentLines).toContain('Client X prefers formal tone');
  });

  it('renders tags: [] when SemanticNode has no tags', () => {
    const node = makeSemanticNode({ tags: [] });
    const md = renderToMarkdown(node);
    expect(md).toContain('tags: []');
  });

  it('renders correct frontmatter for an EpisodicNode', () => {
    const node = makeEpisodicNode();
    const md = renderToMarkdown(node);

    expect(md).toContain('id: ep-1');
    expect(md).toContain('session_id: sess-abc');
    expect(md).toContain('agent_id: agent-1');
    expect(md).toContain('task: write-blog-post');
    expect(md).toContain('outcome: approved');
    expect(md).toContain('created_at: "2026-03-18T08:00:00Z"');
    expect(md).toContain('Generated a draft for the client');
  });

  it('omits optional EpisodicNode fields when absent', () => {
    const node = makeEpisodicNode({ outcome: undefined, ttl: undefined });
    const md = renderToMarkdown(node);
    expect(md).not.toContain('outcome:');
    expect(md).not.toContain('ttl:');
  });

  it('includes ttl when present on EpisodicNode', () => {
    const node = makeEpisodicNode({ ttl: 86400 });
    const md = renderToMarkdown(node);
    expect(md).toContain('ttl: 86400');
  });
});

// ─── parseFromMarkdown ────────────────────────────────────────────────────────

describe('parseFromMarkdown', () => {
  it('parses frontmatter back into a matching SemanticNode object', () => {
    const md = [
      '---',
      'id: sem-1',
      'confidence: 0.9',
      'signal_count: 5',
      'decay_class: stable',
      'tags:',
      '  - brand-voice',
      '  - client-x',
      'created_at: "2026-03-18T00:00:00Z"',
      'updated_at: "2026-03-18T12:00:00Z"',
      '---',
      '',
      'Client X prefers formal tone',
    ].join('\n');

    const node = parseFromMarkdown(md);

    expect(node.id).toBe('sem-1');
    expect(node.confidence).toBe(0.9);
    expect(node.signal_count).toBe(5);
    expect(node.decay_class).toBe('stable');
    expect(node.tags).toEqual(['brand-voice', 'client-x']);
    expect(node.created_at).toBe('2026-03-18T00:00:00Z');
    expect(node.updated_at).toBe('2026-03-18T12:00:00Z');
    expect(node.content).toBe('Client X prefers formal tone');
  });

  it('handles an empty tags array', () => {
    const md = [
      '---',
      'id: sem-2',
      'confidence: 0.5',
      'signal_count: 1',
      'decay_class: volatile',
      'tags: []',
      'created_at: "2026-01-01T00:00:00Z"',
      'updated_at: "2026-01-01T00:00:00Z"',
      '---',
      '',
      'Some content here',
    ].join('\n');

    const node = parseFromMarkdown(md);
    expect(node.tags).toEqual([]);
    expect(node.content).toBe('Some content here');
  });

  it('parses confidence and signal_count as numbers', () => {
    const md = [
      '---',
      'id: sem-3',
      'confidence: 0.75',
      'signal_count: 10',
      'decay_class: permanent',
      'tags: []',
      'created_at: "2026-01-01T00:00:00Z"',
      'updated_at: "2026-01-01T00:00:00Z"',
      '---',
      '',
      'Content',
    ].join('\n');

    const node = parseFromMarkdown(md);
    expect(typeof node.confidence).toBe('number');
    expect(typeof node.signal_count).toBe('number');
    expect(node.confidence).toBe(0.75);
    expect(node.signal_count).toBe(10);
  });
});

// ─── diffEntries ──────────────────────────────────────────────────────────────

describe('diffEntries', () => {
  it('detects added entries (in file, not in graph)', () => {
    const fileEntries: MarkdownEntry[] = [
      { id: 'sem-1', contentHash: 'hash-a' },
      { id: 'sem-new', contentHash: 'hash-new' },
    ];
    const graphEntries: MarkdownEntry[] = [{ id: 'sem-1', contentHash: 'hash-a' }];

    const result: DiffResult = diffEntries(fileEntries, graphEntries);
    expect(result.added).toEqual(['sem-new']);
  });

  it('detects modified entries (in both, hashes differ)', () => {
    const fileEntries: MarkdownEntry[] = [{ id: 'sem-1', contentHash: 'hash-new' }];
    const graphEntries: MarkdownEntry[] = [{ id: 'sem-1', contentHash: 'hash-old' }];

    const result = diffEntries(fileEntries, graphEntries);
    expect(result.modified).toEqual(['sem-1']);
  });

  it('detects deleted entries (in graph, not in file)', () => {
    const fileEntries: MarkdownEntry[] = [{ id: 'sem-1', contentHash: 'hash-a' }];
    const graphEntries: MarkdownEntry[] = [
      { id: 'sem-1', contentHash: 'hash-a' },
      { id: 'sem-old', contentHash: 'hash-old' },
    ];

    const result = diffEntries(fileEntries, graphEntries);
    expect(result.deleted).toEqual(['sem-old']);
  });

  it('detects unchanged entries (in both with matching hashes)', () => {
    const fileEntries: MarkdownEntry[] = [{ id: 'sem-1', contentHash: 'hash-a' }];
    const graphEntries: MarkdownEntry[] = [{ id: 'sem-1', contentHash: 'hash-a' }];

    const result = diffEntries(fileEntries, graphEntries);
    expect(result.unchanged).toEqual(['sem-1']);
  });

  it('handles all four categories simultaneously', () => {
    const fileEntries: MarkdownEntry[] = [
      { id: 'added-1', contentHash: 'h1' },
      { id: 'modified-1', contentHash: 'h-new' },
      { id: 'unchanged-1', contentHash: 'h-same' },
    ];
    const graphEntries: MarkdownEntry[] = [
      { id: 'modified-1', contentHash: 'h-old' },
      { id: 'unchanged-1', contentHash: 'h-same' },
      { id: 'deleted-1', contentHash: 'h-del' },
    ];

    const result = diffEntries(fileEntries, graphEntries);
    expect(result.added).toEqual(['added-1']);
    expect(result.modified).toEqual(['modified-1']);
    expect(result.unchanged).toEqual(['unchanged-1']);
    expect(result.deleted).toEqual(['deleted-1']);
  });

  it('returns empty arrays when both inputs are empty', () => {
    const result = diffEntries([], []);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip: renderToMarkdown → parseFromMarkdown', () => {
  it('produces a node matching the original SemanticNode', () => {
    const original = makeSemanticNode();
    const md = renderToMarkdown(original);
    const parsed = parseFromMarkdown(md);

    expect(parsed.id).toBe(original.id);
    expect(parsed.confidence).toBe(original.confidence);
    expect(parsed.signal_count).toBe(original.signal_count);
    expect(parsed.decay_class).toBe(original.decay_class);
    expect(parsed.tags).toEqual(original.tags);
    expect(parsed.created_at).toBe(original.created_at);
    expect(parsed.updated_at).toBe(original.updated_at);
    expect(parsed.content).toBe(original.content);
  });

  it('round-trips a SemanticNode with no tags', () => {
    const original = makeSemanticNode({ tags: [], id: 'sem-notags', confidence: 0.4, signal_count: 2 });
    const md = renderToMarkdown(original);
    const parsed = parseFromMarkdown(md);

    expect(parsed.id).toBe('sem-notags');
    expect(parsed.tags).toEqual([]);
    expect(parsed.confidence).toBe(0.4);
  });

  it('round-trips a SemanticNode with permanent decay_class', () => {
    const original = makeSemanticNode({ decay_class: 'permanent', id: 'sem-perm' });
    const md = renderToMarkdown(original);
    const parsed = parseFromMarkdown(md);

    expect(parsed.decay_class).toBe('permanent');
    expect(parsed.id).toBe('sem-perm');
  });
});
