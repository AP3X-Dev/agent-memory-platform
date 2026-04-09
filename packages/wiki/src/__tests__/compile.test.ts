// packages/wiki/src/__tests__/compile.test.ts
// Tests for WikiCompiler, slugify, and resolveInlineLinks.

import { describe, it, expect, vi } from 'vitest';
import { slugify, resolveInlineLinks, WikiCompiler } from '../compile.js';
import type { Driver, Session, Result } from 'neo4j-driver';

// slugify tests

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Mars FPS')).toBe('mars-fps');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('game engine')).toBe('game-engine');
  });

  it('replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('ECS (Entity Component System)')).toBe('ecs-entity-component-system');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('hello   world   test')).toBe('hello-world-test');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles pure punctuation', () => {
    expect(slugify('!!??...')).toBe('');
  });

  it('handles numbers', () => {
    expect(slugify('v2.0 release')).toBe('v2-0-release');
  });

  it('handles single char', () => {
    expect(slugify('A')).toBe('a');
  });

  it('handles already-slug', () => {
    expect(slugify('already-slug')).toBe('already-slug');
  });

  it('handles unicode characters', () => {
    expect(slugify('cafe latte')).toBe('cafe-latte');
  });

  it('handles mixed case and numbers', () => {
    expect(slugify('MyComponent2Test')).toBe('mycomponent2test');
  });
});

// resolveInlineLinks tests

describe('resolveInlineLinks', () => {
  it('links a single mention of an entity', () => {
    const result = resolveInlineLinks('Uses Redis for caching', ['Redis'], 'my-proj');
    expect(result).toBe('Uses [[projects/my-proj/redis|Redis]] for caching');
  });

  it('links all occurrences of the same entity (global)', () => {
    const text = 'Redis handles caching. Redis also handles pub/sub. Redis is fast.';
    const result = resolveInlineLinks(text, ['Redis'], 'my-proj');
    const link = '[[projects/my-proj/redis|Redis]]';
    expect(result).toBe(`${link} handles caching. ${link} also handles pub/sub. ${link} is fast.`);
  });

  it('does not double-link an entity already inside a [[wikilink]]', () => {
    const text = 'See [[projects/my-proj/redis|Redis]] and also Redis is great';
    const result = resolveInlineLinks(text, ['Redis'], 'my-proj');
    // The first "Redis" is inside [[...]] — must stay untouched. The second gets linked.
    expect(result).toBe('See [[projects/my-proj/redis|Redis]] and also [[projects/my-proj/redis|Redis]] is great');
  });

  it('handles multiple different entities each appearing multiple times', () => {
    const text = 'Neo4j stores data. Redis caches it. Neo4j is a graph DB. Redis is fast.';
    const result = resolveInlineLinks(text, ['Neo4j', 'Redis'], 'proj');
    expect(result).toContain('[[projects/proj/neo4j|Neo4j]] stores data');
    expect(result).toContain('[[projects/proj/redis|Redis]] caches it');
    expect(result).toContain('[[projects/proj/neo4j|Neo4j]] is a graph DB');
    expect(result).toContain('[[projects/proj/redis|Redis]] is fast');
  });

  it('is case-insensitive when matching', () => {
    const text = 'redis handles caching. REDIS also handles pub/sub.';
    const result = resolveInlineLinks(text, ['Redis'], 'my-proj');
    const link = '[[projects/my-proj/redis|Redis]]';
    expect(result).toBe(`${link} handles caching. ${link} also handles pub/sub.`);
  });

  it('returns text unchanged when no entity refs match', () => {
    const text = 'Nothing to link here.';
    const result = resolveInlineLinks(text, ['Redis'], 'proj');
    expect(result).toBe('Nothing to link here.');
  });

  it('handles empty entity refs array', () => {
    const text = 'Some text about Redis.';
    const result = resolveInlineLinks(text, [], 'proj');
    expect(result).toBe('Some text about Redis.');
  });

  it('prefers longer entity names over shorter ones', () => {
    const text = 'The auth module handles authentication.';
    const result = resolveInlineLinks(text, ['auth', 'auth module'], 'proj');
    // "auth module" is longer, should be linked first
    expect(result).toContain('[[projects/proj/auth-module|auth module]]');
  });
});

// Mock helpers

function mockRecord(data: Record<string, unknown>) {
  return {
    get(key: string) {
      return data[key];
    },
    keys: Object.keys(data),
  };
}

function mockResult(records: ReturnType<typeof mockRecord>[] = []): Result {
  return { records } as unknown as Result;
}

function createMockDriver(queryResponses: Map<string, ReturnType<typeof mockResult>>): Driver {
  const mockSession = {
    run: vi.fn(async (query: string, _params?: unknown) => {
      // Match query responses by substring match
      for (const [key, value] of queryResponses) {
        if (query.includes(key)) return value;
      }
      return mockResult([]);
    }),
    close: vi.fn(async () => {}),
  } as unknown as Session;

  return {
    session: vi.fn(() => mockSession),
  } as unknown as Driver;
}

// WikiCompiler tests

describe('WikiCompiler', () => {
  it('compiles an empty graph with zero projects', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-${Date.now()}`);

    try {
      const result = await compiler.compile(outputDir);

      expect(result.projects_compiled).toBe(0);
      expect(result.articles_compiled).toBe(0);
      expect(result.episodics_rendered).toBe(0);
      expect(result.output_dir).toBe(outputDir);
      expect(result.cross_project_pages).toBe(3); // decisions + patterns + recent

      // Verify output files exist
      const indexStat = await fs.stat(path.join(outputDir, '_index.md'));
      expect(indexStat.isFile()).toBe(true);

      const decisionsStat = await fs.stat(path.join(outputDir, '_decisions.md'));
      expect(decisionsStat.isFile()).toBe(true);

      const patternsStat = await fs.stat(path.join(outputDir, '_patterns.md'));
      expect(patternsStat.isFile()).toBe(true);

      const recentStat = await fs.stat(path.join(outputDir, '_recent.md'));
      expect(recentStat.isFile()).toBe(true);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('creates library directory with empty index when no sources', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-lib-${Date.now()}`);

    try {
      await compiler.compile(outputDir);

      const libIndex = await fs.readFile(path.join(outputDir, 'library', '_index.md'), 'utf-8');
      expect(libIndex).toContain('Source Library');
      expect(libIndex).toContain('No sources indexed yet');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('creates topics directory with empty index when no qualified tags', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-topics-${Date.now()}`);

    try {
      await compiler.compile(outputDir);

      const topicsIndex = await fs.readFile(path.join(outputDir, 'topics', '_index.md'), 'utf-8');
      expect(topicsIndex).toContain('Topics');
      expect(topicsIndex).toContain('No topics discovered yet');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('cleans output directory before compiling', async () => {
    const driver = createMockDriver(new Map());
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-test-clean-${Date.now()}`);

    try {
      // Create a stale file
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, 'stale.md'), 'old content', 'utf-8');

      await compiler.compile(outputDir);

      // Stale file should be gone
      await expect(fs.stat(path.join(outputDir, 'stale.md'))).rejects.toThrow();
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('compiles within 500ms budget on a realistic-sized mock graph', async () => {
    // Simulate a graph with 2 projects, 20 entities each, 50 semantics, 219 episodics
    const entities = Array.from({ length: 20 }, (_, i) => mockRecord({
      id: `ent-${i}`,
      name: `module-${i}`,
      type: 'module',
      description: `Module ${i}`,
      aliases: null,
      created_at: '2026-01-01T00:00:00Z',
    }));

    const semantics = Array.from({ length: 50 }, (_, i) => mockRecord({
      id: `sem-${i}`,
      content: `Semantic knowledge ${i} about module-${i % 20}`,
      confidence: 0.5 + (i % 5) * 0.1,
      tags: ['project:test-proj', i % 3 === 0 ? 'architecture' : 'api-design'],
      entities: [`module-${i % 20}`],
      updated_at: '2026-03-01T00:00:00Z',
      entity_refs: [],
    }));

    const episodics = Array.from({ length: 50 }, (_, i) => mockRecord({
      id: `ep-${i}`,
      task: `[project:test-proj] Task ${i}`,
      content: `Did something about module-${i % 20}`,
      outcome: 'approved',
      session_id: `session-${Math.floor(i / 5)}`,
      created_at: new Date(2026, 0, 1 + i).toISOString(),
    }));

    const projectRecord = mockRecord({
      id: 'proj-1',
      name: 'test-proj',
      type: 'project',
      description: 'Test project',
      aliases: null,
      created_at: '2026-01-01T00:00:00Z',
    });

    // Build query→response map. The mock driver matches by first substring hit,
    // so more specific patterns must come before general ones.
    const responses = new Map<string, ReturnType<typeof mockResult>>([
      ['ep.task STARTS WITH', mockResult([])],
      ["(e:Entity {type: 'project'})\n", mockResult([projectRecord])],
      ['CONTAINS*1..', mockResult(entities)],
      ['-[:MODIFIED]->', mockResult([])],
      ['UNWIND s.tags', mockResult([])],
      ['count(s) AS cnt', mockResult([mockRecord({ cnt: 0 })])],
      ['[:ABOUT]->(e:Entity {name: $name})', mockResult([])],
      ['[:CITES]->(src:Source', mockResult([])],
      ['collect(DISTINCT e.name) AS entities', mockResult(semantics)],
      ['labels(n)[0]', mockResult([
        mockRecord({ label: 'Entity', cnt: 20 }),
        mockRecord({ label: 'Semantic', cnt: 50 }),
        mockRecord({ label: 'Episodic', cnt: 219 }),
        mockRecord({ label: 'Source', cnt: 0 }),
      ])],
      ['(s:Source)\n', mockResult([])],
      ['LIMIT $limit', mockResult(episodics.slice(0, 10))],
      ['ep.task CONTAINS $name OR ep.content CONTAINS', mockResult([])],
      ['ep.task CONTAINS $tag', mockResult(episodics)],
      ['parent:Entity', mockResult([])],
      ['->(child:Entity)', mockResult([])],
      ['(other:Entity)-[r2]->', mockResult([])],
    ]);

    const driver = createMockDriver(responses);
    const compiler = new WikiCompiler(driver);

    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.join(os.tmpdir(), `amp-wiki-perf-${Date.now()}`);

    try {
      const start = performance.now();
      await compiler.compile(outputDir);
      const elapsed = performance.now() - start;

      // The compile should complete well under 500ms with batched queries
      expect(elapsed).toBeLessThan(500);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
