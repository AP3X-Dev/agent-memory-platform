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
}

// === Consolidation ===

export type ProposalType = 'promote' | 'merge' | 'supersede' | 'decay';

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
}

// === Embedding ===

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// === Signal weights ===

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  correction: 5.0,
  contradiction: 3.0,
  reinforcement: 1.0,
};

export const RECENCY_DECAY_DAYS = 7;

// === Temporal Facts ===

export type FactStatus = 'active' | 'invalidated' | 'disputed' | 'tentative';
export type FactScope = 'user' | 'project' | 'repo' | 'agent' | 'session';

export interface FactNode {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  source_episode_ids: string[];
  valid_at: string;
  invalid_at: string | null;
  confidence: number;
  status: FactStatus;
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
];
