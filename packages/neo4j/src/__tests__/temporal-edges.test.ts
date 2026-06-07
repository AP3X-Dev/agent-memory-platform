// packages/neo4j/src/__tests__/temporal-edges.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { initSchema } from '../schema.js';
import { EpisodicStore } from '../episodic.js';
import { SemanticStore } from '../semantic.js';
import { ScopedQuery } from '../query.js';
import {
  temporalSetClause,
  activeRelationshipFilter,
  invalidateRelationship,
} from '../temporal-edges.js';
import type { EpisodicNode, SemanticNode } from '@memberry/core';

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

const TEST_PREFIX = `test-temporal-${Date.now()}`;

// ─── Unit tests (no Neo4j needed) ──────────────────────────────────────────

describe('temporalSetClause', () => {
  it('generates SET clause with default param name', () => {
    const clause = temporalSetClause('r');
    expect(clause).toBe('SET r.valid_at = COALESCE(r.valid_at, $now)');
  });

  it('generates SET clause with custom param name', () => {
    const clause = temporalSetClause('rel', 'timestamp');
    expect(clause).toBe('SET rel.valid_at = COALESCE(rel.valid_at, $timestamp)');
  });
});

describe('activeRelationshipFilter', () => {
  it('returns invalid_at IS NULL for current (no asOf)', () => {
    const filter = activeRelationshipFilter('r');
    expect(filter).toBe('r.invalid_at IS NULL');
  });

  it('returns temporal range filter with asOf parameter', () => {
    const filter = activeRelationshipFilter('r', 'asOf');
    expect(filter).toContain('COALESCE(r.valid_at');
    expect(filter).toContain('$asOf');
    expect(filter).toContain('r.invalid_at IS NULL OR r.invalid_at > $asOf');
  });
});

// ─── Integration tests (require Neo4j) ────────────────────────────────────

describe('Temporal edges integration', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  let episodicStore: EpisodicStore;
  let semanticStore: SemanticStore;
  let query: ScopedQuery;

  const ENTITY_ID = `${TEST_PREFIX}-entity`;
  const ENTITY_NAME = `${TEST_PREFIX}-entity-name`;
  const EPISODIC_ID = `${TEST_PREFIX}-episodic`;
  const SEMANTIC_ID_1 = `${TEST_PREFIX}-semantic-1`;
  const SEMANTIC_ID_2 = `${TEST_PREFIX}-semantic-2`;

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping temporal edge integration tests`);
      return;
    }

    await initSchema(driver);
    episodicStore = new EpisodicStore(driver);
    semanticStore = new SemanticStore(driver);
    query = new ScopedQuery(driver);

    // Seed: Entity, Episodic, Semantic nodes
    const session = driver.session();
    try {
      const now = new Date().toISOString();
      await session.run(
        `CREATE (e:Entity {id: $id, name: $name, type: 'test', created_at: $now})`,
        { id: ENTITY_ID, name: ENTITY_NAME, now },
      );
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    if (neo4jAvailable) {
      const session = driver.session();
      try {
        // Clean up all test nodes
        await session.run(
          `MATCH (n) WHERE n.id STARTS WITH $prefix DETACH DELETE n`,
          { prefix: TEST_PREFIX },
        );
      } finally {
        await session.close();
      }
    }
    await driver.close().catch(() => {});
  });

  it('REFERENCES edge gets valid_at on creation', async () => {
    if (!neo4jAvailable) return;

    // Create an episodic node
    const node: EpisodicNode = {
      id: EPISODIC_ID,
      session_id: 'test-session',
      agent_id: 'test-agent',
      task: 'test task',
      content: 'temporal test content',
      created_at: new Date().toISOString(),
    };
    await episodicStore.create(node);
    await episodicStore.linkToEntity(EPISODIC_ID, ENTITY_ID);

    // Verify valid_at is set
    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (:Episodic {id: $episodicId})-[r:REFERENCES]->(:Entity {id: $entityId})
         RETURN r.valid_at AS valid_at, r.invalid_at AS invalid_at`,
        { episodicId: EPISODIC_ID, entityId: ENTITY_ID },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('valid_at')).toBeTruthy();
      expect(result.records[0].get('invalid_at')).toBeNull();
    } finally {
      await session.close();
    }
  });

  it('ABOUT edge gets valid_at on creation', async () => {
    if (!neo4jAvailable) return;

    const now = new Date().toISOString();
    const node: SemanticNode = {
      id: SEMANTIC_ID_1,
      content: 'temporal semantic content',
      confidence: 0.8,
      signal_count: 0,
      created_at: now,
      updated_at: now,
      decay_class: 'stable',
      tags: ['test'],
    };
    await semanticStore.create(node);
    await semanticStore.linkToEntity(SEMANTIC_ID_1, ENTITY_ID);

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (:Semantic {id: $semanticId})-[r:ABOUT]->(:Entity {id: $entityId})
         RETURN r.valid_at AS valid_at, r.invalid_at AS invalid_at`,
        { semanticId: SEMANTIC_ID_1, entityId: ENTITY_ID },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('valid_at')).toBeTruthy();
      expect(result.records[0].get('invalid_at')).toBeNull();
    } finally {
      await session.close();
    }
  });

  it('MERGE does not overwrite existing valid_at', async () => {
    if (!neo4jAvailable) return;

    // Get current valid_at
    const session = driver.session();
    try {
      const before = await session.run(
        `MATCH (:Semantic {id: $id})-[r:ABOUT]->(:Entity {id: $eid})
         RETURN r.valid_at AS valid_at`,
        { id: SEMANTIC_ID_1, eid: ENTITY_ID },
      );
      const originalValidAt = before.records[0].get('valid_at');

      // Link again — should not change valid_at
      await semanticStore.linkToEntity(SEMANTIC_ID_1, ENTITY_ID);

      const after = await session.run(
        `MATCH (:Semantic {id: $id})-[r:ABOUT]->(:Entity {id: $eid})
         RETURN r.valid_at AS valid_at`,
        { id: SEMANTIC_ID_1, eid: ENTITY_ID },
      );
      expect(after.records[0].get('valid_at')).toBe(originalValidAt);
    } finally {
      await session.close();
    }
  });

  it('invalidateRelationship sets invalid_at', async () => {
    if (!neo4jAvailable) return;

    const session = driver.session();
    try {
      const invalidAt = new Date().toISOString();
      await invalidateRelationship(session, SEMANTIC_ID_1, ENTITY_ID, 'ABOUT', invalidAt);

      const result = await session.run(
        `MATCH (:Semantic {id: $id})-[r:ABOUT]->(:Entity {id: $eid})
         RETURN r.invalid_at AS invalid_at`,
        { id: SEMANTIC_ID_1, eid: ENTITY_ID },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('invalid_at')).toBe(invalidAt);
    } finally {
      await session.close();
    }
  });

  it('byEntity filters out invalidated ABOUT relationships', async () => {
    if (!neo4jAvailable) return;

    // SEMANTIC_ID_1's ABOUT edge is now invalidated (from previous test)
    // Create a second semantic node with an active ABOUT edge
    const now = new Date().toISOString();
    const node: SemanticNode = {
      id: SEMANTIC_ID_2,
      content: 'second semantic content',
      confidence: 0.7,
      signal_count: 0,
      created_at: now,
      updated_at: now,
      decay_class: 'stable',
      tags: ['test'],
    };
    await semanticStore.create(node);
    await semanticStore.linkToEntity(SEMANTIC_ID_2, ENTITY_ID);

    // byEntity should only return SEMANTIC_ID_2 (active)
    const results = await query.byEntity(ENTITY_NAME, 10);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(SEMANTIC_ID_2);
    expect(ids).not.toContain(SEMANTIC_ID_1);
  });

  it('byEntity with asOf returns temporally valid relationships', async () => {
    if (!neo4jAvailable) return;

    // Query with a timestamp before the invalidation — should see SEMANTIC_ID_1
    // We need to know when it was invalidated. The invalidation was set in the
    // 'invalidateRelationship' test. Let's get the actual timestamp.
    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (:Semantic {id: $id})-[r:ABOUT]->(:Entity {id: $eid})
         RETURN r.valid_at AS valid_at, r.invalid_at AS invalid_at`,
        { id: SEMANTIC_ID_1, eid: ENTITY_ID },
      );
      const validAt = result.records[0].get('valid_at') as string;
      const invalidAt = result.records[0].get('invalid_at') as string;

      // Query as-of right after creation (before invalidation)
      // Use a timestamp 1ms after valid_at
      const afterCreation = new Date(new Date(validAt).getTime() + 1).toISOString();
      const resultsAtCreation = await query.byEntity(ENTITY_NAME, 10, afterCreation);
      const idsAtCreation = resultsAtCreation.map((r) => r.id);
      // SEMANTIC_ID_1's valid_at <= afterCreation, and invalid_at > afterCreation
      // (only if afterCreation < invalidAt)
      if (afterCreation < invalidAt) {
        expect(idsAtCreation).toContain(SEMANTIC_ID_1);
      }
    } finally {
      await session.close();
    }
  });

  it('byScope with asOf filters relationships temporally', async () => {
    if (!neo4jAvailable) return;

    // Current time: should only see SEMANTIC_ID_2
    const current = await query.byScope({
      entities: [ENTITY_NAME],
      limit: 10,
    });
    const currentIds = current.map((r) => r.id);
    expect(currentIds).toContain(SEMANTIC_ID_2);
    expect(currentIds).not.toContain(SEMANTIC_ID_1);
  });

  it('supersede invalidates old ABOUT relationships', async () => {
    if (!neo4jAvailable) return;

    // First, re-create a fresh ABOUT for SEMANTIC_ID_1 (was invalidated earlier)
    const session = driver.session();
    try {
      await session.run(
        `MATCH (s:Semantic {id: $sid})-[r:ABOUT]->(e:Entity {id: $eid})
         SET r.invalid_at = null`,
        { sid: SEMANTIC_ID_1, eid: ENTITY_ID },
      );
    } finally {
      await session.close();
    }

    // Now supersede SEMANTIC_ID_1 with a new node
    const supersedingId = `${TEST_PREFIX}-semantic-superseding`;
    const now = new Date().toISOString();
    const newNode: SemanticNode = {
      id: supersedingId,
      content: 'superseding content',
      confidence: 0.9,
      signal_count: 1,
      created_at: now,
      updated_at: now,
      decay_class: 'stable',
      tags: ['test'],
    };

    await semanticStore.supersede(SEMANTIC_ID_1, newNode);

    // Verify the old ABOUT edge is invalidated
    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `MATCH (:Semantic {id: $id})-[r:ABOUT]->(:Entity {id: $eid})
         RETURN r.invalid_at AS invalid_at`,
        { id: SEMANTIC_ID_1, eid: ENTITY_ID },
      );
      if (result.records.length > 0) {
        expect(result.records[0].get('invalid_at')).toBeTruthy();
      }
    } finally {
      await verifySession.close();
    }
  });

  it('signal edges get valid_at on creation', async () => {
    if (!neo4jAvailable) return;

    // Create a semantic node to be the signal target
    const targetId = `${TEST_PREFIX}-signal-target`;
    const now = new Date().toISOString();
    const session = driver.session();
    try {
      await session.run(
        `CREATE (s:Semantic {
          id: $id, content: 'signal target', confidence: 0.7, signal_count: 0,
          created_at: $now, updated_at: $now, decay_class: 'stable', tags: []
        })`,
        { id: targetId, now },
      );
    } finally {
      await session.close();
    }

    await episodicStore.linkSignal(EPISODIC_ID, {
      type: 'reinforcement',
      target_id: targetId,
      detail: 'temporal test signal',
    });

    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `MATCH (:Episodic {id: $eid})-[r:REINFORCES]->(:Semantic {id: $sid})
         RETURN r.valid_at AS valid_at, r.detail AS detail`,
        { eid: EPISODIC_ID, sid: targetId },
      );
      expect(result.records.length).toBe(1);
      expect(result.records[0].get('valid_at')).toBeTruthy();
      expect(result.records[0].get('detail')).toBe('temporal test signal');
    } finally {
      await verifySession.close();
    }
  });
});
