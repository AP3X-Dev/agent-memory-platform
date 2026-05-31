// bench/membench/types.ts
//
// MemBench — a system-agnostic agent-memory benchmark.
//
// The thesis (per the agent-memory eval literature: MemoryAgentBench, LongMemEval,
// MemGym): for a coding/agent memory layer, raw recall is necessary but NOT the goal.
// The winning memory system is the one that surfaces the SMALLEST amount of
// high-leverage context at the right moment — current truth, in-scope, low noise —
// WITHOUT leaking stale assumptions or contaminating across projects.
//
// MemBench measures exactly those agent-relevant properties, and it does so through a
// thin adapter so the SAME suite scores AMP, a naive baseline, or any external system
// (Zep, Letta, Mem0, …) once an adapter is written.

/** A unit of memory an agent would store. */
export interface MemoryItem {
  id: string;
  text: string;
  ts: number; // logical insertion time (higher = more recent)
  project?: string; // project scope, e.g. "web", "api"
  kind?: 'fact' | 'decision' | 'symbol' | 'instruction';
  /** True when this item has been superseded / is no longer current truth. */
  invalidated?: boolean;
  confidence?: number; // optional prior confidence in [0,1]
}

/** What a memory system returns for a query — the context the agent would read. */
export interface RecalledItem {
  id: string;
  score: number;
}

/**
 * The ONLY contract a memory system must satisfy to be benchmarked. Implement this for
 * AMP, Zep, Letta, a naive baseline, etc. Keep it minimal on purpose.
 */
export interface MemorySystemAdapter {
  readonly name: string;
  /** Clear all stored memory before a scenario. */
  reset(): Promise<void>;
  /** Store one memory item. */
  remember(item: MemoryItem): Promise<void>;
  /** Return up to k items for a query, optionally scoped to a project. */
  recall(query: string, opts: { k: number; project?: string }): Promise<RecalledItem[]>;
}

export type Dimension = 'recall' | 'precision' | 'conflict' | 'stale' | 'contamination';

/** One probe (query) with its ground truth. */
export interface Probe {
  query: string;
  k: number;
  project?: string;
  /** Ids that genuinely answer the query. */
  relevant: string[];
  /** Ids that are outdated/superseded for this query (must NOT surface near the top). */
  stale?: string[];
  /** The single current-truth id, when this probe tests conflict resolution. */
  current?: string;
}

/** A scenario = a memory state (items) + probes that exercise one dimension. */
export interface Scenario {
  name: string;
  dimension: Dimension;
  description: string;
  items: MemoryItem[];
  probes: Probe[];
}
