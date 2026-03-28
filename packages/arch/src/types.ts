// packages/arch/src/types.ts
// Architectural graph types — additive to @amp/core Entity types.

// === Entity categories ===

export type EntityCategory =
  | 'project'
  | 'domain'
  | 'module'
  | 'service'
  | 'library'
  | 'component'
  | 'infrastructure'
  | 'config';

// === Architectural properties (extend existing Entity nodes) ===

export interface ArchEntityProperties {
  category: EntityCategory;
  depth: number;
  responsibility: string;
  interface_desc: string;
  internals: string;
  file_paths: string[];
  file_hashes_json: string;
  last_indexed_at: string;
  stale: boolean;
}

// === Aspects (cross-cutting concerns) ===

export type StabilityTier = 'schema' | 'protocol' | 'implementation';

export interface AspectNode {
  id: string;
  name: string;
  description: string;
  stability_tier: StabilityTier;
  implies: string[];
  anchors: string[];
  created_at: string;
  updated_at: string;
}

// === Structural relation types ===

export type StructuralRelationType =
  | 'USES'
  | 'CALLS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'EMITS'
  | 'LISTENS';

export interface StructuralRelation {
  from_entity: string;
  to_entity: string;
  type: StructuralRelationType;
  properties?: Record<string, string>;
}

// === Impact analysis ===

export interface ImpactResult {
  entity: string;
  direct_dependents: string[];
  transitive_dependents: string[];
  co_aspect_entities: string[];
  affected_aspects: string[];
  total_blast_radius: number;
  change_risk: 'low' | 'medium' | 'high' | 'critical';
}

// === Drift detection ===

export interface DriftResult {
  entity_name: string;
  stale: boolean;
  changed_files: string[];
  unchanged_files: string[];
  missing_files: string[];
  last_indexed_at: string | null;
}

// === Deterministic context ===

export interface ArchContext {
  target: { name: string; category: string; responsibility: string };
  hierarchy: Array<{ name: string; depth: number; responsibility: string }>;
  dependencies: Array<{ name: string; relation: string; interface_desc: string }>;
  dependents: Array<{ name: string; relation: string }>;
  aspects: Array<{ name: string; stability_tier: StabilityTier; description: string }>;
  token_count: number;
}
