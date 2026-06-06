import { describe, it, expect } from 'vitest';
import type { Driver } from 'neo4j-driver';
import { GraphSnapshotService } from '../snapshot.js';
import { toNum } from '../coerce.js';
import { redactSecrets, applyAllowlist } from '../allowlist.js';
import type { AmpGraphSnapshot } from '../types.js';

// ─── Mock Neo4j ──────────────────────────────────────────────────────────────

type RecordLike = { get: (k: string) => unknown };
function rec(map: Record<string, unknown>): RecordLike {
  return { get: (k) => map[k] };
}
/** A neo4j-driver Integer stand-in: arithmetic on it directly would be NaN. */
function int(n: number): { toNumber: () => number } {
  return { toNumber: () => n };
}
function node(labels: string[], properties: Record<string, unknown>) {
  return { labels, properties };
}

interface QueryLog {
  query: string;
  params: Record<string, unknown>;
}

interface MockData {
  entities?: ReturnType<typeof node>[];
  symbols?: Array<{ s: ReturnType<typeof node>; c: ReturnType<typeof node> }>;
  semantics?: ReturnType<typeof node>[];
  facts?: ReturnType<typeof node>[];
  sources?: ReturnType<typeof node>[];
  aspects?: ReturnType<typeof node>[];
  episodics?: ReturnType<typeof node>[];
  edges?: Array<{ source: string; target: string; relation: string; eid?: string; props?: Record<string, unknown> }>;
}

function makeMockDriver(data: MockData, log: QueryLog[] = []): Driver {
  const mk = (arr: ReturnType<typeof node>[] | undefined, key: string) => ({
    records: (arr ?? []).map((n) => rec({ [key]: n })),
  });
  const session = {
    run: async (query: string, params: Record<string, unknown>) => {
      log.push({ query, params });
      if (query.includes('-[r]->')) {
        return {
          records: (data.edges ?? []).map((e) =>
            rec({
              source: e.source,
              target: e.target,
              relation: e.relation,
              eid: e.eid ?? `${e.source}-${e.relation}-${e.target}`,
              props: e.props ?? {},
            }),
          ),
        };
      }
      if (query.includes('(s:Symbol)')) {
        return { records: (data.symbols ?? []).map(({ s, c }) => rec({ s, c })) };
      }
      if (query.includes('(a:Aspect)')) return mk(data.aspects, 'a');
      if (query.includes('(s:Semantic)')) return mk(data.semantics, 's');
      if (query.includes('(f:Fact)')) return mk(data.facts, 'f');
      if (query.includes('(s:Source)')) return mk(data.sources, 's');
      if (query.includes('(e:Episodic)')) return mk(data.episodics, 'e');
      if (query.includes('(e:Entity)')) return mk(data.entities, 'e');
      return { records: [] };
    },
    close: async () => {},
  };
  return { session: () => session } as unknown as Driver;
}

// ─── Neo4j integer coercion (Gotcha #1) ──────────────────────────────────────

describe('toNum coercion', () => {
  it('coerces neo4j Integer-like objects to a real number', () => {
    const coerced = toNum(int(42));
    expect(typeof coerced).toBe('number');
    expect(coerced).toBe(42);
  });

  it('passes through plain numbers and handles junk safely', () => {
    expect(toNum(7)).toBe(7);
    expect(toNum(null)).toBe(0);
    expect(toNum('nope')).toBe(0);
  });

  it('coerces neo4j ints in allowlisted node properties to typeof number', async () => {
    const driver = makeMockDriver({
      symbols: [
        {
          s: node(['Symbol'], {
            id: 'sym1',
            name: 'doThing',
            kind: 'function',
            file_path: '/repo/amp/packages/x/a.ts',
            start_line: int(10), // neo4j Integer object
            end_line: int(20),
            signature: 'function doThing()',
          }),
          c: node(['Entity', 'Component'], { id: 'comp1', name: 'a.ts', path: '/repo/amp/packages/x/a.ts' }),
        },
      ],
    });
    const snap = await new GraphSnapshotService(driver).snapshot({ project_name: 'amp' });
    const sym = snap.nodes.find((n) => n.id === 'sym1')!;
    expect(sym).toBeDefined();
    expect(typeof sym.properties.start_line).toBe('number');
    expect(sym.properties.start_line).toBe(10);
    expect(sym.properties.end_line).toBe(20);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('GraphSnapshotService determinism', () => {
  const data: MockData = {
    entities: [
      node(['Entity'], { id: 'e-c', name: 'gamma', type: 'module' }),
      node(['Entity'], { id: 'e-a', name: 'alpha', type: 'project' }),
      node(['Entity'], { id: 'e-b', name: 'beta', type: 'module' }),
    ],
    edges: [
      { source: 'e-c', target: 'e-a', relation: 'USES' },
      { source: 'e-a', target: 'e-b', relation: 'CONTAINS' },
      { source: 'e-a', target: 'e-c', relation: 'CONTAINS' },
    ],
  };

  it('returns nodes sorted by id and edges sorted by (source,target,relation,id)', async () => {
    const snap = await new GraphSnapshotService(makeMockDriver(data)).snapshot({ project_name: 'amp' });
    expect(snap.nodes.map((n) => n.id)).toEqual(['e-a', 'e-b', 'e-c']);
    expect(snap.edges.map((e) => `${e.source}->${e.target}:${e.relation}`)).toEqual([
      'e-a->e-b:CONTAINS',
      'e-a->e-c:CONTAINS',
      'e-c->e-a:USES',
    ]);
  });

  it('produces identical node/edge ordering across repeated runs', async () => {
    const svc = new GraphSnapshotService(makeMockDriver(data));
    const a = await svc.snapshot({ project_name: 'amp' });
    const b = await svc.snapshot({ project_name: 'amp' });
    expect(a.nodes).toEqual(b.nodes);
    expect(a.edges).toEqual(b.edges);
  });
});

// ─── Project scoping (exact-name root; delimiter-bounded paths) — C-14 ────────

describe('project scoping strategy', () => {
  it('scopes the project root by EXACT toLower name, never CONTAINS substring', async () => {
    const log: QueryLog[] = [];
    await new GraphSnapshotService(makeMockDriver({}, log)).snapshot({ project_name: 'amp' });
    const entityQuery = log.find((l) => l.query.includes('(e:Entity)') && !l.query.includes('-[r]->'))!;
    expect(entityQuery.query).toContain('toLower(project.name) = toLower($projectName)');
    // Must NOT regress to the prefix-colliding substring match (e.g. 'amp' ⊂ 'amp-core').
    expect(entityQuery.query).not.toContain('project.name CONTAINS');
    expect(entityQuery.params.projectName).toBe('amp');
  });

  it('scopes Symbols by delimiter-bounded repo path (no prefix collision)', async () => {
    const log: QueryLog[] = [];
    await new GraphSnapshotService(makeMockDriver({}, log)).snapshot({ project_name: 'amp' });
    const symbolQuery = log.find((l) => l.query.includes('(s:Symbol)'))!;
    expect(symbolQuery.query).toContain("c.path CONTAINS ('/' + $projectName + '/')");
    expect(symbolQuery.query).toContain("c.path ENDS WITH ('/' + $projectName)");
  });
});

// ─── Secret-safety (planted secret) — Critical Issue #5 / C-04 ───────────────

describe('secret-safety at the snapshot boundary', () => {
  const SECRET = 'sk-live-SECRETKEY1234567890ABCDEF';

  it('never emits Symbol.signature/doc_comment/vectors; planted secret never appears', async () => {
    const driver = makeMockDriver({
      symbols: [
        {
          s: node(['Symbol'], {
            id: 'sym-secret',
            name: 'loadKey',
            kind: 'function',
            file_path: '/repo/amp/packages/x/secret.ts',
            signature: `const API_KEY = "${SECRET}"`,
            doc_comment: `token=${SECRET}`,
            embedding: [0.1, 0.2, 0.3],
            lexical_vector: [1, 2, 3],
          }),
          c: node(['Entity', 'Component'], { id: 'comp-x', name: 'secret.ts', path: '/repo/amp/packages/x/secret.ts' }),
        },
      ],
    });
    const snap = await new GraphSnapshotService(driver).snapshot({ project_name: 'amp' });
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain(SECRET);

    const sym = snap.nodes.find((n) => n.id === 'sym-secret')!;
    expect(sym.properties).not.toHaveProperty('signature');
    expect(sym.properties).not.toHaveProperty('doc_comment');
    expect(sym.properties).not.toHaveProperty('embedding');
    expect(sym.properties).not.toHaveProperty('lexical_vector');
    expect(sym.properties.name).toBe('loadKey');
    expect(sym.properties.kind).toBe('function');
  });

  it('redacts secret patterns from labels derived from Semantic.content', async () => {
    const driver = makeMockDriver({
      semantics: [
        node(['Semantic'], {
          id: 'sem-1',
          content: `the deployment key is ${SECRET} keep it safe`,
          confidence: 0.4,
          tags: ['project:amp'],
        }),
      ],
    });
    const snap = await new GraphSnapshotService(driver).snapshot({ project_tag: 'project:amp' });
    const sem = snap.nodes.find((n) => n.id === 'sem-1')!;
    expect(sem.label).not.toContain(SECRET);
    expect(sem.label).toContain('[REDACTED]');
    expect(sem.properties).not.toHaveProperty('content');
  });

  it('redactSecrets handles common credential shapes', () => {
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED]');
    expect(redactSecrets('password: hunter2trustno1')).toContain('[REDACTED]');
    expect(redactSecrets('plain text')).toBe('plain text');
  });

  it('applyAllowlist drops forbidden keys and coerces ints', () => {
    const out = applyAllowlist('symbol', {
      name: 'x',
      signature: 'secret',
      embedding: [1, 2],
      start_line: int(5),
    });
    expect(out).toEqual({ name: 'x', start_line: 5 });
  });
});

// ─── Bounding & include flags — C-17 ─────────────────────────────────────────

describe('snapshot bounding', () => {
  it('flags truncated when a query returns at least max_nodes nodes', async () => {
    const driver = makeMockDriver({
      entities: [node(['Entity'], { id: 'e1', name: 'a' }), node(['Entity'], { id: 'e2', name: 'b' })],
    });
    const snap = await new GraphSnapshotService(driver).snapshot({ project_name: 'amp', max_nodes: 2 });
    expect(snap.truncated).toBe(true);
    expect(snap.total_available).toBe(2);
  });

  it('defaults include_episodes to false (episodic query not issued)', async () => {
    const log: QueryLog[] = [];
    await new GraphSnapshotService(makeMockDriver({}, log)).snapshot({ project_tag: 'project:amp' });
    expect(log.some((l) => l.query.includes('(e:Episodic)'))).toBe(false);
  });

  it('issues the episodic query when include_episodes is true', async () => {
    const log: QueryLog[] = [];
    await new GraphSnapshotService(makeMockDriver({}, log)).snapshot({
      project_tag: 'project:amp',
      include_episodes: true,
    });
    expect(log.some((l) => l.query.includes('(e:Episodic)'))).toBe(true);
  });
});

// ─── Empty graph ─────────────────────────────────────────────────────────────

describe('empty graph', () => {
  it('returns an empty, well-formed snapshot and skips the edge query', async () => {
    const log: QueryLog[] = [];
    const snap: AmpGraphSnapshot = await new GraphSnapshotService(makeMockDriver({}, log)).snapshot({
      project_name: 'nothing',
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.truncated).toBe(false);
    expect(snap.total_available).toBe(0);
    // No nodes ⇒ no edge query.
    expect(log.some((l) => l.query.includes('-[r]->'))).toBe(false);
  });
});
