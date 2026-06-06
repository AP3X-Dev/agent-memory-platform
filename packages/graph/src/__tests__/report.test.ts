import { describe, it, expect } from 'vitest';
import type { Driver } from 'neo4j-driver';
import { GraphReportService } from '../report.js';
import { GraphSnapshotService } from '../snapshot.js';
import { rankCoreNodes } from '../centrality.js';
import { findImportCycles } from '../import-cycles.js';
import type { AmpGraphEdge, AmpGraphNode, AmpGraphSnapshot } from '../types.js';

// ─── A fixed, deterministic snapshot for report-logic tests ──────────────────

function n(
  id: string,
  type: AmpGraphNode['type'],
  label: string,
  properties: Record<string, unknown> = {},
): AmpGraphNode {
  return { id, type, label, properties };
}
function e(source: string, target: string, relation: string, weight: number): AmpGraphEdge {
  return { id: `${source}|${relation}|${target}`, source, target, relation, weight, properties: {} };
}

const FIXED: AmpGraphSnapshot = {
  project_tag: 'project:amp',
  project_name: 'amp',
  generated_at: '2026-06-06T00:00:00.000Z',
  truncated: false,
  total_available: 9,
  nodes: [
    n('amp', 'entity', 'amp', { name: 'amp', type: 'project' }),
    n('core', 'entity', 'core', { name: 'core', type: 'module' }),
    n('redis', 'entity', 'redis', { name: 'redis', type: 'module' }),
    n('orphan', 'entity', 'orphan-mod', { name: 'orphan-mod', type: 'module' }),
    n('sem-low', 'semantic', 'shaky claim', { confidence: 0.2, tags: ['project:amp'] }),
    n('sem-high', 'semantic', 'solid claim', { confidence: 0.9, tags: ['project:amp'] }),
    n('fact-t', 'fact', 'amp uses neo4j', { status: 'tentative' }),
    n('src-1', 'source', 'Design Doc', { title: 'Design Doc' }),
    n('comp-empty', 'component', 'empty.ts', { name: 'empty.ts' }),
  ],
  edges: [
    e('amp', 'core', 'CONTAINS', 3),
    e('amp', 'redis', 'CONTAINS', 3),
    e('core', 'redis', 'USES', 3),
    e('redis', 'core', 'USES', 3),
    e('sem-high', 'core', 'ABOUT', 1),
    e('sem-low', 'amp', 'ABOUT', 1),
    e('sem-low', 'sem-high', 'CONTRADICTS', 1),
  ],
};

function fakeSnapshotService(snap: AmpGraphSnapshot): GraphSnapshotService {
  return { snapshot: async () => snap } as unknown as GraphSnapshotService;
}

// ─── Centrality + cycles unit behavior ───────────────────────────────────────

describe('rankCoreNodes', () => {
  it('ranks by weighted degree (structural edges weighted above provenance)', () => {
    const ranked = rankCoreNodes(FIXED, 10);
    expect(ranked[0].id).toBe('core'); // 3+3+3+1 = 10
    expect(ranked[0].weighted_degree).toBe(10);
    expect(ranked[0].degree).toBe(4);
    // deterministic ordering overall
    expect(ranked.map((r) => r.id)).toEqual(rankCoreNodes(FIXED, 10).map((r) => r.id));
  });
});

describe('findImportCycles', () => {
  it('detects a 2-node USES cycle in canonical orientation', () => {
    const cycles = findImportCycles(FIXED);
    expect(cycles).toEqual([['core', 'redis']]);
  });

  it('returns no cycles when none exist', () => {
    const acyclic: AmpGraphSnapshot = { ...FIXED, edges: [e('core', 'redis', 'USES', 3)] };
    expect(findImportCycles(acyclic)).toEqual([]);
  });
});

// ─── Report generation ───────────────────────────────────────────────────────

describe('GraphReportService.generate', () => {
  it('produces a deterministic markdown report', async () => {
    const svc = new GraphReportService(fakeSnapshotService(FIXED));
    const a = await svc.generate({ project_tag: 'project:amp' });
    const b = await svc.generate({ project_tag: 'project:amp' });
    expect(a.markdown).toBe(b.markdown);
  });

  it('computes correct corpus stats', async () => {
    const { stats } = await new GraphReportService(fakeSnapshotService(FIXED)).generate({});
    expect(stats).toEqual({
      nodes: 9,
      edges: 7,
      semantic_count: 2,
      symbol_count: 0,
      fact_count: 1,
      source_count: 1,
      entity_count: 5, // 4 entities + 1 component
    });
  });

  it('includes all expected sections and findings', async () => {
    const { markdown } = await new GraphReportService(fakeSnapshotService(FIXED)).generate({});
    // Sections
    expect(markdown).toContain('# AMP Graph Report');
    expect(markdown).toContain('## Graph Summary');
    expect(markdown).toContain('## Memory Confidence Summary');
    expect(markdown).toContain('## Core Abstractions');
    expect(markdown).toContain('## Import / Dependency Cycles');
    expect(markdown).toContain('## Low-Confidence Knowledge');
    expect(markdown).toContain('## Knowledge Gaps');
    expect(markdown).toContain('## Recommended Actions');
    // Header scoping
    expect(markdown).toContain('**Project tag:** project:amp');
    expect(markdown).toContain('2026-06-06T00:00:00.000Z');
    // Core abstraction
    expect(markdown).toContain('| core | entity | 10 | 4 |');
    // Cycle
    expect(markdown).toContain('core → redis → core');
    // Low-confidence knowledge
    expect(markdown).toContain('shaky claim');
    expect(markdown).toContain('[tentative] amp uses neo4j');
    // Confidence summary counts
    expect(markdown).toContain('High-confidence semantics (≥ 0.7): 1');
    expect(markdown).toContain('Low-confidence semantics (< 0.5): 1');
    expect(markdown).toContain('Contradiction signals: 1');
    // Knowledge gaps
    expect(markdown).toContain('orphan-mod');
    expect(markdown).toContain('Components with no symbols');
    expect(markdown).toContain('empty.ts');
    expect(markdown).toContain('Sources with no claims');
    expect(markdown).toContain('Design Doc');
  });

  it('handles an empty graph gracefully', async () => {
    const empty: AmpGraphSnapshot = {
      generated_at: '2026-06-06T00:00:00.000Z',
      truncated: false,
      total_available: 0,
      nodes: [],
      edges: [],
    };
    const { markdown, stats } = await new GraphReportService(fakeSnapshotService(empty)).generate({});
    expect(stats.nodes).toBe(0);
    expect(markdown).toContain('_No nodes in scope._');
    expect(markdown).toContain('No import or dependency cycles detected.');
    expect(markdown).toContain('No knowledge gaps detected.');
    expect(markdown).toContain('(all projects)');
  });
});

// ─── End-to-end secret safety: planted secret never reaches report output ────

describe('report secret safety (end-to-end)', () => {
  const SECRET = 'sk-live-REPORTSECRET1234567890ABCD';

  function mockDriverWithSecretSymbol(): Driver {
    const rec = (m: Record<string, unknown>) => ({ get: (k: string) => m[k] });
    const session = {
      run: async (query: string) => {
        if (query.includes('(s:Symbol)')) {
          return {
            records: [
              rec({
                s: {
                  labels: ['Symbol'],
                  properties: {
                    id: 'sym-x',
                    name: 'getKey',
                    kind: 'function',
                    file_path: '/repo/amp/x.ts',
                    signature: `const API_KEY = "${SECRET}"`,
                  },
                },
                c: { labels: ['Entity', 'Component'], properties: { id: 'c-x', name: 'x.ts', path: '/repo/amp/x.ts' } },
              }),
            ],
          };
        }
        return { records: [] };
      },
      close: async () => {},
    };
    return { session: () => session } as unknown as Driver;
  }

  it('a planted secret in a Symbol signature does not appear in report output', async () => {
    const snapshotSvc = new GraphSnapshotService(mockDriverWithSecretSymbol());

    // Boundary sanity: the symbol is captured by name, with the secret stripped.
    const snap = await snapshotSvc.snapshot({ project_name: 'amp' });
    const sym = snap.nodes.find((nd) => nd.id === 'sym-x')!;
    expect(sym.properties.name).toBe('getKey');
    expect(sym.properties).not.toHaveProperty('signature');
    expect(JSON.stringify(snap)).not.toContain(SECRET);

    // End-to-end: the rendered report never leaks the secret.
    const report = await new GraphReportService(snapshotSvc).generate({ project_name: 'amp' });
    expect(report.markdown).not.toContain(SECRET);
  });
});
