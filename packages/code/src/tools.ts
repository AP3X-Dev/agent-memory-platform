// packages/code/src/tools.ts
// MCP tools for code intelligence.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IndexResult, CodeSearchResult, SymbolNode, SymbolKind } from './types.js';

// ─── Service interfaces (injected) ───────────────────────────────────────────

export interface ICodeIndexer {
  indexProject(rootPath: string, options?: { include?: string[]; exclude?: string[] }): Promise<IndexResult>;
  indexFile(filePath: string, language: string): Promise<{ symbols_created: number; symbols_updated: number; relations_created: number }>;
}

export interface ICodeSearch {
  search(query: string, options?: {
    language?: string; file_path?: string; kind?: string; limit?: number; include_semantics?: boolean;
  }): Promise<CodeSearchResult[]>;
  buildContext(task: string, maxTokens?: number): Promise<{ task: string; symbols: CodeSearchResult[]; semantic_memories: Array<{ id: string; content: string; confidence: number }>; token_count: number }>;
  renderContextMarkdown(ctx: { task: string; symbols: CodeSearchResult[]; semantic_memories: Array<{ id: string; content: string; confidence: number }>; token_count: number }): string;
}

export interface ISymbolStore {
  getByFile(filePath: string): Promise<SymbolNode[]>;
  findByName(name: string, kind?: SymbolKind): Promise<SymbolNode[]>;
  getCallers(symbolName: string): Promise<SymbolNode[]>;
  getCallees(symbolName: string): Promise<SymbolNode[]>;
  getImporters(symbolName: string): Promise<SymbolNode[]>;
  getInheritanceChain(symbolName: string): Promise<SymbolNode[]>;
}

// ─── Injected instances ──────────────────────────────────────────────────────

let codeIndexer: ICodeIndexer | null = null;
let codeSearch: ICodeSearch | null = null;
let symbolStore: ISymbolStore | null = null;

export function setCodeServiceInstances(services: {
  codeIndexer: ICodeIndexer;
  codeSearch: ICodeSearch;
  symbolStore: ISymbolStore;
}): void {
  codeIndexer = services.codeIndexer;
  codeSearch = services.codeSearch;
  symbolStore = services.symbolStore;
}

// ─── Tool names ──────────────────────────────────────────────────────────────

export const CODE_TOOL_NAMES = [
  'amp_code_index',
  'amp_code_search',
  'amp_code_symbols',
  'amp_code_deps',
  'amp_code_context',
] as const;

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerCodeTools(server: McpServer): void {

  // ─── amp_code_index ─────────────────────────────────────────────────────
  server.tool(
    'amp_code_index',
    'Index a project or file using tree-sitter AST parsing. Creates Symbol nodes (functions, classes, methods, interfaces, types) and relationship edges (SYMBOL_CALLS, SYMBOL_IMPORTS, SYMBOL_INHERITS, SYMBOL_CONTAINS) in the graph. Incremental: unchanged symbols are skipped via content hash. Supports: TypeScript, JavaScript, Python, Go, Rust.',
    {
      path: z.string().describe('Absolute path to project directory or single file'),
      mode: z.enum(['project', 'file']).optional().default('project').describe('Index entire project or a single file'),
      language: z.string().optional().describe('Language hint for single-file mode (typescript, javascript, python, go, rust)'),
      include: z.array(z.string()).optional().describe('Include patterns (e.g., ["src/", "lib/"])'),
      exclude: z.array(z.string()).optional().describe('Additional directories to exclude'),
    },
    async (args) => {
      if (!codeIndexer) throw new Error('Code services not initialised');

      if (args.mode === 'file') {
        const lang = args.language ?? 'typescript';
        const result = await codeIndexer.indexFile(args.path, lang);
        return textContent(JSON.stringify(result, null, 2));
      }

      const result = await codeIndexer.indexProject(args.path, {
        include: args.include,
        exclude: args.exclude,
      });
      return textContent(JSON.stringify({
        ...result,
        errors: result.errors.slice(0, 10),
        errors_truncated: result.errors.length > 10,
      }, null, 2));
    },
  );

  // ─── amp_code_search ────────────────────────────────────────────────────
  server.tool(
    'amp_code_search',
    'Hybrid search across code symbols AND semantic memories. Combines fulltext search (symbol names, signatures, doc comments) with vector search and RRF fusion. Returns blended results ranked by relevance.',
    {
      query: z.string().describe('Search query (natural language or symbol name)'),
      language: z.string().optional().describe('Filter by language'),
      file_path: z.string().optional().describe('Filter by file path (substring match)'),
      kind: z.string().optional().describe('Filter by symbol kind (function, class, method, interface, type, variable, enum)'),
      limit: z.number().int().positive().optional().default(20).describe('Max results'),
      include_semantics: z.boolean().optional().default(true).describe('Include semantic memory results alongside code'),
    },
    async (args) => {
      if (!codeSearch) throw new Error('Code services not initialised');
      const results = await codeSearch.search(args.query, {
        language: args.language,
        file_path: args.file_path,
        kind: args.kind,
        limit: args.limit,
        include_semantics: args.include_semantics,
      });

      const formatted = results.map((r) => ({
        name: r.name,
        kind: r.kind,
        source: r.source_type,
        file: r.file_path ? `${r.file_path}:${r.start_line}` : undefined,
        signature: r.signature,
        doc: r.doc_comment?.slice(0, 100) || undefined,
        score: r.score.toFixed(4),
      }));
      return textContent(JSON.stringify(formatted, null, 2));
    },
  );

  // ─── amp_code_symbols ───────────────────────────────────────────────────
  server.tool(
    'amp_code_symbols',
    'Query specific symbols in the indexed codebase. Find by file path (all symbols in a file) or by name (across all files). Returns symbol details including kind, signature, doc comment, and line numbers.',
    {
      file_path: z.string().optional().describe('Get all symbols in this file'),
      name: z.string().optional().describe('Find symbols with this name'),
      kind: z.string().optional().describe('Filter by kind (function, class, method, interface, type, variable, enum)'),
    },
    async (args) => {
      if (!symbolStore) throw new Error('Code services not initialised');

      let results: SymbolNode[];
      if (args.file_path) {
        results = await symbolStore.getByFile(args.file_path);
      } else if (args.name) {
        results = await symbolStore.findByName(args.name, args.kind as SymbolKind | undefined);
      } else {
        throw new Error('Provide either file_path or name');
      }

      const formatted = results.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        file: `${s.file_path}:${s.start_line}-${s.end_line}`,
        signature: s.signature,
        doc: s.doc_comment?.slice(0, 200) || undefined,
        language: s.language,
      }));
      return textContent(JSON.stringify(formatted, null, 2));
    },
  );

  // ─── amp_code_deps ──────────────────────────────────────────────────────
  server.tool(
    'amp_code_deps',
    'Symbol-level dependency queries. Find what calls a function, what a class inherits from, who imports a module, etc. Traverses SYMBOL_CALLS, SYMBOL_IMPORTS, SYMBOL_INHERITS, and SYMBOL_IMPLEMENTS edges.',
    {
      symbol_name: z.string().describe('Symbol name to query'),
      direction: z.enum(['callers', 'callees', 'importers', 'inheritance']).describe('Query direction'),
    },
    async (args) => {
      if (!symbolStore) throw new Error('Code services not initialised');

      let results: SymbolNode[];
      switch (args.direction) {
        case 'callers':
          results = await symbolStore.getCallers(args.symbol_name);
          break;
        case 'callees':
          results = await symbolStore.getCallees(args.symbol_name);
          break;
        case 'importers':
          results = await symbolStore.getImporters(args.symbol_name);
          break;
        case 'inheritance':
          results = await symbolStore.getInheritanceChain(args.symbol_name);
          break;
      }

      const formatted = results.map((s) => ({
        name: s.name,
        kind: s.kind,
        file: `${s.file_path}:${s.start_line}`,
        signature: s.signature,
      }));
      return textContent(JSON.stringify({
        symbol: args.symbol_name,
        direction: args.direction,
        count: formatted.length,
        results: formatted,
      }, null, 2));
    },
  );

  // ─── amp_code_context ───────────────────────────────────────────────────
  server.tool(
    'amp_code_context',
    'Build code-aware context for a task. Given a task description, returns relevant code symbols AND semantic memories, ranked and token-budgeted. Use this before making code changes to understand the relevant codebase context.',
    {
      task: z.string().describe('Task description (natural language)'),
      max_tokens: z.number().int().positive().optional().default(6000).describe('Max tokens for the context package'),
    },
    async (args) => {
      if (!codeSearch) throw new Error('Code services not initialised');
      const ctx = await codeSearch.buildContext(args.task, args.max_tokens);
      const md = codeSearch.renderContextMarkdown(ctx);
      return textContent(md);
    },
  );
}
