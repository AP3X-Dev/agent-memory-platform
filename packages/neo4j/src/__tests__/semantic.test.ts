// packages/neo4j/src/__tests__/semantic.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { SemanticStore } from '../semantic.js';
import type { SemanticNode } from '@memberry/core';

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

const TEST_PREFIX = `test-semantic-${Date.now()}`;

function makeSemanticNode(suffix: string): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: `${TEST_PREFIX}-${suffix}`,
    content: `Test semantic content for ${suffix}`,
    confidence: 0.8,
    signal_count: 3,
    created_at: now,
    updated_at: now,
    decay_class: 'stable',
    tags: ['test', suffix],
  };
}

describe('SemanticStore', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  let store: SemanticStore;

  const createdIds: string[] = [];

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping semantic tests`);
      return;
    }
    store = new SemanticStore(driver);
  });

  afterAll(async () => {
    if (neo4jAvailable && createdIds.length > 0) {
      const session = driver.session();
      try {
        // Detach and delete all test Semantic nodes
        await session.run(
          'MATCH (s:Semantic) WHERE s.id IN $ids DETACH DELETE s',
          { ids: createdIds }
        );
        // Clean up any test Episodic or Entity nodes created during tests
        await session.run(
          `MATCH (e:Episodic) WHERE e.id STARTS WITH $prefix DETACH DELETE e`,
          { prefix: TEST_PREFIX }
        );
        await session.run(
          `MATCH (e:Entity) WHERE e.id STARTS WITH $prefix DETACH DELETE e`,
          { prefix: TEST_PREFIX }
        );
      } finally {
        await session.close();
      }
    }
    await driver.close().catch(() => {});
  });

  it('should create a semantic node and return its id', async () => {
    if (!neo4jAvailable) return;
    const node = makeSemanticNode('create');
    const id = await store.create(node);
    createdIds.push(id);
    expect(id).toBe(node.id);
  });

  it('should create a semantic node with embedding', async () => {
    if (!neo4jAvailable) return;
    const node = makeSemanticNode('with-embedding');
    const embedding = Array.from({ length: 8 }, (_, i) => i * 0.1);
    const id = await store.create({ ...node, embedding });
    createdIds.push(id);
    expect(id).toBe(node.id);
  });

  it('should retrieve a semantic node by id', async () => {
    if (!neo4jAvailable) return;
    const node = makeSemanticNode('retrieve');
    const id = await store.create(node);
    createdIds.push(id);

    const fetched = await store.getById(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(node.id);
    expect(fetched!.content).toBe(node.content);
    expect(fetched!.confidence).toBe(node.confidence);
    expect(fetched!.signal_count).toBe(node.signal_count);
    expect(fetched!.decay_class).toBe(node.decay_class);
    expect(fetched!.tags).toEqual(node.tags);
    // No tenant specified → defaults to 'default'
    expect(fetched!.tenant_id).toBe('default');
  });

  it('should persist a non-default tenant_id and round-trip it', async () => {
    if (!neo4jAvailable) return;
    const node = { ...makeSemanticNode('tenant'), tenant_id: 'acme' };
    const id = await store.create(node);
    createdIds.push(id);

    const fetched = await store.getById(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.tenant_id).toBe('acme');
  });

  it('should carry the tenant_id forward when superseding', async () => {
    if (!neo4jAvailable) return;
    const oldNode = { ...makeSemanticNode('supersede-tenant-old'), tenant_id: 'acme' };
    const oldId = await store.create(oldNode);
    createdIds.push(oldId);

    const newNode = { ...makeSemanticNode('supersede-tenant-new'), tenant_id: 'acme' };
    const newId = await store.supersede(oldId, newNode);
    createdIds.push(newId);

    const fetched = await store.getById(newId);
    expect(fetched!.tenant_id).toBe('acme');
  });

  it('should return null for a non-existent id', async () => {
    if (!neo4jAvailable) return;
    const fetched = await store.getById('non-existent-id-xyz');
    expect(fetched).toBeNull();
  });

  it('should update confidence', async () => {
    if (!neo4jAvailable) return;
    const node = makeSemanticNode('update-confidence');
    const id = await store.create(node);
    createdIds.push(id);

    await store.updateConfidence(id, 0.95);

    const fetched = await store.getById(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.confidence).toBe(0.95);
  });

  it('should supersede an old node with a new one and create SUPERSEDES relationship', async () => {
    if (!neo4jAvailable) return;
    const oldNode = makeSemanticNode('supersede-old');
    const oldId = await store.create(oldNode);
    createdIds.push(oldId);

    const newNode = makeSemanticNode('supersede-new');
    const newId = await store.supersede(oldId, newNode);
    createdIds.push(newId);

    expect(newId).toBe(newNode.id);

    // Verify the SUPERSEDES relationship exists
    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (new:Semantic {id: $newId})-[:SUPERSEDES]->(old:Semantic {id: $oldId})
         RETURN count(*) AS cnt`,
        { newId, oldId }
      );
      const cnt = result.records[0].get('cnt') as { toNumber: () => number } | number;
      const count = typeof cnt === 'object' ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await session.close();
    }
  });

  it('should promote from episodic and create PROMOTED_FROM relationship', async () => {
    if (!neo4jAvailable) return;

    // Create a test Episodic node first
    const episodicId = `${TEST_PREFIX}-episodic`;
    const session = driver.session();
    try {
      await session.run(
        `CREATE (:Episodic {
          id: $id,
          session_id: 'test-session',
          agent_id: 'test-agent',
          task: 'test-task',
          content: 'test episodic content',
          created_at: $now
        })`,
        { id: episodicId, now: new Date().toISOString() }
      );
    } finally {
      await session.close();
    }

    const newNode = makeSemanticNode('promoted');
    const newId = await store.promoteFromEpisodic(episodicId, newNode);
    createdIds.push(newId);

    expect(newId).toBe(newNode.id);

    // Verify the PROMOTED_FROM relationship exists
    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `MATCH (s:Semantic {id: $newId})-[:PROMOTED_FROM]->(ep:Episodic {id: $episodicId})
         RETURN count(*) AS cnt`,
        { newId, episodicId }
      );
      const cnt = result.records[0].get('cnt') as { toNumber: () => number } | number;
      const count = typeof cnt === 'object' ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await verifySession.close();
    }
  });

  it('should link a semantic node to an entity via ABOUT relationship', async () => {
    if (!neo4jAvailable) return;

    // Create a test Entity node
    const entityId = `${TEST_PREFIX}-entity`;
    const session = driver.session();
    try {
      await session.run(
        `CREATE (:Entity {id: $id, name: 'Test Entity', type: 'test', created_at: $now})`,
        { id: entityId, now: new Date().toISOString() }
      );
    } finally {
      await session.close();
    }

    const node = makeSemanticNode('about-entity');
    const semanticId = await store.create(node);
    createdIds.push(semanticId);

    await store.linkToEntity(semanticId, entityId);

    // Verify the ABOUT relationship exists
    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `MATCH (s:Semantic {id: $semanticId})-[:ABOUT]->(e:Entity {id: $entityId})
         RETURN count(*) AS cnt`,
        { semanticId, entityId }
      );
      const cnt = result.records[0].get('cnt') as { toNumber: () => number } | number;
      const count = typeof cnt === 'object' ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await verifySession.close();
    }
  });

  it('should be idempotent when linking to entity (MERGE)', async () => {
    if (!neo4jAvailable) return;

    const entityId = `${TEST_PREFIX}-entity-merge`;
    const session = driver.session();
    try {
      await session.run(
        `CREATE (:Entity {id: $id, name: 'Merge Entity', type: 'test', created_at: $now})`,
        { id: entityId, now: new Date().toISOString() }
      );
    } finally {
      await session.close();
    }

    const node = makeSemanticNode('merge-about');
    const semanticId = await store.create(node);
    createdIds.push(semanticId);

    // Call twice — should not create duplicate relationships
    await store.linkToEntity(semanticId, entityId);
    await store.linkToEntity(semanticId, entityId);

    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `MATCH (s:Semantic {id: $semanticId})-[:ABOUT]->(e:Entity {id: $entityId})
         RETURN count(*) AS cnt`,
        { semanticId, entityId }
      );
      const cnt = result.records[0].get('cnt') as { toNumber: () => number } | number;
      const count = typeof cnt === 'object' ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await verifySession.close();
    }
  });
});
