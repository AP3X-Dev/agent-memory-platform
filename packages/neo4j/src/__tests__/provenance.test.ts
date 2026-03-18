// packages/neo4j/src/__tests__/provenance.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { ProvenanceTraversal } from '../provenance.js';

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

describe('ProvenanceTraversal', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);

  // Fixed IDs for the provenance chain seeded in beforeAll
  const ep1Id = 'prov-test-ep1';
  const sem1Id = 'prov-test-sem1';
  const sem2Id = 'prov-test-sem2';

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping provenance tests`);
      return;
    }

    // Seed test data: ep1 <-[PROMOTED_FROM]- sem1 <-[SUPERSEDES]- sem2
    // sem2 -[PROMOTED_FROM]-> sem1 -[PROMOTED_FROM]-> ep1
    // sem2 -[SUPERSEDES]-> sem1
    const session = driver.session();
    try {
      // Clean up any leftover nodes from previous runs
      await session.run(
        `MATCH (n) WHERE n.id IN [$ep1, $sem1, $sem2] DETACH DELETE n`,
        { ep1: ep1Id, sem1: sem1Id, sem2: sem2Id },
      );

      // Create ep1 (Episodic)
      await session.run(
        `CREATE (e:Episodic {
           id: $id,
           content: 'Episodic origin content',
           session_id: 'prov-session',
           agent_id: 'prov-agent',
           task: 'prov-task',
           created_at: '2024-01-01T00:00:00Z'
         })`,
        { id: ep1Id },
      );

      // Create sem1 (Semantic promoted from ep1)
      await session.run(
        `CREATE (s:Semantic {
           id: $id,
           content: 'Semantic v1 content',
           confidence: 0.7,
           signal_count: 3,
           created_at: '2024-01-02T00:00:00Z',
           updated_at: '2024-01-02T00:00:00Z',
           decay_class: 'stable',
           tags: []
         })`,
        { id: sem1Id },
      );

      // Create sem2 (Semantic superseding sem1)
      await session.run(
        `CREATE (s:Semantic {
           id: $id,
           content: 'Semantic v2 content',
           confidence: 0.9,
           signal_count: 7,
           created_at: '2024-01-03T00:00:00Z',
           updated_at: '2024-01-03T00:00:00Z',
           decay_class: 'stable',
           tags: []
         })`,
        { id: sem2Id },
      );

      // Link sem1 -[PROMOTED_FROM]-> ep1
      await session.run(
        `MATCH (s:Semantic {id: $sem1}), (e:Episodic {id: $ep1})
         CREATE (s)-[:PROMOTED_FROM]->(e)`,
        { sem1: sem1Id, ep1: ep1Id },
      );

      // Link sem2 -[SUPERSEDES]-> sem1
      await session.run(
        `MATCH (s2:Semantic {id: $sem2}), (s1:Semantic {id: $sem1})
         CREATE (s2)-[:SUPERSEDES]->(s1)`,
        { sem2: sem2Id, sem1: sem1Id },
      );
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    if (neo4jAvailable) {
      const session = driver.session();
      try {
        await session.run(
          `MATCH (n) WHERE n.id IN [$ep1, $sem1, $sem2] DETACH DELETE n`,
          { ep1: ep1Id, sem1: sem1Id, sem2: sem2Id },
        );
      } finally {
        await session.close();
      }
    }
    await driver.close().catch(() => {});
  });

  it('traceOrigin returns nodes reachable via SUPERSEDES|PROMOTED_FROM from sem2', async () => {
    if (!neo4jAvailable) return;
    const traversal = new ProvenanceTraversal(driver);
    const nodes = await traversal.traceOrigin(sem2Id);

    // sem2 -[SUPERSEDES]-> sem1 -[PROMOTED_FROM]-> ep1
    // So traceOrigin(sem2) should find at least sem1 and ep1
    expect(nodes.length).toBeGreaterThanOrEqual(2);

    const ids = nodes.map(n => n.id);
    expect(ids).toContain(sem1Id);
    expect(ids).toContain(ep1Id);
  });

  it('traceOrigin nodes have required ProvenanceNode fields', async () => {
    if (!neo4jAvailable) return;
    const traversal = new ProvenanceTraversal(driver);
    const nodes = await traversal.traceOrigin(sem2Id);

    for (const node of nodes) {
      expect(typeof node.id).toBe('string');
      expect(typeof node.label).toBe('string');
      expect(typeof node.content).toBe('string');
      expect(typeof node.relationship).toBe('string');
    }
  });

  it('traceOrigin returns empty array for node with no outgoing provenance edges', async () => {
    if (!neo4jAvailable) return;
    const traversal = new ProvenanceTraversal(driver);
    // ep1 has no outgoing SUPERSEDES/PROMOTED_FROM edges
    const nodes = await traversal.traceOrigin(ep1Id);
    expect(nodes).toEqual([]);
  });

  it('supersessionHistory returns sem1 when traced from sem2', async () => {
    if (!neo4jAvailable) return;
    const traversal = new ProvenanceTraversal(driver);
    const history = await traversal.supersessionHistory(sem2Id);

    expect(history.length).toBeGreaterThanOrEqual(1);
    const ids = history.map(h => h.id);
    expect(ids).toContain(sem1Id);
  });

  it('supersessionHistory entries have id, content, and confidence fields', async () => {
    if (!neo4jAvailable) return;
    const traversal = new ProvenanceTraversal(driver);
    const history = await traversal.supersessionHistory(sem2Id);

    for (const entry of history) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.content).toBe('string');
      expect(typeof entry.confidence).toBe('number');
    }
  });

  it('supersessionHistory returns empty array for node with no SUPERSEDES edges', async () => {
    if (!neo4jAvailable) return;
    const traversal = new ProvenanceTraversal(driver);
    const history = await traversal.supersessionHistory(sem1Id);
    expect(history).toEqual([]);
  });
});
