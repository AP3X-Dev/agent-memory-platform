// packages/research/src/index.ts
// Barrel exports for @amp/research

// Types
export type {
  ExperimentStatus,
  ExperimentNode,
  ComponentNode,
  CampaignNode,
  ResearchContext,
  SemanticPrinciple,
  RecentKeep,
  DeadEnd,
  Contradiction,
  ExperimentStats,
  HypothesisTreeNode,
  PatternType,
  ConsolidationPattern,
  ResearchConsolidationResult,
} from './types.js';

// Stores
export { ExperimentStore } from './experiment.js';
export { CampaignStore } from './campaign.js';

// Query & analysis
export { HypothesisNavigator } from './hypothesis.js';
export { ResearchContextBuilder } from './context.js';
export { ContradictionDetector } from './contradictions.js';
export { ResearchConsolidation } from './consolidation.js';

// Schema
export { initResearchSchema, verifyResearchSchema } from './schema.js';

// MCP tools
export { registerResearchTools, setResearchServiceInstances, RESEARCH_TOOL_NAMES } from './tools.js';
export type {
  IExperimentStore,
  ICampaignStore,
  IResearchContextBuilder,
  IHypothesisNavigator,
  IContradictionDetector,
  IResearchConsolidation,
} from './tools.js';
