// packages/code/src/symbol-store.ts
// CRUD for Symbol nodes + relationship edges in Neo4j.

import neo4j, { type Driver } from 'neo4j-driver';
import type { SymbolNode, SymbolKind, SupportedLanguage } from './types.js';

export interface SymbolDependencyOptions {
  file_path?: string;
  kind?: SymbolKind;
  limit?: number;
}

export interface SymbolLookupOptions {
  name?: string;
  file_path?: string;
  kind?: SymbolKind;
  limit?: number;
}

export class SymbolStore {
  constructor(private driver: Driver) {}

  async create(node: SymbolNode): Promise<string> {
    const session = this.driver.session();
    try {
      await session.run(
        `CREATE (s:Symbol {
          id: $id, name: $name, kind: $kind, language: $language,
          file_path: $file_path, start_line: $start_line, end_line: $end_line,
          signature: $signature, doc_comment: $doc_comment,
          content_hash: $content_hash, parent_symbol: $parent_symbol,
          created_at: $created_at, updated_at: $updated_at
        })`,
        {
          id: node.id,
          name: node.name,
          kind: node.kind,
          language: node.language,
          file_path: node.file_path,
          start_line: neo4j.int(node.start_line),
          end_line: neo4j.int(node.end_line),
          signature: node.signature,
          doc_comment: node.doc_comment,
          content_hash: node.content_hash,
          parent_symbol: node.parent_symbol,
          created_at: node.created_at,
          updated_at: node.updated_at,
        },
      );

      // Store vectors (each as separate SET to avoid oversized CREATE)
      const vectorProps: Record<string, unknown> = {};
      if (node.embedding) vectorProps.embedding = node.embedding;
      if (node.lexical_vector) vectorProps.lexical_vector = node.lexical_vector;
      if (node.mini_vector) vectorProps.mini_vector = node.mini_vector;
      if (node.sparse_indices) vectorProps.sparse_indices = node.sparse_indices;
      if (node.sparse_values) vectorProps.sparse_values = node.sparse_values;

      if (Object.keys(vectorProps).length > 0) {
        await session.run(
          'MATCH (s:Symbol {id: $id}) SET s += $props',
          { id: node.id, props: vectorProps },
        );
      }

      return node.id;
    } finally {
      await session.close();
    }
  }

  async update(existingId: string, node: Partial<SymbolNode>): Promise<void> {
    const session = this.driver.session();
    try {
      const setClauses: string[] = ['s.updated_at = $now'];
      const params: Record<string, unknown> = { id: existingId, now: new Date().toISOString() };

      const fields: Array<keyof SymbolNode> = [
        'name', 'kind', 'language', 'file_path', 'signature',
        'doc_comment', 'content_hash', 'parent_symbol',
      ];
      for (const key of fields) {
        if (node[key] !== undefined) {
          setClauses.push(`s.${key} = $${key}`);
          params[key] = node[key];
        }
      }
      if (node.start_line !== undefined) {
        setClauses.push('s.start_line = $start_line');
        params.start_line = neo4j.int(node.start_line);
      }
      if (node.end_line !== undefined) {
        setClauses.push('s.end_line = $end_line');
        params.end_line = neo4j.int(node.end_line);
      }

      await session.run(
        `MATCH (s:Symbol {id: $id}) SET ${setClauses.join(', ')}`,
        params,
      );
    } finally {
      await session.close();
    }
  }

  async delete(id: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run('MATCH (s:Symbol {id: $id}) DETACH DELETE s', { id });
    } finally {
      await session.close();
    }
  }

  async getById(id: string): Promise<SymbolNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run('MATCH (s:Symbol {id: $id}) RETURN s', { id });
      if (result.records.length === 0) return null;
      return mapSymbol(result.records[0].get('s').properties);
    } finally {
      await session.close();
    }
  }

  async getByFile(filePath: string): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (s:Symbol {file_path: $path}) RETURN s ORDER BY s.start_line ASC',
        { path: filePath },
      );
      return result.records.map((r) => mapSymbol(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  async findByName(name: string, kind?: SymbolKind): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const kindFilter = kind ? 'AND s.kind = $kind' : '';
      const result = await session.run(
        `MATCH (s:Symbol {name: $name}) WHERE true ${kindFilter}
         RETURN s ORDER BY s.file_path ASC`,
        { name, kind: kind ?? null },
      );
      return result.records.map((r) => mapSymbol(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  async findByNameAndFile(name: string, filePath: string): Promise<SymbolNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (s:Symbol {name: $name, file_path: $path}) RETURN s LIMIT 1',
        { name, path: filePath },
      );
      if (result.records.length === 0) return null;
      return mapSymbol(result.records[0].get('s').properties);
    } finally {
      await session.close();
    }
  }

  /**
   * Find a symbol by composite key: name + file + kind + parent_symbol.
   * This uniquely identifies symbols even with overloaded names, duplicate method
   * names across classes, or same-named nested symbols.
   */
  async findByCompositeKey(
    name: string,
    filePath: string,
    kind: SymbolKind,
    parentSymbol: string | null,
  ): Promise<SymbolNode | null> {
    const session = this.driver.session();
    try {
      const parentClause = parentSymbol === null
        ? 'AND s.parent_symbol IS NULL'
        : 'AND s.parent_symbol = $parent';
      const result = await session.run(
        `MATCH (s:Symbol {name: $name, file_path: $path, kind: $kind})
         WHERE true ${parentClause}
         RETURN s LIMIT 1`,
        { name, path: filePath, kind, parent: parentSymbol },
      );
      if (result.records.length === 0) return null;
      return mapSymbol(result.records[0].get('s').properties);
    } finally {
      await session.close();
    }
  }

  async getHashesByFile(filePath: string): Promise<Set<string>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (s:Symbol {file_path: $path}) RETURN s.content_hash AS hash',
        { path: filePath },
      );
      return new Set(result.records.map((r) => r.get('hash') as string));
    } finally {
      await session.close();
    }
  }

  async getCallers(symbolName: string, options: SymbolDependencyOptions = {}): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const filters = buildDependencyFilters('caller', options);
      const result = await session.run(
        `MATCH (caller:Symbol)-[:SYMBOL_CALLS]->(target:Symbol {name: $name})
         ${filters.whereClause}
         RETURN caller ORDER BY caller.file_path ASC
         LIMIT $limit`,
        {
          name: symbolName,
          ...filters.params,
          limit: neo4j.int(normalizeDependencyLimit(options.limit)),
        },
      );
      return result.records.map((r) => mapSymbol(r.get('caller').properties));
    } finally {
      await session.close();
    }
  }

  async findSymbols(options: SymbolLookupOptions): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const filters: string[] = [];
      const params: Record<string, unknown> = {
        limit: neo4j.int(normalizeLookupLimit(options.limit)),
      };

      if (options.name?.trim()) {
        filters.push('s.name = $name');
        params.name = options.name.trim();
      }
      if (options.file_path?.trim()) {
        filters.push('toLower(s.file_path) CONTAINS toLower($file_path)');
        params.file_path = options.file_path.trim();
      }
      if (options.kind) {
        filters.push('s.kind = $kind');
        params.kind = options.kind;
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const result = await session.run(
        `MATCH (s:Symbol)
         ${whereClause}
         RETURN s ORDER BY s.file_path ASC, s.start_line ASC
         LIMIT $limit`,
        params,
      );
      return result.records.map((r) => mapSymbol(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  async getCallees(symbolName: string, options: SymbolDependencyOptions = {}): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const filters = buildDependencyFilters('callee', options);
      const result = await session.run(
        `MATCH (source:Symbol {name: $name})-[:SYMBOL_CALLS]->(callee:Symbol)
         ${filters.whereClause}
         RETURN callee ORDER BY callee.file_path ASC
         LIMIT $limit`,
        {
          name: symbolName,
          ...filters.params,
          limit: neo4j.int(normalizeDependencyLimit(options.limit)),
        },
      );
      return result.records.map((r) => mapSymbol(r.get('callee').properties));
    } finally {
      await session.close();
    }
  }

  async getImporters(symbolName: string, options: SymbolDependencyOptions = {}): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const filters = buildDependencyFilters('importer', options);
      const result = await session.run(
        `MATCH (importer:Symbol)-[:SYMBOL_IMPORTS]->(target:Symbol {name: $name})
         ${filters.whereClause}
         RETURN importer ORDER BY importer.file_path ASC
         LIMIT $limit`,
        {
          name: symbolName,
          ...filters.params,
          limit: neo4j.int(normalizeDependencyLimit(options.limit)),
        },
      );
      return result.records.map((r) => mapSymbol(r.get('importer').properties));
    } finally {
      await session.close();
    }
  }

  async getInheritanceChain(symbolName: string, options: SymbolDependencyOptions = {}): Promise<SymbolNode[]> {
    const session = this.driver.session();
    try {
      const filters = buildDependencyFilters('symbol', options);
      const result = await session.run(
        `MATCH path = (child:Symbol {name: $name})-[:SYMBOL_INHERITS*]->(ancestor:Symbol)
         UNWIND nodes(path) AS n
         WITH DISTINCT n AS symbol, length(path) AS depth
         ${filters.whereClause}
         RETURN symbol ORDER BY depth ASC, symbol.file_path ASC
         LIMIT $limit`,
        {
          name: symbolName,
          ...filters.params,
          limit: neo4j.int(normalizeDependencyLimit(options.limit)),
        },
      );
      return result.records.map((r) => mapSymbol(r.get('symbol').properties));
    } finally {
      await session.close();
    }
  }

  async deleteByFile(filePath: string): Promise<number> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (s:Symbol {file_path: $path}) DETACH DELETE s RETURN count(s) AS deleted',
        { path: filePath },
      );
      const count = result.records[0]?.get('deleted');
      return typeof count === 'number' ? count : count ? (count as { toNumber(): number }).toNumber() : 0;
    } finally {
      await session.close();
    }
  }
}

// --- Helpers ------------------------------------------------------------------

function mapSymbol(props: Record<string, unknown>): SymbolNode {
  return {
    id: props.id as string,
    name: props.name as string,
    kind: props.kind as SymbolKind,
    language: props.language as SupportedLanguage,
    file_path: props.file_path as string,
    start_line: toNum(props.start_line),
    end_line: toNum(props.end_line),
    signature: (props.signature as string) ?? '',
    doc_comment: (props.doc_comment as string) ?? '',
    content_hash: (props.content_hash as string) ?? '',
    parent_symbol: (props.parent_symbol as string) ?? null,
    embedding: props.embedding as number[] | undefined,
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
  };
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function buildDependencyFilters(
  alias: string,
  options: SymbolDependencyOptions,
): { whereClause: string; params: Record<string, unknown> } {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.file_path?.trim()) {
    filters.push(`toLower(${alias}.file_path) CONTAINS toLower($file_path)`);
    params.file_path = options.file_path.trim();
  }
  if (options.kind) {
    filters.push(`${alias}.kind = $kind`);
    params.kind = options.kind;
  }

  return {
    whereClause: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '',
    params,
  };
}

function normalizeDependencyLimit(limit: number | undefined): number {
  if (limit == null) return 50;
  const floored = Math.floor(limit);
  if (!Number.isFinite(floored) || floored <= 0) return 50;
  return Math.min(floored, 100);
}

function normalizeLookupLimit(limit: number | undefined): number {
  if (limit == null) return 50;
  const floored = Math.floor(limit);
  if (!Number.isFinite(floored) || floored <= 0) return 50;
  return Math.min(floored, 100);
}
