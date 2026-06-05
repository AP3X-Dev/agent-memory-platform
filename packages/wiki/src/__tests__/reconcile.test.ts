// packages/wiki/src/__tests__/reconcile.test.ts
// Tests for the editable round-trip: frontmatter/claim-block parsing and the
// reconciler's changed/added/removed/unchanged behaviour against a mock graph.

import { describe, it, expect, vi } from 'vitest';
import type { Driver, Session } from 'neo4j-driver';
import { WikiEditReconciler, parseFrontmatter, parseClaimBlocks } from '../reconcile.js';
import { claimAnchor } from '../renderers.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function article(claims: Array<{ text: string; id?: string }>, extra = ''): string {
  const sections = claims
    .map((c) => `${c.text}\n*(confidence: 0.80)*${c.id ? `\n${claimAnchor(c.id)}` : ''}`)
    .join('\n\n');
  return `---
entity: my-role
type: concept
amp_id: ent-role1
tags: [project:user-personal, role]
---

# My Role

## Architecture

${sections}
${extra}`;
}

// ─── Mock driver ─────────────────────────────────────────────────────────────

interface GraphNode { content: string; confidence?: number; tags?: string[]; about?: string[]; }

function createDriver(graph: Map<string, GraphNode>): { driver: Driver; calls: () => string[] } {
  const queries: string[] = [];
  const session = {
    run: vi.fn(async (q: string, p: Record<string, unknown> = {}) => {
      queries.push(q);
      if (q.includes('MATCH (s:Semantic {id: $id})') && q.includes('RETURN s')) {
        const node = graph.get(p.id as string);
        if (!node) return { records: [] };
        const props = {
          id: p.id, content: node.content, confidence: node.confidence ?? 0.5,
          // Neo4j returns integers as BigInt — mirror that so arithmetic is exercised.
          signal_count: BigInt(2), created_at: 't', updated_at: 't',
          decay_class: 'volatile', tags: node.tags ?? [],
        };
        return { records: [{ get: (k: string) => (k === 's' ? { properties: props } : undefined) }] };
      }
      if (q.includes('-[:ABOUT]->(e:Entity)') && q.includes('RETURN e.id')) {
        const about = graph.get(p.id as string)?.about ?? [];
        return { records: about.map((id) => ({ get: (k: string) => (k === 'id' ? id : undefined) })) };
      }
      // create/supersede/episodic-create all RETURN an id
      if (q.includes('CREATE (new:Semantic') || q.includes('CREATE (s:Semantic') || q.includes('CREATE (e:Episodic')) {
        return { records: [{ get: () => (p.id as string) ?? 'new-id' }] };
      }
      return { records: [] };
    }),
    close: vi.fn(async () => {}),
  } as unknown as Session;
  const driver = { session: vi.fn(() => session) } as unknown as Driver;
  return { driver, calls: () => queries };
}

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('reads entity, amp_id, and tags', () => {
    const fm = parseFrontmatter(article([{ text: 'x', id: 'sem-1' }]));
    expect(fm.entity).toBe('my-role');
    expect(fm.amp_id).toBe('ent-role1');
    expect(fm.tags).toContain('project:user-personal');
    expect(fm.tags).toContain('role');
  });

  it('returns empty tags when no frontmatter', () => {
    expect(parseFrontmatter('# no frontmatter').tags).toEqual([]);
  });
});

// ─── parseClaimBlocks ────────────────────────────────────────────────────────

describe('parseClaimBlocks', () => {
  it('extracts anchored claims with their semantic ids, stripping the confidence line', () => {
    const blocks = parseClaimBlocks(article([
      { text: 'Uses JWT for auth', id: 'sem-1' },
      { text: 'Runs on Postgres', id: 'sem-2' },
    ]));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ anchorId: 'sem-1', text: 'Uses JWT for auth' });
    expect(blocks[1]).toEqual({ anchorId: 'sem-2', text: 'Runs on Postgres' });
  });

  it('treats anchorless prose under a domain section as a new claim', () => {
    const blocks = parseClaimBlocks(article([{ text: 'Existing', id: 'sem-1' }], '\nA brand new thought.\n'));
    const news = blocks.filter((b) => b.anchorId === null);
    expect(news).toHaveLength(1);
    expect(news[0].text).toBe('A brand new thought.');
  });

  it('ignores blockquotes and headings (history/hierarchy)', () => {
    const md = `---\nentity: x\namp_id: ent-1\ntags: []\n---\n\n# X\n\n## History\n\n> **2026-01-01** -- did a thing\n`;
    expect(parseClaimBlocks(md)).toHaveLength(0);
  });
});

// ─── Reconciler ──────────────────────────────────────────────────────────────

describe('WikiEditReconciler', () => {
  it('reports unchanged when text matches the graph (no supersede)', async () => {
    const graph = new Map([['sem-1', { content: 'Uses JWT for auth', about: ['ent-role1'] }]]);
    const { driver, calls } = createDriver(graph);
    const r = await new WikiEditReconciler(driver).reconcile({
      project_tag: 'project:user-personal',
      edited_md: article([{ text: 'Uses JWT for auth', id: 'sem-1' }]),
    });
    expect(r.unchanged).toBe(1);
    expect(r.corrected).toBe(0);
    expect(calls().some((q) => q.includes('SUPERSEDES'))).toBe(false);
  });

  it('supersedes a changed claim and emits a correction (and re-links ABOUT)', async () => {
    const graph = new Map([['sem-1', { content: 'Uses JWT for auth', about: ['ent-role1'] }]]);
    const { driver, calls } = createDriver(graph);
    const r = await new WikiEditReconciler(driver).reconcile({
      project_tag: 'project:user-personal',
      edited_md: article([{ text: 'Uses PASETO for auth', id: 'sem-1' }]),
    });
    expect(r.corrected).toBe(1);
    expect(r.details[0]).toMatchObject({ action: 'corrected', semantic_id: 'sem-1' });
    const q = calls();
    expect(q.some((s) => s.includes('SUPERSEDES'))).toBe(true);     // supersede
    expect(q.some((s) => s.includes('CORRECTS'))).toBe(true);       // signal edge
    expect(q.some((s) => s.includes('MERGE (s)-[:ABOUT]->'))).toBe(true); // re-link
  });

  it('adds a new human-authored claim for anchorless prose', async () => {
    const graph = new Map([['sem-1', { content: 'Existing', about: ['ent-role1'] }]]);
    const { driver, calls } = createDriver(graph);
    const r = await new WikiEditReconciler(driver).reconcile({
      project_tag: 'project:user-personal',
      edited_md: article([{ text: 'Existing', id: 'sem-1' }], '\nI prefer Rust with minimal deps.\n'),
    });
    expect(r.added).toBe(1);
    expect(calls().some((q) => q.includes('CREATE (s:Semantic'))).toBe(true);
  });

  it('penalises a removed claim (never deletes) only when given the original', async () => {
    const graph = new Map([
      ['sem-1', { content: 'Kept', about: ['ent-role1'] }],
      ['sem-2', { content: 'Removed me', about: ['ent-role1'] }],
    ]);
    const { driver, calls } = createDriver(graph);
    const original = article([{ text: 'Kept', id: 'sem-1' }, { text: 'Removed me', id: 'sem-2' }]);
    const edited = article([{ text: 'Kept', id: 'sem-1' }]);
    const r = await new WikiEditReconciler(driver).reconcile({
      project_tag: 'project:user-personal',
      edited_md: edited,
      original_md: original,
    });
    expect(r.removed).toBe(1);
    expect(r.details.find((d) => d.action === 'removed')?.semantic_id).toBe('sem-2');
    expect(calls().some((q) => q.includes('SET s.confidence'))).toBe(true);
    // no destructive delete
    expect(calls().some((q) => /DELETE|DETACH/.test(q))).toBe(false);
  });

  it('is idempotent: re-saving an unedited article changes nothing', async () => {
    const graph = new Map([['sem-1', { content: 'Stable claim', about: ['ent-role1'] }]]);
    const { driver } = createDriver(graph);
    const md = article([{ text: 'Stable claim', id: 'sem-1' }]);
    const r = await new WikiEditReconciler(driver).reconcile({
      project_tag: 'project:user-personal', edited_md: md, original_md: md,
    });
    expect(r).toMatchObject({ corrected: 0, added: 0, removed: 0, unchanged: 1 });
  });
});
