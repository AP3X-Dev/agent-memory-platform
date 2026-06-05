// packages/core/src/services-factory.ts
//
// Single construction path for the core memory services (load/store + memory
// blocks). Both the MCP server (packages/mcp/src/bootstrap.ts) and the CLI hook
// commands (packages/core/src/cli/*) build their services through this factory
// so the two transports can never drift apart in how they wire AMPService.
//
// The factory is a *pure builder*: it creates clients and services but does NOT
// connect-and-verify or initialise the Neo4j schema. That keeps it cheap enough
// to call from a latency-sensitive hook. Callers that own the schema lifecycle
// (the MCP server) run initSchema() themselves.

import {
  createRedisClient,
  ContextCache,
  EmbeddingCache,
  DedupChecker,
  SignalStream,
  ConsolidationQueue,
  BlockStore as RedisBlockStore,
} from '@amp/redis';
import {
  createNeo4jDriver,
  EpisodicStore,
  ScopedQuery,
  FactStore,
  BlockStore as Neo4jBlockStore,
} from '@amp/neo4j';
import { AMPService } from './service.js';
import { MemoryBlockService } from './blocks.js';
import { OpenAIEmbedding } from './embedding.js';
import { EMBEDDING_DIM, type EmbeddingProvider, type AMPConfig } from './types.js';

export interface CoreServicesEnv {
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  redisUrl?: string;
  openaiKey?: string;
  exportPath?: string;
}

/**
 * The shared low-level kit. The CLI uses `ampService` + `memoryBlocks` + `close`.
 * The MCP bootstrap also uses the connection primitives to build the remaining
 * (consolidation/research/arch/code/...) services on top.
 */
export interface CoreServices {
  driver: ReturnType<typeof createNeo4jDriver>;
  redis: ReturnType<typeof createRedisClient>;
  cache: ContextCache;
  embeddings: EmbeddingCache;
  dedup: DedupChecker;
  signals: SignalStream;
  queue: ConsolidationQueue;
  episodic: EpisodicStore;
  scopedQuery: ScopedQuery;
  factStore: FactStore;
  embedding: EmbeddingProvider;
  config: AMPConfig;
  ampService: AMPService;
  memoryBlocks: MemoryBlockService;
  /** Disconnect Redis and close the Neo4j driver. Best-effort. */
  close(): Promise<void>;
}

function resolveEnv(env: CoreServicesEnv = {}): Required<CoreServicesEnv> {
  return {
    neo4jUri: env.neo4jUri ?? process.env['NEO4J_URI'] ?? 'bolt://localhost:7687',
    neo4jUser: env.neo4jUser ?? process.env['NEO4J_USER'] ?? 'neo4j',
    neo4jPassword: env.neo4jPassword ?? process.env['NEO4J_PASSWORD'] ?? '',
    redisUrl: env.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    openaiKey: env.openaiKey ?? process.env['OPENAI_API_KEY'] ?? '',
    exportPath: env.exportPath ?? process.env['AMP_EXPORT_PATH'] ?? './.amp',
  };
}

/** Build a zero-vector embedding provider (used when no OpenAI key is set). */
function zeroEmbedding(): EmbeddingProvider {
  return {
    embed: async () => new Array(EMBEDDING_DIM).fill(0),
    embedBatch: async (texts: string[]) => texts.map(() => new Array(EMBEDDING_DIM).fill(0)),
  };
}

/**
 * Construct the core memory services from environment (or explicit overrides).
 * Does not connect-and-verify or run initSchema — see file header.
 */
export function createCoreServices(env: CoreServicesEnv = {}): CoreServices {
  const { neo4jUri, neo4jUser, neo4jPassword, redisUrl, openaiKey, exportPath } = resolveEnv(env);

  const redis = createRedisClient(redisUrl);
  const driver = createNeo4jDriver(neo4jUri, neo4jUser, neo4jPassword);

  const cache = new ContextCache(redis);
  const embeddings = new EmbeddingCache(redis);
  const dedup = new DedupChecker(redis);
  const signals = new SignalStream(redis);
  const queue = new ConsolidationQueue(redis);

  const episodic = new EpisodicStore(driver);
  const scopedQuery = new ScopedQuery(driver);
  const factStore = new FactStore(driver);

  const embedding: EmbeddingProvider = openaiKey ? new OpenAIEmbedding(openaiKey) : zeroEmbedding();

  const config: AMPConfig = {
    redis: { url: redisUrl },
    neo4j: { uri: neo4jUri, user: neo4jUser, password: neo4jPassword },
    embedding: { provider: 'openai', apiKey: openaiKey },
    cache: { defaultTTL: 300, contextTTL: 300, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath,
  };

  const redisBlockStore = new RedisBlockStore(redis);
  const neo4jBlockStore = new Neo4jBlockStore(driver);
  const cacheInvalidator = {
    invalidateByScope: async (scope: string): Promise<void> => {
      await cache.invalidateByScope(scope);
    },
  };
  const memoryBlocks = new MemoryBlockService(redisBlockStore, neo4jBlockStore, cacheInvalidator);

  const ampService = new AMPService(
    { cache, embeddings, dedup, signals, queue },
    { episodic, query: scopedQuery, fact: factStore },
    embedding,
    config,
    memoryBlocks,
  );

  return {
    driver,
    redis,
    cache,
    embeddings,
    dedup,
    signals,
    queue,
    episodic,
    scopedQuery,
    factStore,
    embedding,
    config,
    ampService,
    memoryBlocks,
    async close() {
      try { await redis.quit(); } catch { /* already closed */ }
      try { await driver.close(); } catch { /* already closed */ }
    },
  };
}
