// packages/mcp/src/bootstrap.ts
// Wires up Redis, Neo4j, embedding, and core services from environment variables.

import { createRedisClient } from '@amp/redis';
import { ContextCache, EmbeddingCache, DedupChecker, SignalStream, ConsolidationQueue, DistributedLock, SessionStore, ProposalStore } from '@amp/redis';
import { createNeo4jDriver, initSchema, EpisodicStore, SemanticStore, ScopedQuery, GDSAlgorithms } from '@amp/neo4j';
import { AMPService, ConsolidationEngine, OpenAIEmbedding, BootstrapGraphService } from '@amp/core';
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
    { semantic },
    config,
  );

  // Build bootstrap service
  const bootstrapGraphService = new BootstrapGraphService(driver);

  // Adapt ConsolidationEngine to the IConsolidationEngine interface expected by tools
  const consolidationAdapter = {
    run: async (scope?: string) => {
      const r = await consolidationEngine.run(scope ?? 'global');
      return JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    },
    status: async () => {
      const s = await consolidationEngine.status();
      return JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    },
    review: async (proposalId: string) => {
      return { proposalId } as Record<string, unknown>;
    },
    apply: async (proposalId: string, decision: 'approve' | 'reject') => {
      await consolidationEngine.reviewProposal(proposalId, decision);
      return { applied: true };
    },
  };

  // Inject into MCP tools
  setServiceInstances({
    ampService,
    consolidationEngine: consolidationAdapter,
    scopedQuery,
    bootstrapService: bootstrapGraphService,
  });

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

  console.error('[amp-mcp] All services initialized');

  return {
    async shutdown() {
      try { await redis.quit(); } catch { /* already closed */ }
      try { await driver.close(); } catch { /* already closed */ }
    },
  };
}
