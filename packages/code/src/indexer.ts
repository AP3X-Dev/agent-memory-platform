// packages/code/src/indexer.ts
// Project and file indexing pipeline.

import { readFile, readdir, stat } from 'fs/promises';
import { resolve, extname, relative } from 'path';
import { type Driver } from 'neo4j-driver';
import { parseFile } from './parser.js';
import { ImportResolver } from './resolver.js';
import { SymbolStore } from './symbol-store.js';
import { generateLexicalVector, generateMiniVector, generateSparseVector } from './vectors.js';
import type { SupportedLanguage, SymbolKind, IndexResult } from './types.js';
import { LANGUAGE_EXTENSIONS } from './types.js';

/**
 * Build a composite key string for symbol identity.
 * Encodes name + kind + parent_symbol to uniquely identify symbols even when
 * names are shared across classes or overloaded within the same file.
 */
function compositeKey(name: string, kind: SymbolKind | string, parentSymbol: string | null): string {
  return `${name}\0${kind}\0${parentSymbol ?? ''}`;
}

// Default directories/patterns to skip
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'venv', 'env', '.env', 'target', 'vendor', '.amp', '.lab',
  '.yggdrasil', '.codebase', 'coverage', '.nyc_output',
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
]);

export class CodeIndexer {
  private symbolStore: SymbolStore;
  private resolver: ImportResolver;

  constructor(private driver: Driver) {
    this.symbolStore = new SymbolStore(driver);
    this.resolver = new ImportResolver(driver);
  }

  /**
   * Index an entire project directory.
   * Walks the file tree, parses recognized source files, creates Symbol nodes and edges.
   */
  async indexProject(
    rootPath: string,
    options?: { include?: string[]; exclude?: string[] },
  ): Promise<IndexResult> {
    const result: IndexResult = {
      files_parsed: 0,
      files_skipped: 0,
      symbols_created: 0,
      symbols_updated: 0,
      relations_created: 0,
      errors: [],
    };

    const extraExcludes = new Set(options?.exclude ?? []);
    const files = await this.walkDirectory(rootPath, extraExcludes);

    // Filter to include patterns if specified
    const filtered = options?.include
      ? files.filter((f) => options.include!.some((pattern) => f.includes(pattern)))
      : files;

    // Phase 1: Parse all files and create symbols. Cache parse results for Phase 2.
    const parseCache = new Map<string, Awaited<ReturnType<typeof parseFile>>>();

    for (const filePath of filtered) {
      const ext = extname(filePath);
      const language = LANGUAGE_EXTENSIONS[ext];
      if (!language) {
        result.files_skipped++;
        continue;
      }

      try {
        const fileResult = await this.indexFile(filePath, language);
        result.files_parsed++;
        result.symbols_created += fileResult.symbols_created;
        result.symbols_updated += fileResult.symbols_updated;
        result.relations_created += fileResult.relations_created;

        // Cache the parse from indexFile for Phase 2 (no re-parsing needed)
        if (fileResult.parsed.imports.length > 0) {
          parseCache.set(filePath, fileResult.parsed);
        }
      } catch (err) {
        result.errors.push({
          file: relative(rootPath, filePath),
          error: err instanceof Error ? err.message : String(err),
        });
        result.files_skipped++;
      }
    }

    // Phase 2: Create Entity:Component nodes for indexed files and resolve imports.
    // Uses cached parse results --- no re-parsing.
    await this.ensureFileEntities(filtered);

    for (const [filePath, parsed] of parseCache) {
      try {
        const importEdges = await this.resolver.resolveImports(parsed.imports, rootPath);
        result.relations_created += importEdges;
      } catch (err: unknown) {
        // Import resolution failures are non-fatal
      }
    }

    // Phase 3: Batch link all symbols to their Entity:Component nodes
    const linkedCount = await this.resolver.linkAllSymbolsToEntities();
    result.relations_created += linkedCount;

    return result;
  }

  /**
   * Index a single file. Incremental: checks content_hash to skip unchanged symbols.
   */
  async indexFile(
    filePath: string,
    language: SupportedLanguage,
  ): Promise<{ symbols_created: number; symbols_updated: number; relations_created: number; parsed: Awaited<ReturnType<typeof parseFile>> }> {
    const parsed = await parseFile(filePath, language);
    let created = 0;
    let updated = 0;
    let relationsCreated = 0;

    // Check which symbols already exist with same content_hash (unchanged)
    const existingHashes = await this.symbolStore.getHashesByFile(filePath);

    for (const symbol of parsed.symbols) {
      if (existingHashes.has(symbol.content_hash)) {
        // Symbol unchanged --- skip
        continue;
      }

      // Generate multi-vectors from symbol text
      const vectorText = [symbol.name, symbol.signature, symbol.doc_comment].filter(Boolean).join(' ');
      symbol.lexical_vector = generateLexicalVector(vectorText);
      const sparse = generateSparseVector(vectorText);
      symbol.sparse_indices = sparse.indices;
      symbol.sparse_values = sparse.values;
      // Mini vector requires dense embedding --- generated if embedding exists
      if (symbol.embedding) {
        symbol.mini_vector = generateMiniVector(symbol.embedding);
      }

      // Check if symbol exists by composite key (name+file+kind+parent) or is new
      const existing = await this.symbolStore.findByCompositeKey(
        symbol.name, filePath, symbol.kind, symbol.parent_symbol,
      );
      if (existing) {
        await this.symbolStore.update(existing.id, symbol);
        updated++;
      } else {
        await this.symbolStore.create(symbol);
        created++;
      }
    }

    // Create intra-file relationships (SYMBOL_CONTAINS, SYMBOL_INHERITS, SYMBOL_IMPLEMENTS)
    // Batch: group by type and resolve in fewer queries
    const relsByType = new Map<string, Array<{ from: string; to: string }>>();
    for (const rel of parsed.relations) {
      const group = relsByType.get(rel.type) ?? [];
      group.push({ from: rel.from_symbol, to: rel.to_symbol });
      relsByType.set(rel.type, group);
    }
    for (const [type, rels] of relsByType) {
      for (const rel of rels) {
        const resolved = await this.resolveRelation(rel.from, rel.to, type, filePath);
        if (resolved) relationsCreated++;
      }
    }

    // Remove symbols that no longer exist in the file (batch delete).
    // Use composite keys (name+kind+parent_symbol) to correctly identify stale symbols
    // even when multiple symbols share the same name (overloads, same-named methods in
    // different classes, nested symbols).
    const currentKeys = new Set(
      parsed.symbols.map((s) => compositeKey(s.name, s.kind, s.parent_symbol)),
    );
    const allExisting = await this.symbolStore.getByFile(filePath);
    const toDelete = allExisting.filter(
      (ex) => !currentKeys.has(compositeKey(ex.name, ex.kind, ex.parent_symbol)),
    );
    if (toDelete.length > 0) {
      const session = this.driver.session();
      try {
        await session.run(
          'MATCH (s:Symbol) WHERE s.id IN $ids DETACH DELETE s',
          { ids: toDelete.map((s) => s.id) },
        );
      } finally {
        await session.close();
      }
    }

    return { symbols_created: created, symbols_updated: updated, relations_created: relationsCreated, parsed };
  }

  // --- Private helpers -------------------------------------------------------

  /**
   * Ensure Entity:Component nodes exist for all indexed files.
   * Creates them if missing so symbols can be linked via DEFINED_IN.
   */
  private async ensureFileEntities(filePaths: string[]): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `UNWIND $paths AS path
         MERGE (e:Entity:Component {path: path})
         ON CREATE SET e.id = randomUUID(), e.name = last(split(path, '/')),
                       e.type = 'component', e.domain = 'source',
                       e.created_at = $now`,
        { paths: filePaths.filter((f) => LANGUAGE_EXTENSIONS[extname(f)]), now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }

  private async resolveRelation(
    fromRef: string,
    toRef: string,
    type: string,
    filePath: string,
  ): Promise<boolean> {
    // Validate relation type against known symbol relationships --- prevents Cypher injection
    const VALID_SYMBOL_RELS = new Set(['SYMBOL_CALLS', 'SYMBOL_IMPORTS', 'SYMBOL_INHERITS', 'SYMBOL_IMPLEMENTS', 'SYMBOL_CONTAINS']);
    if (!VALID_SYMBOL_RELS.has(type)) return false;

    const session = this.driver.session();
    try {
      // fromRef/toRef are either symbol IDs (from SYMBOL_CONTAINS) or names (from heritage)
      // Try ID match first, then name match within the same file, then global name match
      const result = await session.run(
        `OPTIONAL MATCH (from:Symbol) WHERE from.id = $fromRef OR (from.name = $fromRef AND from.file_path = $filePath)
         WITH from WHERE from IS NOT NULL LIMIT 1
         OPTIONAL MATCH (to:Symbol) WHERE to.id = $toRef OR (to.name = $toRef AND to.file_path = $filePath) OR to.name = $toRef
         WITH from, to WHERE to IS NOT NULL LIMIT 1
         MERGE (from)-[:${type}]->(to)
         RETURN count(*) AS created`,
        { fromRef, toRef, filePath },
      );
      return (result.records[0]?.get('created') ?? 0) > 0;
    } finally {
      await session.close();
    }
  }

  private async walkDirectory(
    dirPath: string,
    extraExcludes: Set<string>,
  ): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name;
        if (EXCLUDE_DIRS.has(name) || extraExcludes.has(name) || name.startsWith('.')) continue;

        const fullPath = resolve(dir, name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          if (EXCLUDE_FILES.has(name)) continue;
          const ext = extname(name);
          if (LANGUAGE_EXTENSIONS[ext]) {
            files.push(fullPath);
          }
        }
      }
    }

    await walk(dirPath);
    return files;
  }
}
