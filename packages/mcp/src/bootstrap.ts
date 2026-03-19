// packages/mcp/src/bootstrap.ts
// Wires up Redis, Neo4j, embedding, and core services from environment variables.

import { createRedisClient } from '@amp/redis';
import { ContextCache, EmbeddingCache, DedupChecker, SignalStream, ConsolidationQueue, DistributedLock, SessionStore, ProposalStore } from '@amp/redis';
import { createNeo4jDriver, initSchema, EpisodicStore, SemanticStore, ScopedQuery, GDSAlgorithms } from '@amp/neo4j';
import { AMPService, ConsolidationEngine, OpenAIEmbedding } from '@amp/core';
import type { AMPConfig } from '@amp/core';
import { setServiceInstances } from './tools.js';

export async function bootstrap(): Promise<void> {
  const neo4jUri = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
  const neo4jUser = process.env['NEO4J_USER'] ?? 'neo4j';
  const neo4jPassword = process.env['NEO4J_PASSWORD'] ?? '';
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const openaiKey = process.env['OPENAI_API_KEY'] ?? '';
  const exportPath = process.env['AMP_EXPORT_PATH'] ?? './.amp';

  // Connect Redis
  const redis = createRedisClient(redisUrl);
  await redis.ping();
  console.error('[amp-mcp] Redis connected');

  // Connect Neo4j
  const driver = createNeo4jDriver(neo4jUri, neo4jUser, neo4jPassword);
  await driver.getServerInfo();
  console.error('[amp-mcp] Neo4j connected');

  // Initialize schema (idempotent)
  await initSchema(driver);
  console.error('[amp-mcp] Neo4j schema verified');

  // Build Redis layer
  const cache = new ContextCache(redis);
  const embeddings = new EmbeddingCache(redis);
  const dedup = new DedupChecker(redis);
  const signals = new SignalStream(redis);
  const queue = new ConsolidationQueue(redis);
  const lock = new DistributedLock(redis);
  const proposals = new ProposalStore(redis);

  // Build Neo4j layer
  const episodic = new EpisodicStore(driver);
  const semantic = new SemanticStore(driver);
  const scopedQuery = new ScopedQuery(driver);
  const gds = new GDSAlgorithms(driver);

  // Build embedding provider
  const embedding = openaiKey
    ? new OpenAIEmbedding(openaiKey)
    : ({ embed: async () => new Array(1536).fill(0), embedBatch: async (t: string[]) => t.map(() => new Array(1536).fill(0)) });

  if (!openaiKey) {
    console.error('[amp-mcp] WARNING: No OPENAI_API_KEY — using zero embeddings');
  }

  // Config
  const config: AMPConfig = {
    redis: { url: redisUrl },
    neo4j: { uri: neo4jUri, user: neo4jUser, password: neo4jPassword },
    embedding: { provider: 'openai', apiKey: openaiKey },
    cache: { defaultTTL: 300, contextTTL: 300, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath,
  };

  // Build services
  const ampService = new AMPService(
    { cache, embeddings, dedup, signals, queue },
    { episodic, query: scopedQuery },
    embedding,
    config,
  );

  const consolidationEngine = new ConsolidationEngine(
    { lock, signals, queue, cache, proposals },
    { gds, semantic },
    config,
  );

  // Inject into MCP tools
  setServiceInstances({
    ampService,
    consolidationEngine,
    scopedQuery,
  });

  console.error('[amp-mcp] All services initialized');
}
