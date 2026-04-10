// packages/retrieval/src/index.ts

// Types
export type {
  SourceType,
  RetrievalResult,
  RetrievalStrategy,
  RetrievalOptions,
  UnifiedContext,
  ContextSection,
  ContextItem,
  FeedbackSignal,
  BoostFactors,
} from './types.js';

// Query expansion
export { expandQuery } from './expand.js';
export type { ExpandedQuery } from './expand.js';

// Intent classification
export { classifyIntent } from './intent.js';
export type { QueryIntent, IntentResult } from './intent.js';

// Scoring
export {
  scaleRrfK,
  lexicalTextScore,
  normalizeScores,
  computeQueryStats,
  adaptiveWeights,
  mmrDiversify,
} from './scoring.js';

// Fusion
export { rrfFusion, dedup } from './fusion.js';

// Deterministic assembly
export { DeterministicAssembler } from './deterministic.js';

// Feedback
export { FeedbackTracker } from './feedback.js';
export type { FeedbackRedisLayer } from './feedback.js';

// Unified assembler
export { UnifiedAssembler } from './assembler.js';
export type { AssemblerCodeLayer, AssemblerMemoryLayer } from './assembler.js';

// MCP tools
export { registerRetrievalTools, setRetrievalServiceInstances, RETRIEVAL_TOOL_NAMES } from './tools.js';
export type { IUnifiedAssembler, IFeedbackTracker, RetrievalRegisteredTools } from './tools.js';
