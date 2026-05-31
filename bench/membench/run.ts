#!/usr/bin/env tsx
// bench/membench/run.ts
// Run the MemBench suite over every registered adapter and print a comparison.
// Run: npx tsx bench/membench/run.ts

import type { MemorySystemAdapter, RecalledItem } from './types.js';
import { SCENARIOS } from './scenarios.js';
import { REFERENCE_ADAPTERS } from './adapters.js';
import { scoreScenario, aggregate, type AdapterReport } from './scorer.js';
import type { Dimension } from './types.js';

const DIMENSIONS: Dimension[] = ['recall', 'precision', 'conflict', 'stale', 'contamination'];

export async function benchmarkAdapter(adapter: MemorySystemAdapter): Promise<AdapterReport> {
  const scenarioScores = [];
  for (const scenario of SCENARIOS) {
    await adapter.reset();
    for (const item of scenario.items) await adapter.remember(item);
    const perProbeResults: RecalledItem[][] = [];
    for (const probe of scenario.probes) {
      perProbeResults.push(await adapter.recall(probe.query, { k: probe.k, project: probe.project }));
    }
    scenarioScores.push(scoreScenario(scenario, perProbeResults));
  }
  return aggregate(adapter.name, scenarioScores);
}

export async function runMemBench(adapters: MemorySystemAdapter[] = REFERENCE_ADAPTERS): Promise<AdapterReport[]> {
  return Promise.all(adapters.map(benchmarkAdapter));
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function fmt(v: number): string {
  return Number.isNaN(v) ? '  –  ' : v.toFixed(2);
}

async function main() {
  console.log('\n=== MemBench — agent-memory benchmark ===');
  console.log(`scenarios: ${SCENARIOS.length} | dimensions: ${DIMENSIONS.join(', ')}\n`);

  const reports = await runMemBench();
  reports.sort((a, b) => b.composite - a.composite);

  // Header
  const cols = ['system', ...DIMENSIONS.map((d) => d.slice(0, 7)), 'COMPOSITE'];
  console.log(cols.map((c, i) => pad(c, i === 0 ? 16 : 11)).join(''));
  console.log('─'.repeat(16 + 11 * (DIMENSIONS.length + 1)));
  for (const r of reports) {
    const row = [
      pad(r.adapter, 16),
      ...DIMENSIONS.map((d) => pad(fmt(r.byDimension[d]), 11)),
      pad(r.composite.toFixed(3), 11),
    ];
    console.log(row.join(''));
  }

  console.log('\nHigher is better; 1.0 is ideal. Composite = mean over dimensions present.');
  const best = reports[0];
  const worst = reports[reports.length - 1];
  console.log(`\nBest: ${best.adapter} (${best.composite.toFixed(3)}) — leads ${worst.adapter} (${worst.composite.toFixed(3)}) by +${(best.composite - worst.composite).toFixed(3)}.`);
  console.log('Add an adapter in adapters.ts to score an external system (Zep, Letta, Mem0, …).\n');
}

const invokedDirectly = process.argv[1]?.includes('run');
if (invokedDirectly) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
