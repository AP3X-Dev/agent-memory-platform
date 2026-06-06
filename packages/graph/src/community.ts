/**
 * Knowledge clustering — deterministic, pure-TS community detection over a graph
 * snapshot. NO GDS, no external library, no graph writes. Communities are an
 * in-memory analytics OVERLAY: they are surfaced in the report ("Knowledge
 * Areas") and the visual map, but never persisted, so they can never pollute
 * amp_load / retrieval / consolidation (Correction C-07 is sidestepped entirely
 * by not writing them).
 *
 * Algorithm: modularity-maximizing local moving (one Louvain level) on the
 * undirected, edge-weighted graph. Each node greedily moves to the neighbouring
 * community giving the largest modularity gain, iterating to convergence.
 * Determinism: nodes visited in sorted-id order, candidate communities in id
 * order, gain ties broken toward the smaller community id, fixed pass cap, and
 * canonical relabelling (communities sorted by size desc then smallest-member
 * id). This separates cliques that plain label propagation collapses across a
 * single bridge edge.
 */
import type { AmpGraphSnapshot } from './types.js';

export interface Community {
  /** Canonical, stable community id (0-based). */
  id: number;
  /** Human-readable theme name — the label of the most central member. */
  label: string;
  /** Smallest member id (stable representative). */
  representative: string;
  /** Member node ids, sorted. */
  members: string[];
  /** Labels of the top-degree members (for display). */
  sample: string[];
  size: number;
  internal_edges: number;
  /** Internal edge density in [0,1]. */
  cohesion: number;
}

export interface CommunityResult {
  communities: Community[];
  membership: Map<string, number>;
  /** Number of non-trivial communities (size >= 2). */
  count: number;
}

export interface CommunityOptions {
  maxPasses?: number;
  /** Sample member count shown per community. */
  sampleSize?: number;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function detectCommunities(
  graph: AmpGraphSnapshot,
  opts: CommunityOptions = {},
): CommunityResult {
  const maxPasses = opts.maxPasses ?? 20;
  const sampleSize = opts.sampleSize ?? 3;

  const n = graph.nodes.length;
  if (n === 0) return { communities: [], membership: new Map(), count: 0 };

  // Stable index order by node id.
  const order = graph.nodes.map((_, i) => i).sort((a, b) => cmp(graph.nodes[a]!.id, graph.nodes[b]!.id));
  const indexOf = new Map<string, number>();
  graph.nodes.forEach((node, i) => indexOf.set(node.id, i));

  // Undirected weighted adjacency + weighted degree.
  const adj: Array<Map<number, number>> = graph.nodes.map(() => new Map());
  const deg = new Array<number>(n).fill(0);
  const addAdj = (a: number, b: number, w: number) => {
    adj[a]!.set(b, (adj[a]!.get(b) ?? 0) + w);
  };
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    const a = indexOf.get(e.source);
    const b = indexOf.get(e.target);
    if (a === undefined || b === undefined) continue;
    const w = typeof e.weight === 'number' && e.weight > 0 ? e.weight : 1;
    addAdj(a, b, w);
    addAdj(b, a, w);
    deg[a]! += w;
    deg[b]! += w;
  }

  const twoM = deg.reduce((s, d) => s + d, 0); // = 2 * total edge weight

  // Local moving (modularity). With no edges, every node stays a singleton.
  const comm = graph.nodes.map((_, i) => i);
  const commTot = deg.slice();
  if (twoM > 0) {
    for (let pass = 0; pass < maxPasses; pass++) {
      let moved = false;
      for (const i of order) {
        const ci = comm[i]!;
        const ki = deg[i]!;
        commTot[ci]! -= ki;

        // Weight from i into each candidate community.
        const links = new Map<number, number>();
        links.set(ci, 0);
        for (const [j, w] of adj[i]!) {
          const cj = comm[j]!;
          links.set(cj, (links.get(cj) ?? 0) + w);
        }

        let bestC = ci;
        let bestGain = (links.get(ci) ?? 0) - (commTot[ci]! * ki) / twoM;
        for (const c of [...links.keys()].sort((a, b) => a - b)) {
          const gain = (links.get(c) ?? 0) - (commTot[c]! * ki) / twoM;
          if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && c < bestC)) {
            bestGain = gain;
            bestC = c;
          }
        }

        comm[i] = bestC;
        commTot[bestC]! += ki;
        if (bestC !== ci) moved = true;
      }
      if (!moved) break;
    }
  }

  // Group node ids by final community index.
  const groups = new Map<number, string[]>();
  for (const i of order) {
    const c = comm[i]!;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(graph.nodes[i]!.id);
  }

  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const degById = new Map<string, number>();
  graph.nodes.forEach((node, i) => degById.set(node.id, deg[i]!));

  // Canonical ordering: size desc, then smallest-member id asc.
  const raw = [...groups.values()].map((members) => {
    const sorted = [...members].sort(cmp);
    return { members: sorted, representative: sorted[0]! };
  });
  raw.sort((a, b) => b.members.length - a.members.length || cmp(a.representative, b.representative));

  const groupIndexOf = new Map<string, number>();
  raw.forEach((g, i) => g.members.forEach((m) => groupIndexOf.set(m, i)));
  const internalEdges = new Array<number>(raw.length).fill(0);
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    const gi = groupIndexOf.get(e.source);
    const gj = groupIndexOf.get(e.target);
    if (gi !== undefined && gi === gj) internalEdges[gi]! += 1;
  }

  const communities: Community[] = raw.map((g, i) => {
    const size = g.members.length;
    const possible = size > 1 ? (size * (size - 1)) / 2 : 0;
    const cohesion = possible > 0 ? Math.min(1, internalEdges[i]! / possible) : 0;
    const byDegree = [...g.members].sort(
      (a, b) => (degById.get(b) ?? 0) - (degById.get(a) ?? 0) || cmp(a, b),
    );
    const naming = byDegree[0]!;
    return {
      id: i,
      label: labelById.get(naming) ?? naming,
      representative: g.representative,
      members: g.members,
      sample: byDegree.slice(0, sampleSize).map((m) => labelById.get(m) ?? m),
      size,
      internal_edges: internalEdges[i]!,
      cohesion,
    };
  });

  const membership = new Map<string, number>();
  communities.forEach((c) => c.members.forEach((m) => membership.set(m, c.id)));

  return {
    communities,
    membership,
    count: communities.filter((c) => c.size >= 2).length,
  };
}
