// === Node Types ===

export interface EpisodicNode {
  id: string;
  session_id: string;
  agent_id: string;
  task: string;
  content: string;
  embedding?: number[];
  outcome?: 'approved' | 'revised' | 'rejected' | 'abandoned';
  signals?: Signal[];
  created_at: string;
  ttl?: number;
  scope?: string;
  tags?: string[];
}

export interface SemanticNode {
  id: string;
  content: string;
  embedding?: number[];
  confidence: number;
  signal_count: number;
  created_at: string;
  updated_at: string;
  decay_class: 'volatile' | 'stable' | 'permanent';
  tags: string[];
}

export interface EntityNode {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  created_at: string;
}

export interface AgentNode {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export interface ModelNode {
  id: string;
  name: string;
  provider: string;
}

// === Signals ===

export type SignalType = 'reinforcement' | 'correction' | 'contradiction';

export interface Signal {
  type: SignalType;
  target_id: string;
  detail: string;
}

export interface StreamSignal extends Signal {
  source_session: string;
  agent_id: string;
  timestamp: string;
}

// === LOAD ===

export interface LoadScope {
  task: string;
  entities?: string[];
  tags?: string[];
  max_tokens?: number;
  temporal?: TemporalOptions;
  session_id?: string;
}

export interface MemoryContext {
  markdown: string;
  tokens: number;
  sources: string[];
  assembled_at: string;
}

// === STORE ===

export interface EpisodeInput {
  session_id: string;
  agent_id: string;
  task: string;
  content: string;
  outcome?: 'approved' | 'revised' | 'rejected' | 'abandoned';
  signals?: Signal[];
  entities?: string[];
  model_id?: string;
  scope?: string;
  tags?: string[];
}

// === Consolidation ===

export type ProposalType = 'promote' | 'merge' | 'supersede' | 'decay' | 'reinforce';

export interface ConsolidationProposal {
  id: string;
  type: ProposalType;
  scope: string;
  affected_ids: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  score: number;
  created_at: string;
}

// === Session ===

export interface SessionState {
  agent_id: string;
  task: string;
  stage: string;
  loaded_memories: string[];
  pending_signals: Signal[];
}

// === Config ===

export interface AMPConfig {
  redis: { url: string };
  neo4j: { uri: string; user: string; password: string };
  embedding: { provider: 'openai'; apiKey: string };
  cache: { defaultTTL: number; contextTTL: number; embeddingTTL: number };
  consolidation: { autoApply: boolean; signalThreshold: number };
  exportPath: string;
  /**
   * Per-task chat-completion model selection (see packages/core/src/llm.ts).
   * Omitted keys fall back to DEFAULT_MODELS. Sourced from AMP_MODEL_* env vars.
   */
  models?: {
    extraction?: string;
    synthesis?: string;
    dream?: string;
  };
}

// === Embedding ===

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface ExtractionProvider {
  extractAll(content: string): Promise<{
    entities: Array<{ name: string; type?: string; description?: string }>;
    claims: Array<{ content: string; about: string[]; confidence: number; tags: string[] }>;
  }>;
}

// === Signal weights ===

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  correction: 5.0,
  contradiction: 3.0,
  reinforcement: 1.0,
};

export const RECENCY_DECAY_DAYS = 7;
/** OpenAI text-embedding-3-small default dimension. Used across all vector indexes. */
export const EMBEDDING_DIM = 1536;
// === Temporal Facts ===

export type FactStatus = 'active' | 'invalidated' | 'disputed' | 'tentative';
export type FactScope = 'user' | 'project' | 'repo' | 'agent' | 'session';

/**
 * How a fact came to be known:
 *   deductive — explicitly stated or directly derived (the default; explicit capture)
 *   inductive — generalized from patterns across episodes (consolidation-minted)
 *   abductive — a best-guess hypothesis (dream-minted; low confidence, to be confirmed/killed)
 */
export type InferenceType = 'deductive' | 'inductive' | 'abductive';

export interface FactNode {
  id: string;
  subject: string;
  predicate: string;
  original_predicate?: string;   // preserved when normalization changed the predicate
  object: string;
  entity_id: string | null;      // canonical Entity.id — primary lookup key
  source_episode_ids: string[];
  valid_at: string;
  invalid_at: string | null;
  confidence: number;
  status: FactStatus;
  /** Provenance of the claim. Defaults to 'deductive' when absent (legacy rows). */
  inference_type?: InferenceType;
  supersedes_fact_id: string | null;
  scope: FactScope;
  embedding?: number[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FactInput {
  subject: string;
  predicate: string;
  object: string;
  source_episode_ids: string[];
  valid_at?: string;
  confidence?: number;
  inference_type?: InferenceType;
  scope?: FactScope;
  tags?: string[];
}

export interface TemporalOptions {
  time_mode?: 'current' | 'historical' | 'interval' | 'evolution';
  as_of?: string;
  from?: string;
  to?: string;
  include_invalidated?: boolean;
}

export interface FactDiff {
  entity: string;
  from: string;
  to: string;
  added: FactNode[];
  invalidated: FactNode[];
  changed: Array<{ before: FactNode; after: FactNode }>;
}

export interface FactTimeline {
  entity: string;
  facts: Array<FactNode & { event: 'created' | 'invalidated' | 'disputed' | 'superseded'; at: string }>;
}

// === Memory Tiers ===

export type MemoryTier = 'core' | 'working' | 'archive';

export interface MemoryBlock {
  id: string;
  name: string;
  tier: MemoryTier;
  content: string;
  scope: string;
  agent_id?: string;
  session_id?: string;
  max_tokens?: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryBlockInput {
  name: string;
  tier: MemoryTier;
  content: string;
  scope: string;
  agent_id?: string;
  session_id?: string;
  max_tokens?: number;
}

export const DEFAULT_BLOCKS: Array<{ name: string; tier: MemoryTier; description: string }> = [
  { name: 'persona', tier: 'core', description: 'Agent identity and capabilities' },
  { name: 'user', tier: 'core', description: 'User profile, preferences, role' },
  { name: 'current_objective', tier: 'core', description: 'What the agent is working on' },
  { name: 'working_state', tier: 'working', description: 'Scratchpad, partial results, current branch' },
  { name: 'project_state', tier: 'core', description: 'Project conventions, active decisions' },
  { name: 'open_questions', tier: 'working', description: 'Unresolved items needing attention' },
  // Machine-owned, auto-regenerated by the dream pass (see dream.ts refreshCards).
  // Kept separate from the human-authored `user`/`project_state` blocks so the
  // dream pass never clobbers human content.
  { name: 'project_card', tier: 'core', description: 'Auto-generated compact project summary (dream-refreshed)' },
  { name: 'user_card', tier: 'core', description: 'Auto-generated compact user summary (dream-refreshed)' },
];

/** Machine-owned core blocks that the dream pass regenerates. Rendered after human blocks. */
export const CARD_BLOCK_NAMES = ['project_card', 'user_card'] as const;
