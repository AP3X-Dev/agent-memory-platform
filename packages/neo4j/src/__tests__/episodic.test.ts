// packages/neo4j/src/__tests__/episodic.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { initSchema } from '../schema.js';
import { EpisodicStore } from '../episodic.js';
import type { EpisodicNode, Signal } from '@amp/core';

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

const TEST_EPISODIC_ID = 'test-episodic-001';
const TEST_AGENT_ID = 'test-agent-001';
const TEST_ENTITY_ID = 'test-entity-001';
const TEST_MODEL_ID = 'test-model-001';
const TEST_SEMANTIC_ID = 'test-semantic-001';

describe('EpisodicStore', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  let store: EpisodicStore;

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping episodic tests`);
      return;
    }

    store = new EpisodicStore(driver);
    await initSchema(driver);

    // Create supporting nodes used in relationship tests
    const session = driver.session();
    try {
      await session.run(
        `MERGE (a:Agent {id: $id}) ON CREATE SET a.name = 'Test Agent', a.type = 'test', a.created_at = $now`,
        { id: TEST_AGENT_ID, now: new Date().toISOString() },
      );
      await session.run(
        `MERGE (e:Entity {id: $id}) ON CREATE SET e.name = 'Test Entity', e.type = 'test', e.created_at = $now`,
        { id: TEST_ENTITY_ID, now: new Date().toISOString() },
      );
      await session.run(
        `MERGE (m:Model {id: $id}) ON CREATE SET m.name = 'Test Model', m.provider = 'test'`,
        { id: TEST_MODEL_ID },
      );
      await session.run(
        `MERGE (s:Semantic {id: $id}) ON CREATE SET s.content = 'Test semantic', s.confidence = 0.8, s.signal_count = 0, s.created_at = $now, s.updated_at = $now, s.decay_class = 'stable', s.tags = []`,
        { id: TEST_SEMANTIC_ID, now: new Date().toISOString() },
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
          `MATCH (e:Episodic {id: $id}) DETACH DELETE e`,
          { id: TEST_EPISODIC_ID },
        );
        await session.run(
          `MATCH (a:Agent {id: $id}) DETACH DELETE a`,
          { id: TEST_AGENT_ID },
        );
        await session.run(
          `MATCH (ent:Entity {id: $id}) DETACH DELETE ent`,
          { id: TEST_ENTITY_ID },
        );
        await session.run(
          `MATCH (m:Model {id: $id}) DETACH DELETE m`,
          { id: TEST_MODEL_ID },
        );
        await session.run(
          `MATCH (s:Semantic {id: $id}) DETACH DELETE s`,
          { id: TEST_SEMANTIC_ID },
        );
      } finally {
        await session.close();
      }
    }
    await driver.close().catch(() => {});
  });

  it('should create an episodic node and return its id', async () => {
    if (!neo4jAvailable) return;

    const node: EpisodicNode = {
      id: TEST_EPISODIC_ID,
      session_id: 'session-001',
      agent_id: TEST_AGENT_ID,
      task: 'test task',
      content: 'Test episodic content',
      outcome: 'approved',
      created_at: new Date().toISOString(),
      ttl: 3600,
    };

    const returnedId = await store.create(node);
    expect(returnedId).toBe(TEST_EPISODIC_ID);
  });

  it('should retrieve an episodic node by id', async () => {
    if (!neo4jAvailable) return;

    const result = await store.getById(TEST_EPISODIC_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(TEST_EPISODIC_ID);
    expect(result!.session_id).toBe('session-001');
    expect(result!.agent_id).toBe(TEST_AGENT_ID);
    expect(result!.task).toBe('test task');
    expect(result!.content).toBe('Test episodic content');
    expect(result!.outcome).toBe('approved');
    expect(result!.ttl).toBe(3600);
  });

  it('should return null for a non-existent id', async () => {
    if (!neo4jAvailable) return;

    const result = await store.getById('non-existent-id');
    expect(result).toBeNull();
  });

  it('should store an embedding when provided', async () => {
    if (!neo4jAvailable) return;

    const embeddingNode: EpisodicNode = {
      id: 'test-episodic-embedding',
      session_id: 'session-001',
      agent_id: TEST_AGENT_ID,
      task: 'embedding test',
      content: 'Content with embedding',
      created_at: new Date().toISOString(),
      embedding: [0.1, 0.2, 0.3],
    };

    await store.create(embeddingNode);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Episodic {id: $id}) RETURN e.embedding AS embedding`,
        { id: 'test-episodic-embedding' },
      );
      expect(result.records.length).toBe(1);
      const embedding = result.records[0].get('embedding') as number[];
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
    } finally {
      await session.close();
      // Clean up
      const cleanSession = driver.session();
      try {
        await cleanSession.run(
          `MATCH (e:Episodic {id: $id}) DETACH DELETE e`,
          { id: 'test-episodic-embedding' },
        );
      } finally {
        await cleanSession.close();
      }
    }
  });

  it('should link an episodic node to an agent via GENERATED_BY', async () => {
    if (!neo4jAvailable) return;

    await store.linkToAgent(TEST_EPISODIC_ID, TEST_AGENT_ID);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Episodic {id: $episodicId})-[:GENERATED_BY]->(a:Agent {id: $agentId})
         RETURN count(*) AS cnt`,
        { episodicId: TEST_EPISODIC_ID, agentId: TEST_AGENT_ID },
      );
      const cnt = result.records[0].get('cnt') as { low: number };
      expect(cnt.low ?? cnt).toBeGreaterThanOrEqual(1);
    } finally {
      await session.close();
    }
  });

  it('should link an episodic node to an entity via REFERENCES', async () => {
    if (!neo4jAvailable) return;

    await store.linkToEntity(TEST_EPISODIC_ID, TEST_ENTITY_ID);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Episodic {id: $episodicId})-[:REFERENCES]->(ent:Entity {id: $entityId})
         RETURN count(*) AS cnt`,
        { episodicId: TEST_EPISODIC_ID, entityId: TEST_ENTITY_ID },
      );
      const cnt = result.records[0].get('cnt') as { low: number };
      expect(cnt.low ?? cnt).toBeGreaterThanOrEqual(1);
    } finally {
      await session.close();
    }
  });

  it('should link an episodic node to a model via USED_MODEL', async () => {
    if (!neo4jAvailable) return;

    await store.linkToModel(TEST_EPISODIC_ID, TEST_MODEL_ID);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Episodic {id: $episodicId})-[:USED_MODEL]->(m:Model {id: $modelId})
         RETURN count(*) AS cnt`,
        { episodicId: TEST_EPISODIC_ID, modelId: TEST_MODEL_ID },
      );
      const cnt = result.records[0].get('cnt') as { low: number };
      expect(cnt.low ?? cnt).toBeGreaterThanOrEqual(1);
    } finally {
      await session.close();
    }
  });

  it('should link a reinforcement signal via REINFORCES', async () => {
    if (!neo4jAvailable) return;

    const signal: Signal = {
      type: 'reinforcement',
      target_id: TEST_SEMANTIC_ID,
      detail: 'Good result',
    };

    await store.linkSignal(TEST_EPISODIC_ID, signal);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Episodic {id: $episodicId})-[r:REINFORCES]->(s:Semantic {id: $semanticId})
         RETURN r.detail AS detail`,
        { episodicId: TEST_EPISODIC_ID, semanticId: TEST_SEMANTIC_ID },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('detail')).toBe('Good result');
    } finally {
      await session.close();
    }
  });

  it('should link a correction signal via CORRECTS', async () => {
    if (!neo4jAvailable) return;

    const correctionSemanticId = 'test-semantic-correction';
    const session1 = driver.session();
    try {
      await session1.run(
        `MERGE (s:Semantic {id: $id}) ON CREATE SET s.content = 'Correction target', s.confidence = 0.5, s.signal_count = 0, s.created_at = $now, s.updated_at = $now, s.decay_class = 'volatile', s.tags = []`,
        { id: correctionSemanticId, now: new Date().toISOString() },
      );
    } finally {
      await session1.close();
    }

    const signal: Signal = {
      type: 'correction',
      target_id: correctionSemanticId,
      detail: 'Needs correction',
    };

    await store.linkSignal(TEST_EPISODIC_ID, signal);

    const session2 = driver.session();
    try {
      const result = await session2.run(
        `MATCH (e:Episodic {id: $episodicId})-[r:CORRECTS]->(s:Semantic {id: $semanticId})
         RETURN r.detail AS detail`,
        { episodicId: TEST_EPISODIC_ID, semanticId: correctionSemanticId },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('detail')).toBe('Needs correction');
    } finally {
      await session2.close();
      const cleanSession = driver.session();
      try {
        await cleanSession.run(
          `MATCH (s:Semantic {id: $id}) DETACH DELETE s`,
          { id: correctionSemanticId },
        );
      } finally {
        await cleanSession.close();
      }
    }
  });

  it('should link a contradiction signal via CONTRADICTS', async () => {
    if (!neo4jAvailable) return;

    const contradictionSemanticId = 'test-semantic-contradiction';
    const session1 = driver.session();
    try {
      await session1.run(
        `MERGE (s:Semantic {id: $id}) ON CREATE SET s.content = 'Contradiction target', s.confidence = 0.4, s.signal_count = 0, s.created_at = $now, s.updated_at = $now, s.decay_class = 'volatile', s.tags = []`,
        { id: contradictionSemanticId, now: new Date().toISOString() },
      );
    } finally {
      await session1.close();
    }

    const signal: Signal = {
      type: 'contradiction',
      target_id: contradictionSemanticId,
      detail: 'Contradicts existing belief',
    };

    await store.linkSignal(TEST_EPISODIC_ID, signal);

    const session2 = driver.session();
    try {
      const result = await session2.run(
        `MATCH (e:Episodic {id: $episodicId})-[r:CONTRADICTS]->(s:Semantic {id: $semanticId})
         RETURN r.detail AS detail`,
        { episodicId: TEST_EPISODIC_ID, semanticId: contradictionSemanticId },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('detail')).toBe('Contradicts existing belief');
    } finally {
      await session2.close();
      const cleanSession = driver.session();
      try {
        await cleanSession.run(
          `MATCH (s:Semantic {id: $id}) DETACH DELETE s`,
          { id: contradictionSemanticId },
        );
      } finally {
        await cleanSession.close();
      }
    }
  });
});
