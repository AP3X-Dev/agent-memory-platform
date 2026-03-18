// packages/neo4j/src/__tests__/query.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { ScopedQuery } from '../query.js';

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

// ─── Seed helpers ────────────────────────────────────────────────────────────

const ENTITY_A = 'query-test-entity-A';
const ENTITY_B = 'query-test-entity-B';
const TAG_ALPHA = 'query-tag-alpha';
const TAG_BETA = 'query-tag-beta';

const SEMANTIC_IDS = [
  'qt-sem-1', 'qt-sem-2', 'qt-sem-3', 'qt-sem-4', 'qt-sem-5',
];

async function seedData(driver: ReturnType<typeof createNeo4jDriver>): Promise<void> {
  const session = driver.session();
  try {
    // Clean up first
    await session.run(
      `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`,
      { ids: SEMANTIC_IDS },
    );
    await session.run(
      `MATCH (e:Entity) WHERE e.name IN $names DETACH DELETE e`,
      { names: [ENTITY_A, ENTITY_B] },
    );

    // Create entities
    await session.run(
      `CREATE (e:Entity {id: 'qt-ent-a', name: $name, type: 'test', created_at: '2024-01-01'})`,
      { name: ENTITY_A },
    );
    await session.run(
      `CREATE (e:Entity {id: 'qt-ent-b', name: $name, type: 'test', created_at: '2024-01-01'})`,
      { name: ENTITY_B },
    );

    // Semantic nodes linked to ENTITY_A with TAG_ALPHA
    for (let i = 0; i < 3; i++) {
      const id = SEMANTIC_IDS[i]!;
      await session.run(
        `CREATE (s:Semantic {
           id: $id, content: $content,
           confidence: $confidence, signal_count: 1,
           created_at: '2024-01-01', updated_at: '2024-01-01',
           decay_class: 'stable', tags: $tags
         })`,
        {
          id,
          content: `Semantic content ${i}`,
          confidence: 0.9 - i * 0.1,
          tags: [TAG_ALPHA],
        },
      );
      await session.run(
        `MATCH (s:Semantic {id: $id}), (e:Entity {name: $name})
         MERGE (s)-[:ABOUT]->(e)`,
        { id, name: ENTITY_A },
      );
    }

    // Semantic nodes linked to ENTITY_B with TAG_BETA
    for (let i = 3; i < 5; i++) {
      const id = SEMANTIC_IDS[i]!;
      await session.run(
        `CREATE (s:Semantic {
           id: $id, content: $content,
           confidence: $confidence, signal_count: 2,
           created_at: '2024-01-01', updated_at: '2024-01-01',
           decay_class: 'volatile', tags: $tags
         })`,
        {
          id,
          content: `Semantic content ${i}`,
          confidence: 0.75 - (i - 3) * 0.05,
          tags: [TAG_BETA],
        },
      );
      await session.run(
        `MATCH (s:Semantic {id: $id}), (e:Entity {name: $name})
         MERGE (s)-[:ABOUT]->(e)`,
        { id, name: ENTITY_B },
      );
    }
  } finally {
    await session.close();
  }
}

async function cleanupData(driver: ReturnType<typeof createNeo4jDriver>): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`,
      { ids: SEMANTIC_IDS },
    );
    await session.run(
      `MATCH (e:Entity) WHERE e.name IN $names DETACH DELETE e`,
      { names: [ENTITY_A, ENTITY_B] },
    );
    await session.run(
      `MATCH (e:Entity {id: 'qt-ent-a'}) DETACH DELETE e`,
    );
    await session.run(
      `MATCH (e:Entity {id: 'qt-ent-b'}) DETACH DELETE e`,
    );
  } finally {
    await session.close();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScopedQuery', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  let query: ScopedQuery;

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping query tests`);
      return;
    }
    await seedData(driver);
    query = new ScopedQuery(driver);
  });

  afterAll(async () => {
    if (neo4jAvailable) {
      await cleanupData(driver);
    }
    await driver.close().catch(() => {});
  });

  it('byEntity returns semantics linked to entity, ordered by confidence', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byEntity(ENTITY_A, 10);
    expect(results.length).toBe(3);
    // Should be ordered by confidence DESC
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.confidence).toBeGreaterThanOrEqual(results[i + 1]!.confidence);
    }
  });

  it('byEntity respects limit', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byEntity(ENTITY_A, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('byEntity returns empty for unknown entity', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byEntity('no-such-entity', 10);
    expect(results).toHaveLength(0);
  });

  it('byTag returns semantics with given tag', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byTag(TAG_ALPHA, 10);
    expect(results.length).toBe(3);
    expect(results.every((r) => r.tags.includes(TAG_ALPHA))).toBe(true);
  });

  it('byTag returns empty for unknown tag', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byTag('no-such-tag', 10);
    expect(results).toHaveLength(0);
  });

  it('byScope with entity filter returns only matching entity semantics', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byScope({ entities: [ENTITY_B], limit: 10 });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.tags.includes(TAG_BETA))).toBe(true);
  });

  it('byScope with tag filter returns only tagged semantics', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byScope({ tags: [TAG_ALPHA], limit: 10 });
    expect(results.length).toBe(3);
  });

  it('byScope with entity + tag returns DISTINCT combined results', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byScope({
      entities: [ENTITY_A],
      tags: [TAG_ALPHA],
      limit: 10,
    });
    // All 3 from ENTITY_A also have TAG_ALPHA
    expect(results.length).toBe(3);
    // No duplicates
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('byScope with no filters returns results up to limit', async () => {
    if (!neo4jAvailable) return;
    const results = await query.byScope({ limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('rawCypher executes arbitrary Cypher and returns records', async () => {
    if (!neo4jAvailable) return;
    const results = await query.rawCypher(
      `MATCH (s:Semantic) WHERE s.id IN ['qt-sem-1', 'qt-sem-2'] RETURN s`,
      10,
    );
    expect(results.length).toBe(2);
    expect(results[0]).toHaveProperty('s');
  });

  it('rawCypher appends LIMIT when not present', async () => {
    if (!neo4jAvailable) return;
    const results = await query.rawCypher(
      `MATCH (s:Semantic) WHERE s.id IN ['qt-sem-1', 'qt-sem-2', 'qt-sem-3'] RETURN s`,
      2,
    );
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('rawCypher does not double-add LIMIT when query already has LIMIT', async () => {
    if (!neo4jAvailable) return;
    const results = await query.rawCypher(
      `MATCH (s:Semantic) WHERE s.id IN ['qt-sem-1', 'qt-sem-2', 'qt-sem-3'] RETURN s LIMIT 1`,
      100,
    );
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
