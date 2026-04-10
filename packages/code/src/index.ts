// packages/code/src/index.ts

// Types
export type {
  SupportedLanguage,
  SymbolKind,
  SymbolNode,
  SymbolRelationType,
  SymbolRelation,
  ParsedFile,
  ImportInfo,
  IndexResult,
  CodeSearchResult,
  CodeContext,
  SparseVector,
} from './types.js';
export { LANGUAGE_EXTENSIONS } from './types.js';

// Parser
export { parseFile } from './parser.js';

// Vectors
export {
  splitIdentifier,
  tokenizeForVectors,
  generateLexicalVector,
  generateMiniVector,
  generateSparseVector,
} from './vectors.js';

// Stores
export { SymbolStore } from './symbol-store.js';

// Services
export { CodeIndexer } from './indexer.js';
export { ImportResolver } from './resolver.js';
export { CodeSearch } from './search.js';

// Schema
export { initCodeSchema } from './schema.js';

// Watcher
export { CodeWatcher, extractFilePaths } from './watcher.js';
export type { CodeWatcherOptions, IFileIndexer, ISymbolDeleter } from './watcher.js';

// MCP tools
export { registerCodeTools, setCodeServiceInstances, CODE_TOOL_NAMES } from './tools.js';
export type { ICodeIndexer, ICodeSearch, ISymbolStore } from './tools.js';
