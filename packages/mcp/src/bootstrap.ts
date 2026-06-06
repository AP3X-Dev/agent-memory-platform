// packages/mcp/src/bootstrap.ts
// Wires up Redis, Neo4j, embedding, and core services from environment variables.

import { DistributedLock, ProposalStore } from '@amp/redis';
import { initSchema, SemanticStore, ProvenanceTraversal } from '@amp/neo4j';
import { ConsolidationEngine, BootstrapGraphService, createCoreServices } from '@amp/core';
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
  CodeWatcher,
  extractFilePaths,
  setCodeServiceInstances,
} from '@amp/code';
import {
  UnifiedAssembler,
  FeedbackTracker,
  setRetrievalServiceInstances,
} from '@amp/retrieval';
import {
  WikiCompiler,
  IngestionService,
  WikiLinter,
  WikiEditReconciler,
  DefaultDocumentConverter,
  CachingDocumentConverter,
  setWikiServiceInstances,
} from '@amp/wiki';
import type { CompileInput, CompileV2Result } from '@amp/wiki';
import {
  initGraphSchema,
  GraphSnapshotService,
  GraphReportService,
  GraphExportService,
  setGraphServiceInstances,
} from '@amp/graph';

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

  // Build the shared core load/store kit through the single construction path
  // used by both the MCP server and the CLI hook commands (@amp/core
  // services-factory). The factory builds clients lazily and does not own the
  // schema lifecycle — the server connects-and-verifies below.
  const core = createCoreServices({ neo4jUri, neo4jUser, neo4jPassword, redisUrl, openaiKey, exportPath });
  const {
    driver,
    redis,
    cache,
    signals,
    queue,
    scopedQuery,
    factStore: factStoreInstance,
    embedding,
    config,
    ampService,
    memoryBlocks: memoryBlockServiceInstance,
  } = core;

  // Connect-and-verify + initialise schema (idempotent).
  await redis.ping();
  console.error('[amp-mcp] Redis connected');
  await driver.getServerInfo();
  console.error('[amp-mcp] Neo4j connected');
  await initSchema(driver);
  console.error('[amp-mcp] Neo4j schema verified');

  // Services the MCP server needs beyond the core load/store kit.
  const semantic = new SemanticStore(driver);
  const lock = new DistributedLock(redis);
  const proposals = new ProposalStore(redis);
  const provenanceTraversal = new ProvenanceTraversal(driver);

  // ─── Operational status tracking ────────────────────────────────────────────
  const status = {
    redis: true,
    neo4j: true,
    embeddings: !!openaiKey,
    degraded: [] as string[],
  };

  if (!openaiKey) {
    status.degraded.push('embeddings: zero vectors (no OPENAI_API_KEY)');
    console.error('[amp-mcp] WARNING: No OPENAI_API_KEY — using zero embeddings. Vector search will return random results.');
  }

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

  // Inject into MCP tools (codeIndexer injected later after Code services init)
  setServiceInstances({
    ampService,
    consolidationEngine: consolidationAdapter,
    scopedQuery,
    bootstrapService: bootstrapGraphService,
    memoryBlockService: memoryBlockServiceInstance,
    factStore: factStoreInstance,
    provenance: provenanceTraversal,
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
  const codeWatcherService = new CodeWatcher(codeIndexerService, symbolStoreService);

  // Wire post-store hook: re-index files mentioned in stored episode content
  const originalStore = ampService.store.bind(ampService);
  ampService.store = async (input) => {
    const result = await originalStore(input);
    if (!result.duplicate && input.content) {
      try {
        const filePaths = extractFilePaths(input.content);
        for (const fp of filePaths) {
          codeWatcherService.queueReindex(fp);
        }
      } catch (err: unknown) {
        // Post-store hook failures are non-fatal
      }
    }
    return result;
  };

  setCodeServiceInstances({
    codeIndexer: codeIndexerService,
    codeSearch: codeSearchService,
    symbolStore: symbolStoreService,
    codeWatcher: codeWatcherService,
  });

  // Inject codeIndexer into core tools so amp_ingest_codebase can use it
  setServiceInstances({
    ampService,
    consolidationEngine: consolidationAdapter,
    scopedQuery,
    bootstrapService: bootstrapGraphService,
    memoryBlockService: memoryBlockServiceInstance,
    factStore: factStoreInstance,
    codeIndexer: codeIndexerService,
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

  // ─── Wiki services ─────────────────────────────────────────────────────────
  // WikiCompiler.compile() accepts outputDir plus an optional project tag; the
  // IWikiCompiler interface used by MCP tools accepts a CompileInput object.
  const rawWikiCompiler = new WikiCompiler(driver);
  const wikiCompilerAdapter = {
    compile: async (input: CompileInput): Promise<CompileV2Result> =>
      rawWikiCompiler.compile(input.output_dir, input.project_tag),
  };
  // Document conversion (PDF/Office/HTML/RTF → text) via optional system tools,
  // with a SHA-256 manifest cache under .amp/converted. No npm dependencies.
  const documentConverter = new CachingDocumentConverter(new DefaultDocumentConverter());
  const ingestionServiceInstance = new IngestionService(driver, undefined, documentConverter);
  const wikiLinterInstance = new WikiLinter(driver);
  const editReconcilerInstance = new WikiEditReconciler(driver);

  setWikiServiceInstances({
    wikiCompiler: wikiCompilerAdapter,
    ingestionService: ingestionServiceInstance,
    wikiLinter: wikiLinterInstance,
    editReconciler: editReconcilerInstance,
  });

  console.error('[amp-mcp] Wiki services initialized');

  // ─── Graph analytics services ──────────────────────────────────────────────
  await initGraphSchema(driver);
  console.error('[amp-mcp] Graph schema verified');

  const graphSnapshotService = new GraphSnapshotService(driver);
  const graphReportService = new GraphReportService(graphSnapshotService);
  const graphExportService = new GraphExportService(graphSnapshotService);

  setGraphServiceInstances({
    snapshotService: graphSnapshotService,
    reportService: graphReportService,
    exportService: graphExportService,
  });

  console.error('[amp-mcp] Graph services initialized');

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
      try { codeWatcherService.stopAll(); } catch { /* best-effort */ }
      try { await redis.quit(); } catch { /* already closed */ }
      try { await driver.close(); } catch { /* already closed */ }
    },
  };
}
