/**
 * Import / dependency cycle detection over the snapshot edges (deterministic,
 * pure-TS, no GDS). Finds elementary cycles among directed dependency relations
 * (`SYMBOL_IMPORTS`, Entity `USES` by default).
 *
 * Determinism + bounding: nodes and adjacency are lexicographically sorted; only
 * cycles whose lexicographically-smallest member is the DFS start are emitted
 * (canonical form, no rotation duplicates); output is capped at `maxCycles`.
 */
import type { AmpGraphSnapshot } from './types.js';

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ImportCycleOptions {
  relations?: string[];
  maxCycles?: number;
}

export function findImportCycles(
  graph: AmpGraphSnapshot,
  opts: ImportCycleOptions = {},
): string[][] {
  const relations = new Set(opts.relations ?? ['SYMBOL_IMPORTS', 'USES']);
  const maxCycles = opts.maxCycles ?? 10;

  const adj = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!relations.has(edge.relation)) continue;
    if (edge.source === edge.target) continue; // ignore self-loops
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    adj.get(edge.source)!.add(edge.target);
  }

  // Sorted adjacency lists for deterministic traversal.
  const sortedAdj = new Map<string, string[]>();
  for (const [from, tos] of adj) sortedAdj.set(from, [...tos].sort(cmp));
  const nodes = [...sortedAdj.keys()].sort(cmp);

  const cycles: string[][] = [];
  const seenKeys = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();

  const dfs = (start: string, u: string): void => {
    if (cycles.length >= maxCycles) return;
    path.push(u);
    onPath.add(u);
    for (const v of sortedAdj.get(u) ?? []) {
      if (cycles.length >= maxCycles) break;
      if (v === start && path.length >= 2) {
        const cycle = [...path];
        const key = cycle.join('>');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          cycles.push(cycle);
        }
      } else if (!onPath.has(v) && cmp(v, start) > 0) {
        // Only explore nodes greater than `start` so `start` stays the minimum
        // member — keeps each elementary cycle in one canonical orientation.
        dfs(start, v);
      }
    }
    path.pop();
    onPath.delete(u);
  };

  for (const start of nodes) {
    if (cycles.length >= maxCycles) break;
    dfs(start, start);
  }

  return cycles;
}
