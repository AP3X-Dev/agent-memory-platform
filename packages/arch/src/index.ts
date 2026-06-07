// packages/arch/src/index.ts

// Types
export type {
  EntityCategory,
  ArchEntityProperties,
  StabilityTier,
  AspectNode,
  StructuralRelationType,
  StructuralRelation,
  ImpactResult,
  DriftResult,
  ArchContext,
} from './types.js';

// Stores
export { ArchEntityStore } from './entity-store.js';
export { AspectStore } from './aspect-store.js';
export { StructuralRelationStore } from './relation-store.js';

// Services
export { ImpactAnalyzer } from './impact.js';
export { DriftDetector } from './drift.js';
export { ArchContextBuilder } from './context.js';

// Schema
export { initArchSchema } from './schema.js';

// MCP tools
export { registerArchTools, setArchServiceInstances, createArchContainer, ARCH_TOOL_NAMES } from './tools.js';
export type {
  IArchEntityStore,
  IAspectStore,
  IStructuralRelationStore,
  IImpactAnalyzer,
  IDriftDetector,
  IArchContextBuilder,
  ArchServiceContainer,
} from './tools.js';
