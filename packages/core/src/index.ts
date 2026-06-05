// packages/core/src/index.ts
export * from './types.js';
export { OpenAIEmbedding } from './embedding.js';
export { rankMemories, rankFacts, budgetTokens, estimateTokens } from './ranking.js';
export { AMPService } from './service.js';
export type { RedisLayer, Neo4jLayer, FactLayer, BlocksLayer } from './service.js';
export { normalizePredicate, getPredicateSynonyms } from './service.js';
export { ConsolidationEngine } from './consolidation.js';
export type { ConsolidationRedisLayer, ConsolidationNeo4jLayer, RunResult } from './consolidation.js';
export { renderToMarkdown, parseFromMarkdown, diffEntries } from './markdown.js';
export type { DiffResult, MarkdownEntry } from './markdown.js';
export { exportAll, exportFiltered } from './export.js';
export type { ExportResult, ExportFilter } from './export.js';
export { importFromPath } from './import.js';
export type { ImportOptions, ImportResult, ImportStrategy } from './import.js';
export { BootstrapGraphService } from './bootstrap-graph.js';
export { MemoryBlockService, MAX_BLOCK_SIZE } from './blocks.js';
export type { RedisBlockLayer, Neo4jBlockLayer, CacheInvalidator } from './blocks.js';
export type { BootstrapInput, BootstrapResult, BootstrapEntity, BootstrapSemantic, BootstrapAgent } from './bootstrap-graph.js';
export { extractFacts, isTransientError } from './extract.js';
export { createCoreServices } from './services-factory.js';
export type { CoreServices, CoreServicesEnv } from './services-factory.js';
export {
  loadSettings,
  saveSettings,
  getSettingsPath,
  resolveNumber,
  DEFAULT_SETTINGS,
} from './config/settings.js';
export type { AmpSettings, HookSettings, ResolvedNumber, SettingSource } from './config/settings.js';
export { getConfigStatus } from './config/status.js';
export type { ConfigStatus } from './config/status.js';
export { getHooksStatus } from './cli/install.js';
export type { HooksStatus } from './cli/install.js';
