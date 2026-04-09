// packages/mcp/src/bootstrap.ts
// Wires up Redis, Neo4j, embedding, and core services from environment variables.

import { createRedisClient } from '@amp/redis';
import { ContextCache, EmbeddingCache, DedupChecker, SignalStream, ConsolidationQueue, DistributedLock, SessionStore, ProposalStore, BlockStore as RedisBlockStore } from '@amp/redis';
import { createNeo4jDriver, initSchema, EpisodicStore, SemanticStore, ScopedQuery, GDSAlgorithms, BlockStore as Neo4jBlockStore, FactStore } from '@amp/neo4j';
import { AMPService, ConsolidationEngine, OpenAIEmbedding, BootstrapGraphService, MemoryBlockService } from '@amp/core';
import type { AMPConfig } from '@amp/core';
import { setServiceInstances } from './tools.js';
import {
  initResearchSchema,
  ExperimentStore,
  CampaignStore,
  HypothesisNavigator,
  ResearchContextBuilder,
  ContradictionDetector,
  ResearchConsolidation,
  setResearchServiceInstances,
} from '@amp/research';
import {
  initArchSchema,
  ArchEntityStore,
  AspectStore,
  StructuralRelationStore,
  ImpactAnalyzer,
  DriftDetector,
  ArchContextBuilder,
  setArchServiceInstances,
} from '@amp/arch';
import {
  initCodeSchema,
  CodeIndexer,
  SymbolStore,
  CodeSearch,
  setCodeServiceInstances,
} from '@amp/code';
import {
  UnifiedAssembler,
  FeedbackTracker,
  setRetrievalServiceInstances,
} from '@amp/retrieval';

export interface BootstrapHandles {
  /** Call to disconnect Redis and Neo4j cleanly. */
  shutdown(): Promise<void>;
}

export async function bootstrap(): Promise<BootstrapHandles> {
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
  const factStoreInstance = new FactStore(driver);

  // ─── Operational status tracking ────────────────────────────────────────────
  const status = {
    redis: true,
    neo4j: true,
    embeddings: !!openaiKey,
    degraded: [] as string[],
  };

  // Build embedding provider
  const embedding = openaiKey
    ? new OpenAIEmbedding(openaiKey)
    : ({ embed: async () => new Array(1536).fill(0), embedBatch: async (t: string[]) => t.map(() => new Array(1536).fill(0)) });

  if (!openaiKey) {
    status.degraded.push('embeddings: zero vectors (no OPENAI_API_KEY)');
    console.error('[amp-mcp] WARNING: No OPENAI_API_KEY — using zero embeddings. Vector search will return random results.');
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

  // Build memory block stores
  const redisBlockStore = new RedisBlockStore(redis);
  const neo4jBlockStore = new Neo4jBlockStore(driver);
  const memoryBlockServiceInstance = new MemoryBlockService(redisBlockStore, neo4jBlockStore);

  // Build services
  const ampService = new AMPService(
    { cache, embeddings, dedup, signals, queue },
    { episodic, query: scopedQuery, fact: factStoreInstance },
    embedding,
    config,
    memoryBlockServiceInstance,
  );

  const consolidationEngine = new ConsolidationEngine(
    { lock, signals, queue, cache, proposals },
    { semantic, fact: factStoreInstance },
    config,
  );

  // Build bootstrap service
  const bootstrapGraphService = new BootstrapGraphService(driver);

  // Adapt ConsolidationEngine to the IConsolidationEngine interface expected by tools
  const consolidationAdapter = {
    run: (scope?: string) => consolidationEngine.run(scope ?? 'global'),
    status: () => consolidationEngine.status(),
    review: async (proposalId: string) => {
      const proposal = await proposals.get(proposalId);
      return proposal ?? { error: 'not found' };
    },
    apply: async (proposalId: string, decision: 'approve' | 'reject') => {
      try {
        await consolidationEngine.reviewProposal(proposalId, decision);
        return { applied: true };
      } catch (err) {
        return { applied: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  // Inject into MCP tools
  setServiceInstances({
    ampService,
    consolidationEngine: consolidationAdapter,
    scopedQuery,
    bootstrapService: bootstrapGraphService,
    memoryBlockService: memoryBlockServiceInstance,
    factStore: factStoreInstance,
  });

  console.error('[amp-mcp] Memory block and fact services initialized');

  // ─── Research services ─────────────────────────────────────────────────────
  await initResearchSchema(driver);
  console.error('[amp-mcp] Research schema verified');

  const experimentStore = new ExperimentStore(driver);
  const campaignStore = new CampaignStore(driver);
  const hypothesisNavigator = new HypothesisNavigator(driver);
  const researchContextBuilder = new ResearchContextBuilder(driver);
  const contradictionDetector = new ContradictionDetector(driver);
  const researchConsolidation = new ResearchConsolidation(driver);

  setResearchServiceInstances({
    experimentStore,
    campaignStore,
    contextBuilder: researchContextBuilder,
    hypothesisNavigator,
    contradictionDetector,
    researchConsolidation,
  });

  console.error('[amp-mcp] Research services initialized');

  // ─── Arch services ─────────────────────────────────────────────────────────
  await initArchSchema(driver);
  console.error('[amp-mcp] Arch schema verified');

  const archEntityStore = new ArchEntityStore(driver);
  const aspectStore = new AspectStore(driver);
  const relationStore = new StructuralRelationStore(driver);
  const impactAnalyzer = new ImpactAnalyzer(driver);
  const driftDetector = new DriftDetector(driver);
  const archContextBuilder = new ArchContextBuilder(driver);

  setArchServiceInstances({
    archEntityStore,
    aspectStore,
    relationStore,
    impactAnalyzer,
    driftDetector,
    archContextBuilder,
  });

  console.error('[amp-mcp] Arch services initialized');

  // ─── Code intelligence services ────────────────────────────────────────────
  await initCodeSchema(driver);
  console.error('[amp-mcp] Code schema verified');

  const codeIndexerService = new CodeIndexer(driver);
  const symbolStoreService = new SymbolStore(driver);
  const codeSearchService = new CodeSearch(driver, embedding);

  setCodeServiceInstances({
    codeIndexer: codeIndexerService,
    codeSearch: codeSearchService,
    symbolStore: symbolStoreService,
  });

  console.error('[amp-mcp] Code services initialized');

  // ─── Retrieval services ────────────────────────────────────────────────────
  const feedbackRedis = {
    zincrby: async (key: string, inc: number, member: string) => {
      const result = await redis.zincrby(key, inc, member);
      return parseFloat(result);
    },
    zrevrangeWithScores: async (key: string, start: number, stop: number) => {
      const raw = await redis.zrevrange(key, start, stop, 'WITHSCORES');
      const pairs: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < raw.length; i += 2) {
        pairs.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
      }
      return pairs;
    },
    lpush: async (key: string, value: string) => redis.lpush(key, value),
    ltrim: async (key: string, start: number, stop: number) => { await redis.ltrim(key, start, stop); },
  };

  const unifiedAssembler = new UnifiedAssembler(
    driver,
    feedbackRedis,
    codeSearchService,
    ampService,
    embedding,
  );
  const feedbackTrackerService = new FeedbackTracker(feedbackRedis);

  setRetrievalServiceInstances({
    assembler: unifiedAssembler,
    feedbackTracker: feedbackTrackerService,
  });

  console.error('[amp-mcp] Retrieval services initialized');

  if (status.degraded.length > 0) {
    console.error(`[amp-mcp] DEGRADED MODE — ${status.degraded.length} issue(s):`);
    for (const issue of status.degraded) {
      console.error(`  - ${issue}`);
    }
  } else {
    console.error('[amp-mcp] All services initialized — fully operational');
  }

  return {
    async shutdown() {
      try { await redis.quit(); } catch { /* already closed */ }
      try { await driver.close(); } catch { /* already closed */ }
    },
  };
}
