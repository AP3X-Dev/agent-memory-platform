// packages/code/src/types.ts
// Code intelligence types — symbol-level graph nodes and relationships.

// === Supported languages ===

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'sql'
  | 'terraform'
  | 'mcp-config';

export const LANGUAGE_EXTENSIONS: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.sql': 'sql',
  '.tf': 'terraform',
  '.tfvars': 'terraform',
  '.hcl': 'terraform',
};

/** Config files detected by basename (extname-based routing fails — `.mcp.json` → `.json`). */
const MCP_CONFIG_BASENAMES = new Set<string>([
  'mcp.json',
  '.mcp.json',
  'claude_desktop_config.json',
  '.cursor-mcp.json',
]);

export function isMcpConfigBasename(name: string): boolean {
  return MCP_CONFIG_BASENAMES.has(name.toLowerCase());
}

/**
 * Resolve a file's language by BASENAME first (for config files whose extname is
 * unhelpful, e.g. `.mcp.json`), then by extension. Returns undefined for files
 * MemBerry does not index. Use this everywhere instead of `LANGUAGE_EXTENSIONS[ext]`.
 */
export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  const base = (filePath.split(/[\\/]/).pop() ?? '').toLowerCase();
  if (isMcpConfigBasename(base)) return 'mcp-config';
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot) : '';
  return LANGUAGE_EXTENSIONS[ext];
}

// === Symbol kinds ===

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'variable'
  | 'enum'
  | 'module'
  | 'constant'
  // Structural (non-code) kinds from SQL / Terraform / MCP-config extractors.
  | 'table'
  | 'view'
  | 'resource'
  | 'config';

// === Sparse vector ===

export interface SparseVector {
  indices: number[];
  values: number[];
}

// === Symbol node ===

export interface SymbolNode {
  id: string;
  name: string;
  kind: SymbolKind;
  language: SupportedLanguage;
  file_path: string;
  start_line: number;
  end_line: number;
  signature: string;
  doc_comment: string;
  content_hash: string;
  parent_symbol: string | null;
  embedding?: number[];
  lexical_vector?: number[];
  mini_vector?: number[];
  sparse_indices?: number[];
  sparse_values?: number[];
  created_at: string;
  updated_at: string;
}

// === Symbol relationships ===

export type SymbolRelationType =
  | 'SYMBOL_CALLS'
  | 'SYMBOL_IMPORTS'
  | 'SYMBOL_INHERITS'
  | 'SYMBOL_IMPLEMENTS'
  | 'SYMBOL_CONTAINS';

export interface SymbolRelation {
  from_symbol: string;
  to_symbol: string;
  type: SymbolRelationType;
}

// === Parser output ===

export interface ParsedFile {
  file_path: string;
  language: SupportedLanguage;
  symbols: SymbolNode[];
  relations: SymbolRelation[];
  imports: ImportInfo[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  file_path: string;
  line: number;
}

// === Indexing ===

export interface IndexResult {
  files_parsed: number;
  files_skipped: number;
  symbols_created: number;
  symbols_updated: number;
  relations_created: number;
  errors: Array<{ file: string; error: string }>;
}

// === Search ===

export interface CodeSearchResult {
  id: string;
  source_type: 'symbol' | 'semantic';
  name: string;
  kind: string;
  language?: string;
  file_path: string;
  start_line: number;
  signature: string;
  doc_comment: string;
  score: number;
  content?: string;
}

export interface CodeContext {
  task: string;
  symbols: CodeSearchResult[];
  semantic_memories: Array<{ id: string; content: string; confidence: number }>;
  token_count: number;
}
