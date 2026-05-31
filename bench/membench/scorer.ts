// bench/membench/scorer.ts
// Pure scoring of a memory system's recall results against scenario ground truth.
// Every metric is normalized to [0,1] where 1 is ideal, so dimensions are comparable
// and combine into a single composite "effectiveness" score.

import type { MemoryItem, Probe, RecalledItem, Scenario, Dimension } from './types.js';

function topKIds(results: RecalledItem[], k: number): string[] {
  return results.slice(0, k).map((r) => r.id);
}

/** Recall@k — did we surface the relevant items at all. */
export function recallAt(top: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1;
  const set = new Set(top);
  return relevant.filter((id) => set.has(id)).length / relevant.length;
}

/** Precision@k — of what we surfaced, how much was relevant (noise control). */
export function precisionAt(top: string[], relevant: string[]): number {
  if (top.length === 0) return 0;
  const set = new Set(relevant);
  return top.filter((id) => set.has(id)).length / top.length;
}

/** Stale-resistance — 1 minus the fraction of surfaced slots polluted by stale items. */
export function staleScore(top: string[], itemsById: Map<string, MemoryItem>, k: number): number {
  if (k === 0) return 1;
  const staleHits = top.filter((id) => itemsById.get(id)?.invalidated).length;
  return 1 - staleHits / k;
}

/** Conflict resolution — current truth must appear AND outrank every stale rival shown. */
export function conflictScore(top: string[], probe: Probe): number {
  if (!probe.current) return 1;
  const currentIdx = top.indexOf(probe.current);
  if (currentIdx === -1) return 0; // current truth not even surfaced
  const stale = new Set(probe.stale ?? []);
  for (let i = 0; i < currentIdx; i++) {
    if (stale.has(top[i])) return 0; // a stale rival ranked above current
  }
  return 1;
}

/** Project isolation — 1 minus the fraction of surfaced items from the wrong project. */
export function contaminationScore(top: string[], probe: Probe, itemsById: Map<string, MemoryItem>): number {
  if (!probe.project || top.length === 0) return 1;
  const offProject = top.filter((id) => {
    const item = itemsById.get(id);
    return item && item.project !== undefined && item.project !== probe.project;
  }).length;
  return 1 - offProject / top.length;
}

/** Score a single probe on the scenario's primary dimension. */
export function scoreProbe(
  dimension: Dimension,
  probe: Probe,
  results: RecalledItem[],
  itemsById: Map<string, MemoryItem>,
): number {
  const top = topKIds(results, probe.k);
  switch (dimension) {
    case 'recall':
      return recallAt(top, probe.relevant);
    case 'precision':
      return precisionAt(top, probe.relevant);
    case 'stale':
      return staleScore(top, itemsById, probe.k);
    case 'conflict':
      return conflictScore(top, probe);
    case 'contamination':
      return contaminationScore(top, probe, itemsById);
  }
}

export interface ScenarioScore {
  scenario: string;
  dimension: Dimension;
  score: number;
}

export function scoreScenario(scenario: Scenario, perProbeResults: RecalledItem[][]): ScenarioScore {
  const itemsById = new Map(scenario.items.map((i) => [i.id, i]));
  const probeScores = scenario.probes.map((probe, i) =>
    scoreProbe(scenario.dimension, probe, perProbeResults[i] ?? [], itemsById),
  );
  const score = probeScores.reduce((a, b) => a + b, 0) / (probeScores.length || 1);
  return { scenario: scenario.name, dimension: scenario.dimension, score };
}

export interface AdapterReport {
  adapter: string;
  scenarioScores: ScenarioScore[];
  byDimension: Record<Dimension, number>;
  composite: number;
}

const ALL_DIMENSIONS: Dimension[] = ['recall', 'precision', 'conflict', 'stale', 'contamination'];

export function aggregate(adapterName: string, scenarioScores: ScenarioScore[]): AdapterReport {
  const byDimension = {} as Record<Dimension, number>;
  for (const dim of ALL_DIMENSIONS) {
    const inDim = scenarioScores.filter((s) => s.dimension === dim);
    byDimension[dim] = inDim.length ? inDim.reduce((a, s) => a + s.score, 0) / inDim.length : NaN;
  }
  const present = ALL_DIMENSIONS.map((d) => byDimension[d]).filter((v) => !Number.isNaN(v));
  const composite = present.reduce((a, b) => a + b, 0) / (present.length || 1);
  return { adapter: adapterName, scenarioScores, byDimension, composite };
}
