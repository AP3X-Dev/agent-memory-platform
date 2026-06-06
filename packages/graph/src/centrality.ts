/**
 * Core Abstractions ranking — pure-TS weighted degree over the snapshot edges
 * ONLY (Critical Issue #1 / Correction C-19). No GDS, no centrality library, no
 * community detection. Deterministic: ties broken by raw degree then id.
 *
 * "Weighted degree" sums edge weights incident to a node (in + out), where edge
 * weights bias structural/code/architecture relations above memory provenance
 * (assigned in snapshot.ts) so semantic edges do not dominate.
 */
import type { AmpGraphNodeType, AmpGraphSnapshot } from './types.js';

export interface CoreNode {
  id: string;
  label: string;
  type: AmpGraphNodeType;
  weighted_degree: number;
  degree: number;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function rankCoreNodes(graph: AmpGraphSnapshot, limit = 10): CoreNode[] {
  const weighted = new Map<string, number>();
  const degree = new Map<string, number>();

  for (const edge of graph.edges) {
    const w = typeof edge.weight === 'number' ? edge.weight : 1;
    weighted.set(edge.source, (weighted.get(edge.source) ?? 0) + w);
    weighted.set(edge.target, (weighted.get(edge.target) ?? 0) + w);
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  return [...weighted.entries()]
    .filter(([id]) => nodeById.has(id))
    .map(([id, w]) => {
      const node = nodeById.get(id)!;
      return {
        id,
        label: node.label,
        type: node.type,
        weighted_degree: w,
        degree: degree.get(id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.weighted_degree - a.weighted_degree ||
        b.degree - a.degree ||
        cmp(a.id, b.id),
    )
    .slice(0, Math.max(0, limit));
}
