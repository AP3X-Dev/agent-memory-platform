#!/usr/bin/env tsx
// packages/retrieval/bench/benchmark.ts
// Benchmarks the retrieval pipeline: RRF fusion, scoring, MMR, expansion, intent.
// Run: npx tsx packages/retrieval/bench/benchmark.ts

import {
  rrfFusion,
  dedup,
  expandQuery,
  scaleRrfK,
  lexicalTextScore,
  normalizeScores,
  mmrDiversify,
  computeQueryStats,
  adaptiveWeights,
  classifyIntent,
} from '../src/index.js';
import type { RetrievalResult } from '../src/types.js';

// ─── Test data generation ────────────────────────────────────────────────────

function generateResults(count: number): RetrievalResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `result-${i}`,
    source_type: (['symbol', 'semantic', 'arch_entity'] as const)[i % 3],
    title: `Symbol_${i}_${randomName()}`,
    content: `This is the content of result ${i} with ${randomName()} implementation details`,
    score: Math.random(),
    metadata: {
      name: `symbol_${i}`,
      file_path: `/src/${['auth', 'db', 'api', 'utils', 'middleware'][i % 5]}/file_${i}.ts`,
    },
  }));
}

function randomName(): string {
  const names = ['Auth', 'User', 'Payment', 'Order', 'Config', 'Cache', 'Queue', 'Handler'];
  return names[Math.floor(Math.random() * names.length)];
}

// ─── Benchmark runner ────────────────────────────────────────────────────────

function bench(name: string, fn: () => void, iterations = 1000): { avg: number; p99: number; total: number } {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)];
  const total = times.reduce((s, t) => s + t, 0);
  console.log(`  ${name}: avg=${avg.toFixed(3)}ms  p99=${p99.toFixed(3)}ms  total=${total.toFixed(0)}ms (${iterations} iterations)`);
  return { avg, p99, total };
}

async function benchAsync(name: string, fn: () => Promise<void>, iterations = 100): Promise<{ avg: number; p99: number }> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)];
  console.log(`  ${name}: avg=${avg.toFixed(3)}ms  p99=${p99.toFixed(3)}ms (${iterations} iterations)`);
  return { avg, p99 };
}

// ─── Run benchmarks ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== AMP Retrieval Pipeline Benchmark ===\n');

  // Generate test data at various scales
  const small = generateResults(50);
  const medium = generateResults(200);
  const large = generateResults(1000);

  const list1 = small.slice(0, 25);
  const list2 = small.slice(25);
  const list3 = medium.slice(0, 100);
  const list4 = medium.slice(100);

  console.log('--- RRF Fusion ---');
  bench('rrfFusion (2 lists × 25 items)', () => rrfFusion([list1, list2], 20));
  bench('rrfFusion (2 lists × 100 items)', () => rrfFusion([list3, list4], 50));
  bench('rrfFusion (4 lists × 250 items)', () => {
    const chunks = [large.slice(0, 250), large.slice(250, 500), large.slice(500, 750), large.slice(750)];
    rrfFusion(chunks, 50);
  });
  bench('rrfFusion with postBoost', () => {
    rrfFusion([list3, list4], 50, 60, undefined, undefined, (r) => r.score * 1.1);
  });

  console.log('\n--- Scoring ---');
  bench('scaleRrfK', () => scaleRrfK(60, 50000));
  bench('lexicalTextScore (5 tokens)', () => {
    lexicalTextScore(['auth', 'handler', 'validate', 'token', 'user'], {
      name: 'validateToken', file_path: '/src/auth/handler.ts', signature: 'validateToken(token: string)',
    });
  });
  bench('normalizeScores (100 results)', () => normalizeScores(medium.slice(0, 100), 50000));
  bench('computeQueryStats', () => computeQueryStats('how does the authentication handler validate JWT tokens'));
  bench('adaptiveWeights', () => {
    const stats = computeQueryStats('getUserById processOrder');
    adaptiveWeights(stats);
  });

  console.log('\n--- MMR Diversification ---');
  bench('mmrDiversify (50 → 20)', () => mmrDiversify(small, 20), 500);
  bench('mmrDiversify (200 → 50)', () => mmrDiversify(medium, 50), 100);
  bench('mmrDiversify (1000 → 60, bounded)', () => mmrDiversify(large, 60), 50);

  console.log('\n--- Query Expansion ---');
  bench('expandQuery (simple)', () => expandQuery('find user handler'));
  bench('expandQuery (complex)', () => expandQuery('create function to validate and update database record'));
  bench('expandQuery (IDENTIFIER, no expansion)', () => expandQuery('getUserById', 'IDENTIFIER'));
  bench('expandQuery (GRAPH, minimal)', () => expandQuery('who calls validateToken', 'GRAPH'));

  console.log('\n--- Intent Classification (rules only, no embedding) ---');
  await benchAsync('classifyIntent (GRAPH pattern)', async () => {
    await classifyIntent('who calls validateToken');
  });
  await benchAsync('classifyIntent (SEMANTIC pattern)', async () => {
    await classifyIntent('how does authentication work');
  });
  await benchAsync('classifyIntent (IDENTIFIER)', async () => {
    await classifyIntent('AuthService');
  });
  await benchAsync('classifyIntent (ambiguous → fallback)', async () => {
    await classifyIntent('some code somewhere');
  });

  console.log('\n--- Dedup ---');
  bench('dedup (50 items, 10% duplicates)', () => {
    const withDups = [...small, ...small.slice(0, 5)];
    dedup(withDups);
  });
  bench('dedup (200 items, 10% duplicates)', () => {
    const withDups = [...medium, ...medium.slice(0, 20)];
    dedup(withDups);
  });

  console.log('\n--- End-to-End Pipeline (no DB) ---');
  bench('full pipeline: expand → stats → weights → fuse → dedup', () => {
    const expansion = expandQuery('find authentication handler');
    const stats = computeQueryStats('find authentication handler');
    const weights = adaptiveWeights(stats);
    const textBoostFn = (r: RetrievalResult) => {
      const boost = lexicalTextScore(expansion.tokens, {
        name: r.title, file_path: r.metadata.file_path as string,
      });
      return r.score * (1 + boost * weights.lexicalTextWeight);
    };
    const fused = rrfFusion([list3, list4], 50, 60, undefined, 50000, textBoostFn);
    dedup(fused);
  }, 500);

  console.log('\n=== Benchmark Complete ===\n');
}

main().catch(console.error);
