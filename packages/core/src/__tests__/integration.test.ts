// packages/core/src/__tests__/integration.test.ts
//
// Full integration smoke test: STORE → LOAD → cache pipeline.
// Requires real Redis + Neo4j connections, OPENAI_API_KEY, and RUN_LIVE_TESTS=1.
// The entire suite is skipped when any of those are unavailable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createRedisClient,
  ContextCache,
  SignalStream,
  DedupChecker,
  ConsolidationQueue,
  EmbeddingCache,
} from '@amp/redis';
import {
  createNeo4jDriver,
  initSchema,
  EpisodicStore,
  ScopedQuery,
} from '@amp/neo4j';
import { AMPService, OpenAIEmbedding } from '@amp/core';
import type { RedisLayer, Neo4jLayer } from '@amp/core';
import type { AMPConfig } from '@amp/core';

// ─── Environment / connection config ─────────────────────────────────────────

// `||` (not `??`) so an empty-string env var (e.g. NEO4J_URI="" in CI's unit
// job) falls back to a valid local default instead of an illegal empty host.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1';

// ─── Test-scoped IDs (cleaned up in afterAll) ─────────────────────────────────

const INT_SEMANTIC_ID = 'int-sem-1';
const INT_ENTITY_NAME = 'TestProject';
const INT_ENTITY_ID = 'int-ent-1';
const INT_AGENT_ID = 'int-agent-1';
const INT_SESSION_ID = 'int-session-1';

// ─── Probe helpers ────────────────────────────────────────────────────────────

async function isRedisReachable(url: string): Promise<boolean> {
  const probe = createRedisClient(url, {
    maxRetriesPerRequest: 0,
    connectTimeout: 3000,
    retryStrategy: () => null, // no retries
  });
  try {
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    await probe.quit().catch(() => {});
  }
}

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

// ─── Suite ────────────────────────────────────────────────────────────────────

// Gate the whole suite on RUN_LIVE so live clients are never constructed during
// collection when live tests aren't requested (matches the arch/research
// integration suites' `describe.runIf(...)` pattern).
describe.runIf(RUN_LIVE)('Integration: LOAD and STORE flow', () => {
  let redisAvailable = false;
  let neo4jAvailable = false;
  let service: AMPService;

  // Real infrastructure clients
  const redisClient = createRedisClient(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });
  const neo4jDriver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);

  // Redis layer objects
  const cache = new ContextCache(redisClient);
  const embeddings = new EmbeddingCache(redisClient);
  const dedup = new DedupChecker(redisClient);
  const signals = new SignalStream(redisClient);
  const queue = new ConsolidationQueue(redisClient);

  // Neo4j layer objects
  const episodicStore = new EpisodicStore(neo4jDriver);
  const scopedQuery = new ScopedQuery(neo4jDriver);

  const config: AMPConfig = {
    redis: { url: REDIS_URL },
    neo4j: { uri: NEO4J_URI, user: NEO4J_USER, password: NEO4J_PASSWORD },
    embedding: { provider: 'openai', apiKey: OPENAI_API_KEY },
    cache: { defaultTTL: 300, contextTTL: 60, embeddingTTL: 3600 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath: '/tmp/amp-integration-test',
  };

  beforeAll(async () => {
    if (!RUN_LIVE) {
      console.warn('[integration] RUN_LIVE_TESTS not set — skipping suite');
      return;
    }

    // Probe infrastructure
    [redisAvailable, neo4jAvailable] = await Promise.all([
      isRedisReachable(REDIS_URL),
      isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD),
    ]);

    if (!redisAvailable) {
      console.warn(`[integration] Redis not reachable at ${REDIS_URL} — skipping suite`);
      return;
    }
    if (!neo4jAvailable) {
      console.warn(`[integration] Neo4j not reachable at ${NEO4J_URI} — skipping suite`);
      return;
    }
    if (!OPENAI_API_KEY) {
      console.warn('[integration] OPENAI_API_KEY not set — skipping suite');
      return;
    }

    // Ensure Neo4j schema (constraints + indexes)
    await initSchema(neo4jDriver);

    // ── Seed test data ────────────────────────────────────────────────────────

    const session = neo4jDriver.session();
    try {
      // Clean any leftover nodes from a previous run
      await session.run(
        `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`,
        { ids: [INT_SEMANTIC_ID, INT_ENTITY_ID, INT_AGENT_ID] },
      );
      await session.run(
        `MATCH (e:Entity {name: $name}) DETACH DELETE e`,
        { name: INT_ENTITY_NAME },
      );

      const now = new Date().toISOString();

      // Entity: TestProject
      await session.run(
        `CREATE (e:Entity {id: $id, name: $name, type: 'project', created_at: $now})`,
        { id: INT_ENTITY_ID, name: INT_ENTITY_NAME, now },
      );

      // Agent: int-agent-1
      await session.run(
        `CREATE (a:Agent {id: $id, name: 'Integration Test Agent', type: 'test', created_at: $now})`,
        { id: INT_AGENT_ID, now },
      );

      // Semantic node linked to Entity
      await session.run(
        `CREATE (s:Semantic {
           id: $id,
           content: $content,
           confidence: 0.9,
           signal_count: 1,
           created_at: $now,
           updated_at: $now,
           decay_class: 'stable',
           tags: ['integration', 'test']
         })`,
        {
          id: INT_SEMANTIC_ID,
          content: 'TestProject uses a layered memory architecture with episodic and semantic stores.',
          now,
        },
      );
      await session.run(
        `MATCH (s:Semantic {id: $semId}), (e:Entity {id: $entId})
         MERGE (s)-[:ABOUT]->(e)`,
        { semId: INT_SEMANTIC_ID, entId: INT_ENTITY_ID },
      );
    } finally {
      await session.close();
    }

    // Build the RedisLayer wrapper
    const redisLayer: RedisLayer = {
      cache,
      embeddings,
      dedup,
      signals,
      queue,
    };

    // Build the Neo4jLayer wrapper
    const neo4jLayer: Neo4jLayer = {
      episodic: episodicStore,
      query: scopedQuery,
    };

    const embeddingProvider = new OpenAIEmbedding(OPENAI_API_KEY);

    service = new AMPService(redisLayer, neo4jLayer, embeddingProvider, config);
  }, 30_000);

  afterAll(async () => {
    // Remove test nodes if Neo4j is up
    if (neo4jAvailable) {
      const session = neo4jDriver.session();
      try {
        // Remove any Episodic nodes created during STORE test
        await session.run(
          `MATCH (e:Episodic {session_id: $sessionId}) DETACH DELETE e`,
          { sessionId: INT_SESSION_ID },
        );
        // Remove seeded Semantic + Entity + Agent
        await session.run(
          `MATCH (n) WHERE n.id IN $ids DETACH DELETE n`,
          { ids: [INT_SEMANTIC_ID, INT_ENTITY_ID, INT_AGENT_ID] },
        );
        await session.run(
          `MATCH (e:Entity {name: $name}) DETACH DELETE e`,
          { name: INT_ENTITY_NAME },
        );
      } finally {
        await session.close();
      }
    }

    // Clean up Redis dedup / cache keys related to the test agent
    if (redisAvailable) {
      // Clear any cache entries that may contain integration test hashes
      try {
        const keys = await redisClient.keys('amp:ctx:*');
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch {
        // best effort
      }
    }

    await Promise.all([
      redisClient.quit().catch(() => {}),
      neo4jDriver.close().catch(() => {}),
    ]);
  }, 30_000);

  // Helper to skip individual tests when infra / key is missing or live tests not requested
  function shouldSkip(): boolean {
    return !RUN_LIVE || !redisAvailable || !neo4jAvailable || !OPENAI_API_KEY;
  }

  // ─── Test 1: STORE an episode with a signal, verify not duplicate-skipped ──

  it('STORE: persists a new episode and returns duplicate=false', async () => {
    if (shouldSkip()) return;

    const result = await service.store({
      session_id: INT_SESSION_ID,
      agent_id: INT_AGENT_ID,
      task: 'Describe the memory architecture of TestProject',
      content: 'Integration test episode: the project stores memories across two layers.',
      outcome: 'approved',
      signals: [
        {
          type: 'reinforcement',
          target_id: INT_SEMANTIC_ID,
          detail: 'Confirms the layered memory architecture description.',
        },
      ],
      entities: [INT_ENTITY_NAME],
    });

    expect(result.duplicate).toBe(false);
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
  }, 30_000);

  // ─── Test 2: LOAD with entity scope, verify markdown contains seeded knowledge

  it('LOAD: returns markdown containing seeded Semantic node content', async () => {
    if (shouldSkip()) return;

    const ctx = await service.load({
      task: 'What is the architecture of TestProject?',
      entities: [INT_ENTITY_NAME],
      max_tokens: 4096,
    });

    expect(ctx.markdown).toBeTruthy();
    expect(ctx.assembled_at).toBeTruthy();
    // The seeded Semantic node content should appear in the rendered context
    expect(ctx.markdown).toContain('TestProject');
    expect(ctx.sources).toContain(INT_SEMANTIC_ID);
    expect(ctx.tokens).toBeGreaterThan(0);
  }, 30_000);

  // ─── Test 3: LOAD same scope again, verify cache hit (same assembled_at) ───

  it('LOAD: second call with same scope returns cached result (cache hit)', async () => {
    if (shouldSkip()) return;

    const scope = {
      task: 'What is the architecture of TestProject?',
      entities: [INT_ENTITY_NAME],
      max_tokens: 4096,
    };

    const first = await service.load(scope);
    const second = await service.load(scope);

    // Cache hit → assembled_at must be identical
    expect(second.assembled_at).toBe(first.assembled_at);
    expect(second.markdown).toBe(first.markdown);
    expect(second.tokens).toBe(first.tokens);
  }, 30_000);
});
