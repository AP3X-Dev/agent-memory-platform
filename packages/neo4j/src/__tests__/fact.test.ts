// packages/neo4j/src/__tests__/fact.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { FactStore } from '../fact.js';
import type { FactNode } from '@memberry/core';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function isNeo4jReachable(uri: string, user: string, password: string): Promise<boolean> {
  const probe = createNeo4jDriver(uri, user, password);
  try {
    await probe.getServerInfo();
    return true;
  } catch {
    return false;
  } finally {
    await probe.close().catch(() => {});
  }
}

const TEST_PREFIX = `test-fact-${Date.now()}`;

function makeFactNode(suffix: string, overrides: Partial<FactNode> = {}): FactNode {
  const now = new Date().toISOString();
  return {
    id: `${TEST_PREFIX}-${suffix}`,
    subject: overrides.subject ?? 'auth-module',
    predicate: overrides.predicate ?? 'uses',
    object: overrides.object ?? 'JWT',
    source_episode_ids: overrides.source_episode_ids ?? [],
    valid_at: overrides.valid_at ?? now,
    invalid_at: overrides.invalid_at ?? null,
    confidence: overrides.confidence ?? 0.8,
    status: overrides.status ?? 'active',
    supersedes_fact_id: overrides.supersedes_fact_id ?? null,
    scope: overrides.scope ?? 'project',
    tags: overrides.tags ?? ['test'],
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
  };
}

describe('FactStore', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  let store: FactStore;

  const createdIds: string[] = [];

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping fact tests`);
      return;
    }
    store = new FactStore(driver);

    // Ensure test entity exists
    const session = driver.session();
    try {
      await session.run(
        `MERGE (e:Entity {name: 'auth-module'})
         ON CREATE SET e.id = $id, e.type = 'module', e.created_at = $now`,
        { id: `${TEST_PREFIX}-entity`, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    if (neo4jAvailable && createdIds.length > 0) {
      const session = driver.session();
      try {
        await session.run(
          'MATCH (f:Fact) WHERE f.id IN $ids DETACH DELETE f',
          { ids: createdIds },
        );
        // Clean up test entities created by FactStore MERGE
        await session.run(
          `MATCH (e:Entity) WHERE e.id STARTS WITH $prefix DETACH DELETE e`,
          { prefix: TEST_PREFIX },
        );
      } finally {
        await session.close();
      }
    }
    await driver.close().catch(() => {});
  });

  // ─── create ────────────────────────────────────────────────────────────────

  it('should create a fact node and return its id', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('create');
    const id = await store.create(fact);
    createdIds.push(id);
    expect(id).toBe(fact.id);
  });

  it('should create FACT_ABOUT relationship to entity', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('about-link');
    const id = await store.create(fact);
    createdIds.push(id);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact {id: $id})-[:FACT_ABOUT]->(e:Entity {name: $name})
         RETURN count(*) AS cnt`,
        { id, name: 'auth-module' },
      );
      const cnt = result.records[0].get('cnt') as { toNumber: () => number } | number;
      const count = typeof cnt === 'object' ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await session.close();
    }
  });

  // ─── getById ───────────────────────────────────────────────────────────────

  it('should retrieve a fact by id', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('retrieve');
    const id = await store.create(fact);
    createdIds.push(id);

    const fetched = await store.getById(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(fact.id);
    expect(fetched!.subject).toBe('auth-module');
    expect(fetched!.predicate).toBe('uses');
    expect(fetched!.object).toBe('JWT');
    expect(fetched!.status).toBe('active');
    expect(fetched!.confidence).toBe(0.8);
  });

  it('should return null for non-existent id', async () => {
    if (!neo4jAvailable) return;
    const fetched = await store.getById('non-existent-fact-xyz');
    expect(fetched).toBeNull();
  });

  // ─── getActive: current ────────────────────────────────────────────────────

  it('getActive with current time_mode returns active facts', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('active-current', { subject: 'auth-module' });
    await store.create(fact);
    createdIds.push(fact.id);

    const results = await store.getActive('auth-module', { time_mode: 'current' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((f) => f.status === 'active' && f.invalid_at === null)).toBe(true);
  });

  // ─── getActive: historical ─────────────────────────────────────────────────

  it('getActive with historical time_mode returns facts valid at as_of', async () => {
    if (!neo4jAvailable) return;
    const past = '2020-01-01T00:00:00.000Z';
    const fact = makeFactNode('historical', {
      subject: 'auth-module',
      valid_at: '2019-06-01T00:00:00.000Z',
      invalid_at: '2020-06-01T00:00:00.000Z',
      status: 'invalidated',
    });
    await store.create(fact);
    createdIds.push(fact.id);

    const results = await store.getActive('auth-module', {
      time_mode: 'historical',
      as_of: past,
    });
    const found = results.find((f) => f.id === fact.id);
    expect(found).toBeDefined();
  });

  // ─── getActive: interval ───────────────────────────────────────────────────

  it('getActive with interval time_mode returns facts active during range', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('interval', {
      subject: 'auth-module',
      valid_at: '2021-01-01T00:00:00.000Z',
      invalid_at: '2021-12-31T23:59:59.000Z',
      status: 'invalidated',
    });
    await store.create(fact);
    createdIds.push(fact.id);

    const results = await store.getActive('auth-module', {
      time_mode: 'interval',
      from: '2021-03-01T00:00:00.000Z',
      to: '2021-09-01T00:00:00.000Z',
    });
    const found = results.find((f) => f.id === fact.id);
    expect(found).toBeDefined();
  });

  // ─── getActive: evolution ──────────────────────────────────────────────────

  it('getActive with evolution time_mode returns all non-invalidated facts in order', async () => {
    if (!neo4jAvailable) return;
    const fact1 = makeFactNode('evo-1', {
      subject: 'auth-module',
      valid_at: '2022-01-01T00:00:00.000Z',
    });
    const fact2 = makeFactNode('evo-2', {
      subject: 'auth-module',
      valid_at: '2023-01-01T00:00:00.000Z',
    });
    await store.create(fact1);
    await store.create(fact2);
    createdIds.push(fact1.id, fact2.id);

    const results = await store.getActive('auth-module', { time_mode: 'evolution' });
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Should be ordered by valid_at ASC
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.valid_at <= results[i + 1]!.valid_at).toBe(true);
    }
  });

  it('getActive with evolution + include_invalidated returns invalidated facts', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('evo-invalidated', {
      subject: 'auth-module',
      valid_at: '2018-01-01T00:00:00.000Z',
      invalid_at: '2018-12-31T00:00:00.000Z',
      status: 'invalidated',
    });
    await store.create(fact);
    createdIds.push(fact.id);

    const results = await store.getActive('auth-module', {
      time_mode: 'evolution',
      include_invalidated: true,
    });
    const found = results.find((f) => f.id === fact.id);
    expect(found).toBeDefined();
  });

  // ─── invalidate ────────────────────────────────────────────────────────────

  it('should invalidate a fact and set invalid_at', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('to-invalidate', { subject: 'auth-module' });
    await store.create(fact);
    createdIds.push(fact.id);

    const invalidAt = new Date().toISOString();
    await store.invalidate(fact.id, invalidAt);

    const fetched = await store.getById(fact.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('invalidated');
    expect(fetched!.invalid_at).toBe(invalidAt);
  });

  it('should create SUPERSEDES_FACT relationship when supersededById is provided', async () => {
    if (!neo4jAvailable) return;
    const oldFact = makeFactNode('old-superseded', { subject: 'auth-module' });
    const newFact = makeFactNode('new-superseding', {
      subject: 'auth-module',
      object: 'OAuth2',
      supersedes_fact_id: oldFact.id,
    });
    await store.create(oldFact);
    await store.create(newFact);
    createdIds.push(oldFact.id, newFact.id);

    await store.invalidate(oldFact.id, new Date().toISOString(), newFact.id);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (newF:Fact {id: $newId})-[:SUPERSEDES_FACT]->(oldF:Fact {id: $oldId})
         RETURN count(*) AS cnt`,
        { newId: newFact.id, oldId: oldFact.id },
      );
      const cnt = result.records[0].get('cnt') as { toNumber: () => number } | number;
      const count = typeof cnt === 'object' ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await session.close();
    }
  });

  // ─── dispute ───────────────────────────────────────────────────────────────

  it('should dispute a fact', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('to-dispute', { subject: 'auth-module' });
    await store.create(fact);
    createdIds.push(fact.id);

    await store.dispute(fact.id);

    const fetched = await store.getById(fact.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('disputed');
  });

  // ─── timeline ──────────────────────────────────────────────────────────────

  it('should return timeline ordered by valid_at', async () => {
    if (!neo4jAvailable) return;
    // Create facts with known ordering
    const fact1 = makeFactNode('tl-1', {
      subject: 'auth-module',
      predicate: 'deploys_to',
      object: 'k8s',
      valid_at: '2023-01-01T00:00:00.000Z',
    });
    const fact2 = makeFactNode('tl-2', {
      subject: 'auth-module',
      predicate: 'deploys_to',
      object: 'ecs',
      valid_at: '2024-01-01T00:00:00.000Z',
    });
    await store.create(fact1);
    await store.create(fact2);
    createdIds.push(fact1.id, fact2.id);

    const tl = await store.timeline('auth-module');
    expect(tl.entity).toBe('auth-module');
    expect(tl.facts.length).toBeGreaterThanOrEqual(2);

    // Timeline should be in valid_at ASC order
    for (let i = 0; i < tl.facts.length - 1; i++) {
      expect(tl.facts[i]!.valid_at <= tl.facts[i + 1]!.valid_at).toBe(true);
    }

    // Each fact should have an event type
    for (const f of tl.facts) {
      expect(['created', 'invalidated', 'disputed', 'superseded']).toContain(f.event);
    }
  });

  // ─── diff ──────────────────────────────────────────────────────────────────

  it('should compute diff between two timestamps', async () => {
    if (!neo4jAvailable) return;
    // Create a fact that was active in the 'from' period
    const oldFact = makeFactNode('diff-old', {
      subject: 'auth-module',
      predicate: 'runtime',
      object: 'Node 16',
      valid_at: '2022-01-01T00:00:00.000Z',
      invalid_at: '2023-06-01T00:00:00.000Z',
      status: 'invalidated',
    });
    // Create a fact that became active in the 'to' period
    const newFact = makeFactNode('diff-new', {
      subject: 'auth-module',
      predicate: 'runtime',
      object: 'Node 20',
      valid_at: '2023-06-01T00:00:00.000Z',
      supersedes_fact_id: oldFact.id,
    });
    await store.create(oldFact);
    await store.create(newFact);
    createdIds.push(oldFact.id, newFact.id);

    const d = await store.diff(
      'auth-module',
      '2023-01-01T00:00:00.000Z',
      '2024-01-01T00:00:00.000Z',
    );
    expect(d.entity).toBe('auth-module');
    expect(d.from).toBe('2023-01-01T00:00:00.000Z');
    expect(d.to).toBe('2024-01-01T00:00:00.000Z');

    // The old fact was active at 'from' but not at 'to'
    // The new fact was not active at 'from' but is active at 'to'
    // Since newFact supersedes oldFact, they should appear in changed
    const changedPair = d.changed.find(
      (c) => c.before.id === oldFact.id && c.after.id === newFact.id,
    );
    expect(changedPair).toBeDefined();
  });

  // ─── findBySubjectPredicate ────────────────────────────────────────────────

  it('should find active facts by subject and predicate', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('find-sp', {
      subject: 'auth-module',
      predicate: 'framework',
      object: 'Express',
    });
    await store.create(fact);
    createdIds.push(fact.id);

    const results = await store.findBySubjectPredicate('auth-module', 'framework');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((f) => f.id === fact.id);
    expect(found).toBeDefined();
    expect(found!.object).toBe('Express');
  });

  // ─── edge cases: empty source_episode_ids ─────────────────────────────────

  it('should create a fact with empty source_episode_ids', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('empty-sources', { source_episode_ids: [] });
    const id = await store.create(fact);
    createdIds.push(id);

    const fetched = await store.getById(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.source_episode_ids).toEqual([]);
  });

  // ─── edge cases: diff with no changes ────────────────────────────────────

  it('diff() with same state at both timestamps returns empty diff', async () => {
    if (!neo4jAvailable) return;
    // Create a fact that is active across both timestamps
    const fact = makeFactNode('diff-stable', {
      subject: 'auth-module',
      predicate: 'stable_check',
      object: 'unchanged',
      valid_at: '2022-01-01T00:00:00.000Z',
    });
    await store.create(fact);
    createdIds.push(fact.id);

    const d = await store.diff(
      'auth-module',
      '2022-06-01T00:00:00.000Z',
      '2023-06-01T00:00:00.000Z',
    );
    // The same fact is active at both times, so it should not appear as added, invalidated, or changed
    const inAdded = d.added.find((f: { id: string }) => f.id === fact.id);
    const inInvalidated = d.invalidated.find((f: { id: string }) => f.id === fact.id);
    const inChanged = d.changed.find((c: { before: { id: string }; after: { id: string } }) => c.before.id === fact.id || c.after.id === fact.id);
    expect(inAdded).toBeUndefined();
    expect(inInvalidated).toBeUndefined();
    expect(inChanged).toBeUndefined();
  });

  // ─── edge cases: very long strings ────────────────────────────────────────

  it('should handle very long subject/predicate/object strings', async () => {
    if (!neo4jAvailable) return;
    const longStr = 'a'.repeat(5000);
    const fact = makeFactNode('long-strings', {
      subject: longStr,
      predicate: longStr,
      object: longStr,
    });
    const id = await store.create(fact);
    createdIds.push(id);

    const fetched = await store.getById(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.subject.length).toBe(5000);
    expect(fetched!.predicate.length).toBe(5000);
    expect(fetched!.object.length).toBe(5000);
  });

  // ─── edge cases: getActive evolution with include_invalidated ─────────────

  it('getActive evolution mode without include_invalidated excludes invalidated facts', async () => {
    if (!neo4jAvailable) return;
    const activeFact = makeFactNode('evo-mode-active', {
      subject: 'auth-module',
      valid_at: '2017-01-01T00:00:00.000Z',
      status: 'active',
    });
    const invalidatedFact = makeFactNode('evo-mode-inv', {
      subject: 'auth-module',
      valid_at: '2017-02-01T00:00:00.000Z',
      status: 'invalidated',
      invalid_at: '2017-06-01T00:00:00.000Z',
    });
    await store.create(activeFact);
    await store.create(invalidatedFact);
    createdIds.push(activeFact.id, invalidatedFact.id);

    // Without include_invalidated: should NOT include the invalidated fact
    const withoutInvalidated = await store.getActive('auth-module', {
      time_mode: 'evolution',
      include_invalidated: false,
    });
    expect(withoutInvalidated.find((f) => f.id === invalidatedFact.id)).toBeUndefined();
    expect(withoutInvalidated.find((f) => f.id === activeFact.id)).toBeDefined();

    // With include_invalidated: should include the invalidated fact
    const withInvalidated = await store.getActive('auth-module', {
      time_mode: 'evolution',
      include_invalidated: true,
    });
    expect(withInvalidated.find((f) => f.id === invalidatedFact.id)).toBeDefined();
    expect(withInvalidated.find((f) => f.id === activeFact.id)).toBeDefined();
  });

  // ─── setEmbedding ─────────────────────────────────────────────────────────

  it('should set embedding on a fact', async () => {
    if (!neo4jAvailable) return;
    const fact = makeFactNode('embed');
    await store.create(fact);
    createdIds.push(fact.id);

    const embedding = Array.from({ length: 8 }, (_, i) => i * 0.1);
    await store.setEmbedding(fact.id, embedding);

    const session = driver.session();
    try {
      const result = await session.run(
        'MATCH (f:Fact {id: $id}) RETURN f.embedding AS emb',
        { id: fact.id },
      );
      const emb = result.records[0].get('emb');
      expect(emb).not.toBeNull();
      expect(Array.isArray(emb)).toBe(true);
    } finally {
      await session.close();
    }
  });
});
