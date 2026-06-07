#!/usr/bin/env tsx
// bench/quality/eval.ts
//
// MemBerry MEMORY-QUALITY benchmark — the runnable CI gate.
//
// This is a thin, infra-free wrapper around the existing golden-set retrieval-quality
// evaluation in packages/retrieval/bench/quality-eval.ts. It does NOT re-implement the
// ranking pipeline or duplicate the labeled corpus: it imports the real, deterministic
// production ranking path (expandQuery -> adaptiveWeights -> rrfFusion + lexicalTextScore
// boost -> MMR) over the committed golden set and reports the standard IR metrics —
// Recall@k, MRR, and nDCG@k — plus the conflict / knowledge-update metrics.
//
// Why a wrapper and not a parallel system: the package-level eval already computes these
// exact metrics over a human-labeled golden set using the deterministic (lexical + RRF,
// no vector embeddings) path, so it is fully reproducible with no OpenAI key and no live
// Neo4j/Redis. This wrapper exposes it as a ROOT-runnable gate: it emits an explicit
// machine-readable metrics report (bench/quality/last-run.json), prints a table, enforces
// PASS/FAIL thresholds, and exits non-zero on any regression so CI can gate on it in the
// unit job (NEO4J_URI="" REDIS_URL="").
//
// Determinism: no Math.random, no Date.now affects ranking. The only timestamp recorded
// is a human-readable "generatedAt" in the JSON snapshot, which is NOT a metric and does
// not affect PASS/FAIL.
//
// Run:  npm run bench:quality
//       npx tsx bench/quality/eval.ts
//       npx tsx bench/quality/eval.ts --json     (print the metrics JSON to stdout)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  runQualityEval,
  runConflictEval,
  QUALITY_THRESHOLDS,
} from '../../packages/retrieval/bench/quality-eval.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(HERE, 'last-run.json');

// ─── Gate definition ─────────────────────────────────────────────────────────
// Thresholds are sourced from the locked-in QUALITY_THRESHOLDS in the package eval so
// there is ONE source of truth; this gate simply enforces them at the root level.
// "min" gates assert actual >= threshold; "max" gates assert actual <= threshold.

interface MinGate { name: string; key: string; actual: number; min: number; }
interface MaxGate { name: string; key: string; actual: number; max: number; }

// Recall@5 is not part of QUALITY_THRESHOLDS (the package eval gates Recall@10), so this
// gate adds an explicit Recall@5 floor. Set just below the measured baseline (0.882) to
// catch regressions without flakiness. See bench/quality/RESULTS.md.
export const RECALL_AT_5_MIN = 0.85;

export interface QualityGateReport {
  generatedAt: string;
  corpusSize: number;
  queryCount: number;
  metrics: {
    recallAt5: number;
    recallAt10: number;
    precisionAt5: number;
    ndcgAt10: number;
    mrr: number;
    intentAccuracy: number;
    currentAboveStaleRate: number;
    staleLeakRate: number;
    // fusion-lift diagnostics (not gated, but recorded so regressions in the fused
    // path vs single channels are visible in the snapshot)
    lexRecallAt10: number;
    denseRecallAt10: number;
  };
  thresholds: typeof QUALITY_THRESHOLDS;
  gates: Array<{ name: string; actual: number; bound: number; kind: 'min' | 'max'; pass: boolean }>;
  passed: boolean;
  failures: number;
}

export async function runQualityGate(): Promise<QualityGateReport> {
  const quality = await runQualityEval();
  const conflict = await runConflictEval();

  const metrics: QualityGateReport['metrics'] = {
    recallAt5: quality.recall5,
    recallAt10: quality.recall10,
    precisionAt5: quality.precision5,
    ndcgAt10: quality.ndcg10,
    mrr: quality.mrr,
    intentAccuracy: quality.intentAccuracy,
    currentAboveStaleRate: conflict.currentAboveStaleRate,
    staleLeakRate: conflict.staleLeakRate,
    lexRecallAt10: quality.lexRecall10,
    denseRecallAt10: quality.denseRecall10,
  };

  const minGates: MinGate[] = [
    { name: 'Recall@10', key: 'recallAt10', actual: metrics.recallAt10, min: QUALITY_THRESHOLDS.recallAt10 },
    { name: 'Recall@5', key: 'recallAt5', actual: metrics.recallAt5, min: RECALL_AT_5_MIN },
    { name: 'nDCG@10', key: 'ndcgAt10', actual: metrics.ndcgAt10, min: QUALITY_THRESHOLDS.ndcgAt10 },
    { name: 'MRR', key: 'mrr', actual: metrics.mrr, min: QUALITY_THRESHOLDS.mrr },
    { name: 'Intent accuracy', key: 'intentAccuracy', actual: metrics.intentAccuracy, min: QUALITY_THRESHOLDS.intentAccuracy },
    { name: 'Current-above-stale', key: 'currentAboveStaleRate', actual: metrics.currentAboveStaleRate, min: QUALITY_THRESHOLDS.currentAboveStaleRate },
  ];
  const maxGates: MaxGate[] = [
    { name: 'Stale-leak (top-3)', key: 'staleLeakRate', actual: metrics.staleLeakRate, max: QUALITY_THRESHOLDS.maxStaleLeakRate },
  ];

  const gates = [
    ...minGates.map((g) => ({ name: g.name, actual: g.actual, bound: g.min, kind: 'min' as const, pass: g.actual >= g.min })),
    ...maxGates.map((g) => ({ name: g.name, actual: g.actual, bound: g.max, kind: 'max' as const, pass: g.actual <= g.max })),
  ];
  const failures = gates.filter((g) => !g.pass).length;

  return {
    generatedAt: new Date().toISOString(),
    corpusSize: quality.corpusSize,
    queryCount: quality.queryCount,
    metrics,
    thresholds: QUALITY_THRESHOLDS,
    gates,
    passed: failures === 0,
    failures,
  };
}

function fmt(v: number): string {
  return Number.isNaN(v) ? '  –  ' : v.toFixed(3);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  const report = await runQualityGate();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n=== MemBerry Memory-Quality Gate (golden set, infra-free) ===\n');
    console.log(`corpus: ${report.corpusSize} docs | queries: ${report.queryCount} | ranking: lexical + RRF + MMR (no embeddings)\n`);
    console.log('─── Metrics ─────────────────────────────────────────────');
    console.log(`  Recall@5         : ${fmt(report.metrics.recallAt5)}`);
    console.log(`  Recall@10        : ${fmt(report.metrics.recallAt10)}`);
    console.log(`  Precision@5      : ${fmt(report.metrics.precisionAt5)}`);
    console.log(`  nDCG@10          : ${fmt(report.metrics.ndcgAt10)}`);
    console.log(`  MRR              : ${fmt(report.metrics.mrr)}`);
    console.log(`  Intent accuracy  : ${fmt(report.metrics.intentAccuracy)}`);
    console.log(`  Current>stale    : ${fmt(report.metrics.currentAboveStaleRate)}`);
    console.log(`  Stale-leak (top3): ${fmt(report.metrics.staleLeakRate)}`);
    console.log('─── Fusion lift (Recall@10, diagnostic) ─────────────────');
    console.log(`  lexical-only     : ${fmt(report.metrics.lexRecallAt10)}`);
    console.log(`  dense-only       : ${fmt(report.metrics.denseRecallAt10)}`);
    console.log(`  fused            : ${fmt(report.metrics.recallAt10)}`);
    console.log('\n─── Gate ────────────────────────────────────────────────');
    for (const g of report.gates) {
      console.log(`  ${g.pass ? '✓' : '✗'} ${pad(g.name, 20)} ${fmt(g.actual)} (${g.kind} ${g.bound})`);
    }
  }

  writeFileSync(SNAPSHOT_PATH, JSON.stringify(report, null, 2) + '\n');

  if (!process.argv.includes('--json')) {
    console.log(`\nsnapshot: ${SNAPSHOT_PATH}`);
    console.log(`\n=== ${report.passed ? 'ALL QUALITY GATES PASSED' : `${report.failures} QUALITY GATE(S) FAILED`} ===\n`);
  }

  if (!report.passed) process.exit(1);
}

// Run as CLI only when invoked directly (not when imported by the regression test).
const invokedDirectly = process.argv[1]?.includes('eval');
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
