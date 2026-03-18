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
