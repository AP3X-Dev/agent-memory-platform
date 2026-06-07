// packages/research/src/types.ts
// Research-specific types — additive to @memberry/core types

// === Experiment statuses ===

export type ExperimentStatus =
  | 'keep'
  | 'discard'
  | 'crash'
  | 'thought'
  | 'keep*'
  | 'interesting'
  | 'timeout';

// === Graph nodes ===

export interface ExperimentNode {
  id: string;
  session_id: string;
  agent_id: string;
  campaign_id: string;
  experiment_number: number;
  branch: string;
  parent_id: string | null;
  commit_hash: string | null;
  metric_name: string;
  metric_value: number;
  secondary_metrics: Record<string, number>;
  status: ExperimentStatus;
  duration_s: number;
  hypothesis: string;
  description: string;
  insight: string;
  components_touched: string[];
  created_at: string;
  embedding?: number[];
}

export interface ComponentNode {
  id: string;
  path: string;
  name: string;
  domain: string;
  created_at: string;
}

export interface CampaignNode {
  id: string;
  campaign_id: string;
  name: string;
  objective: string;
  metric_name: string;
  metric_direction: 'lower' | 'higher';
  run_command: string;
  measure_command: string;
  scope_files: string[];
  constraints: string;
  baseline_metric: number | null;
  best_metric: number | null;
  best_commit: string | null;
  best_experiment_id: string | null;
  total_experiments: number;
  total_keeps: number;
  total_discards: number;
  consolidation_count: number;
  last_consolidation_at: string | null;
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
  updated_at: string;
}

// === Research context (assembled for THINK phase) ===

export interface ResearchContext {
  campaign: CampaignNode;
  semantic_principles: SemanticPrinciple[];
  recent_keeps: RecentKeep[];
  dead_ends: DeadEnd[];
  contradictions: Contradiction[];
  experiment_stats: ExperimentStats;
  parking_lot: string[];
}

export interface SemanticPrinciple {
  id: string;
  claim: string;
  confidence: number;
  domain: string;
  experiment_count: number;
}

export interface RecentKeep {
  id: string;
  experiment_number: number;
  description: string;
  metric_value: number;
  branch: string;
  insight: string;
  created_at: string;
}

export interface DeadEnd {
  component: string;
  domain: string;
  discard_count: number;
  last_attempt: string;
  descriptions: string[];
}

export interface Contradiction {
  principle_a: { id: string; claim: string; confidence: number };
  principle_b: { id: string; claim: string; confidence: number };
  reason: string;
}

export interface ExperimentStats {
  total: number;
  keeps: number;
  discards: number;
  crashes: number;
  thoughts: number;
  interesting: number;
}

// === Hypothesis tree ===

export interface HypothesisTreeNode {
  id: string;
  experiment_number: number;
  description: string;
  status: ExperimentStatus;
  metric_value: number;
  branch: string;
  depth: number;
  children: HypothesisTreeNode[];
}

// === Consolidation ===

export type PatternType =
  | 'component_leverage'
  | 'exhausted_direction'
  | 'confirmed_principle'
  | 'contradicted_principle'
  | 'crash_pattern'
  | 'combo_synergy';

export interface ConsolidationPattern {
  type: PatternType;
  description: string;
  evidence_ids: string[];
  confidence: number;
  suggested_action: string;
}

export interface ResearchConsolidationResult {
  patterns_detected: number;
  semantic_created: string[];
  semantic_updated: string[];
  confidence_changes: Array<{ id: string; from: number; to: number }>;
  procedural_updates: string[];
}
