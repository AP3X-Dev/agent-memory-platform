// @amp/graph — graph analytics, reporting, and export over the AMP Neo4j graph.

// Types
export * from './types.js';

// Neo4j integer coercion
export { toNum, isNeo4jInt } from './coerce.js';

// Secret-safety boundary
export {
  PROPERTY_ALLOWLIST,
  applyAllowlist,
  sanitizeEdgeProps,
  redactSecrets,
  redactValue,
} from './allowlist.js';

// Snapshot
export { GraphSnapshotService, DEFAULT_MAX_NODES } from './snapshot.js';

// Schema
export { initGraphSchema } from './schema.js';

// Report building blocks
export { rankCoreNodes } from './centrality.js';
export type { CoreNode } from './centrality.js';
export { findImportCycles } from './import-cycles.js';
export type { ImportCycleOptions } from './import-cycles.js';
export { renderGraphReport } from './report-renderer.js';

// Export (portable artifacts)
export { GraphExportService, resolveSafeOutputPath } from './export.js';
export { exportJson, buildJsonDocument } from './export-json.js';
export type { GraphJsonDocument } from './export-json.js';
export {
  exportHtml,
  escapeHtml,
  escapeJsonForScript,
  selectRenderNodes,
  DEFAULT_MAX_RENDER_NODES,
} from './export-html.js';

// Report service
export { GraphReportService } from './report.js';
export type {
  GraphReportSections,
  ConfidenceSummary,
  KnowledgeGaps,
  LowConfidenceKnowledge,
  LowConfidenceSemantic,
  NonFinalFact,
} from './report.js';

// MCP tool registration
export {
  GRAPH_TOOL_NAMES,
  registerGraphTools,
  setGraphServiceInstances,
  graphServicesReady,
} from './tools.js';
export type {
  IGraphSnapshotService,
  IGraphReportService,
  IGraphExportService,
} from './tools.js';
