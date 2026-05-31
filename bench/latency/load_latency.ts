#!/usr/bin/env tsx
// bench/latency/load_latency.ts
//
// Controlled A/B latency benchmark for AMPService.load().
//
// Isolates the ONE thing the concurrency optimization changed: round-trip
// PHASING. Both arms run against identical mock layers with identical injected
// per-op latencies (Redis ~1ms, Neo4j ~8ms, embedding API ~120ms on cache miss).
// No real DB — so the only variable is sequential vs. concurrent phasing.
//
//   - optimized: the REAL service.load() (blocks ∥ semantics+vector ∥ facts, then expand)
//   - sequential: a faithful replica of the PRE-optimization ordering
//       (await blocks → await semantics+vector → await facts → await expand)
//
// Run: npx tsx bench/latency/load_latency.ts [iterations] [numEntities]

import { AMPService } from '../../packages/core/src/service.js';
import type { RedisLayer, Neo4jLayer, FactLayer, BlocksLayer } from '../../packages/core/src/service.js';
import type { AMPConfig, LoadScope, MemoryBlock, SemanticNode, FactNode } from '../../packages/core/src/types.js';

// ─── Injected latencies (ms) — representative of a warm local deployment ──────
const L = {
  redis: 1,      // Redis GET/SET round trip
  neo4j: 8,      // a Cypher query round trip
  embedApi: 120, // OpenAI embedding call on cache miss (the long pole)
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeConfig(): AMPConfig {
  return {
    redis: { url: 'redis://localhost:6379' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'x' },
    embedding: { provider: 'openai', apiKey: 'test-key' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath: '/tmp/amp-export',
  } as AMPConfig;
}

function makeSemantic(id: string): SemanticNode {
  return {
    id, content: `semantic ${id} `.repeat(8), confidence: 0.8, signal_count: 2,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    decay_class: 'stable', tags: ['agent'],
  };
}

function makeBlock(name: string): MemoryBlock {
  return {
    name, content: `block ${name} content`.repeat(4), scope: 'project:bench',
    tier: 'core', updated_at: new Date().toISOString(),
  } as MemoryBlock;
}

function makeFact(id: string): FactNode {
  const now = new Date().toISOString();
  return {
    id, subject: 'agent', predicate: 'uses', object: id, entity_id: 'ent-1',
    source_episode_ids: [], valid_at: now, invalid_at: null, confidence: 0.7,
    status: 'active', supersedes_fact_id: null, scope: 'project', tags: [],
    created_at: now, updated_at: now,
  };
}

// Mock layers: every op sleeps its injected latency, then returns realistic data.
// embedWarm=true → the task embedding is already cached (no 120ms API call),
// which is the common repeated-load case.
function makeMocks(embedWarm = false) {
  const redis: RedisLayer = {
    cache: {
      get: async () => { await sleep(L.redis); return null; },        // force context miss
      set: async () => { await sleep(L.redis); },
      invalidateByScope: async () => 0,
      invalidateByNodeId: async () => 0,
    },
    embeddings: {
      get: async () => { await sleep(L.redis); return embedWarm ? new Array(1536).fill(0.1) : null; },
      set: async () => { await sleep(L.redis); },
    },
    dedup: { isDuplicate: async () => false, markSeen: async () => {}, checkAndMark: async () => false },
    signals: { publish: async () => 'sig' },
    queue: { incrementScore: async () => 1 },
  };

  const fact: FactLayer = {
    getActive: async () => { await sleep(L.neo4j); return [makeFact('f1'), makeFact('f2')]; },
    create: async () => 'f', findBySubjectPredicate: async () => [], invalidate: async () => {},
  };

  const neo4j: Neo4jLayer = {
    episodic: {
      create: async () => 'ep', linkToAgent: async () => {}, linkToEntity: async () => {},
      linkToModel: async () => {}, linkSignal: async () => {},
    },
    query: {
      byScope: async () => { await sleep(L.neo4j); return [makeSemantic('s1'), makeSemantic('s2')]; },
      byVector: async () => { await sleep(L.neo4j); return [{ ...makeSemantic('s3'), score: 0.9 }]; },
      expandByGraph: async () => { await sleep(L.neo4j); return [makeSemantic('s4')]; },
    },
    fact,
  };

  const blocks: BlocksLayer = {
    listBlocks: async (_scope: string, tier?: string) => {
      await sleep(L.neo4j);
      return tier === 'core' ? [makeBlock('persona'), makeBlock('user')] : [makeBlock('working_state')];
    },
  };

  const embedding = {
    embed: async () => { await sleep(L.embedApi); return new Array(1536).fill(0.1); },
    embedBatch: async () => [],
  };

  return { redis, neo4j, blocks, embedding };
}

// Faithful replica of the PRE-optimization load() phasing: four sequential
// awaits. Drives the SAME mock layers, so the only difference vs. the real
// (optimized) load() is ordering. Mirrors the data-fetch round-trips only —
// ranking/budget/render are pure CPU and identical in both arms (excluded).
async function sequentialBaseline(m: ReturnType<typeof makeMocks>, scope: LoadScope): Promise<void> {
  await m.redis.cache.get('hash');                                  // cache miss check

  // Phase 1: blocks
  await Promise.all([
    m.blocks.listBlocks('project:bench', 'core'),
    m.blocks.listBlocks('project:bench', 'working', scope.session_id),
  ]);

  // Phase 2: semantics + vector (vector = embed-cache-get → embed → embed-set → byVector)
  await Promise.all([
    m.neo4j.query.byScope({ entities: scope.entities, tags: scope.tags, limit: 50 }),
    (async () => {
      const cached = await m.redis.embeddings.get('t');
      if (!cached) { const e = await m.embedding.embed(); await m.redis.embeddings.set(); return m.neo4j.query.byVector!(e, 20); }
      return m.neo4j.query.byVector!(cached, 20);
    })(),
  ]);

  // Phase 3: facts (one getActive per entity, concurrently — as the old code did)
  await Promise.all((scope.entities ?? []).map((e) => m.neo4j.fact!.getActive(e)));

  // Phase 4: graph expansion
  await m.neo4j.query.expandByGraph!(['agent'], 1, 5);

  await m.redis.cache.set();                                        // write cache
}

async function timeIt(fn: () => Promise<unknown>, iters: number): Promise<number> {
  // warmup
  for (let i = 0; i < 3; i++) await fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) await fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6 / iters; // ms/op
}

async function main() {
  const iters = parseInt(process.argv[2] ?? '30', 10);
  const numEntities = parseInt(process.argv[3] ?? '3', 10);
  const entities = Array.from({ length: numEntities }, (_, i) => `entity-${i}`);
  const scope: LoadScope = {
    task: 'optimize the memory load path', entities, tags: ['project:bench'],
    session_id: 'sess-bench', max_tokens: 4000,
  };

  console.log(`\n=== AMPService.load() latency — sequential vs concurrent phasing ===`);
  console.log(`injected: redis=${L.redis}ms  neo4j=${L.neo4j}ms  embedApi=${L.embedApi}ms`);
  console.log(`scope: ${numEntities} entities, blocks+facts present, ${iters} iters\n`);

  for (const [label, warm] of [['cold embedding (API call)', false], ['warm embedding (cached)', true]] as const) {
    const optimized = await timeIt(async () => {
      const m = makeMocks(warm);
      const svc = new AMPService(m.redis, m.neo4j, m.embedding, makeConfig(), m.blocks);
      await svc.load({ ...scope });
    }, iters);

    const sequential = await timeIt(async () => {
      const m = makeMocks(warm);
      await sequentialBaseline(m, scope);
    }, iters);

    const speedup = sequential / optimized;
    const saved = sequential - optimized;
    console.log(`  [${label}]`);
    console.log(`    sequential (pre-opt) : ${sequential.toFixed(2)} ms/load`);
    console.log(`    concurrent (current) : ${optimized.toFixed(2)} ms/load`);
    console.log(`    → ${saved.toFixed(2)} ms saved  (${speedup.toFixed(2)}× faster, ${((1 - optimized / sequential) * 100).toFixed(0)}% cut)\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
