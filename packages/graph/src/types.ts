/**
 * Core graph snapshot types for @amp/graph.
 *
 * A snapshot is a deterministic, project-scoped, bounded, secret-safe in-memory
 * view of the AMP Neo4j graph. It is the single choke point that every later
 * capability (report, export, community detection, PR impact) consumes, so the
 * property allowlist / redaction lives here at the snapshot boundary.
 */

export type AmpGraphNodeType =
  | 'entity'
  | 'component'
  | 'symbol'
  | 'semantic'
  | 'episodic'
  | 'fact'
  | 'source'
  | 'aspect'
  | 'community'
  | 'unknown';

export interface AmpGraphNode {
  id: string;
  label: string;
  type: AmpGraphNodeType;
  source_file?: string;
  source_location?: string;
  project_tag?: string;
  /** Allowlisted, redacted property bag — never carries secrets or vectors. */
  properties: Record<string, unknown>;
}

export interface AmpGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence?: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  confidence_score?: number;
  source_file?: string;
  source_location?: string;
  weight?: number;
  properties: Record<string, unknown>;
}

export interface AmpGraphSnapshot {
  project_tag?: string;
  project_name?: string;
  generated_at: string;
  source_commit?: string;
  nodes: AmpGraphNode[];
  edges: AmpGraphEdge[];
  /** True when a per-query LIMIT was hit and the snapshot is incomplete. */
  truncated: boolean;
  /** Best-effort count of nodes available before truncation. */
  total_available: number;
}

export interface SnapshotInput {
  project_tag?: string;
  project_name?: string;
  include_symbols?: boolean;
  include_semantics?: boolean;
  include_episodes?: boolean;
  include_facts?: boolean;
  include_sources?: boolean;
  include_aspects?: boolean;
  max_nodes?: number;
}

export interface GraphReportInput {
  project_tag?: string;
  project_name?: string;
  /** Per-section cap (default 10). */
  max_items?: number;
  include_symbols?: boolean;
  include_semantics?: boolean;
  include_facts?: boolean;
  include_episodes?: boolean;
  include_sources?: boolean;
}

export interface GraphReportStats {
  nodes: number;
  edges: number;
  semantic_count: number;
  symbol_count: number;
  fact_count: number;
  source_count: number;
  entity_count: number;
}

export interface GraphReportResult {
  markdown: string;
  stats: GraphReportStats;
}
