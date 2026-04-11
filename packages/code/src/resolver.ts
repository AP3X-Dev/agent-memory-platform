// packages/code/src/resolver.ts
// Cross-file import resolution: maps import paths to actual Symbol nodes.

import { type Driver } from 'neo4j-driver';
import { resolve, dirname } from 'path';
import { stat } from 'fs/promises';
import type { ImportInfo } from './types.js';

export class ImportResolver {
  constructor(private driver: Driver) {}

  /**
   * Resolve imports from a parsed file and create SYMBOL_IMPORTS edges.
   * Matches import sources to Symbol nodes already in the graph.
   */
  async resolveImports(
    imports: ImportInfo[],
    projectRoot: string,
  ): Promise<number> {
    let edgesCreated = 0;
    const session = this.driver.session();
    try {
      for (const imp of imports) {
        // Resolve the import source to a file path
        const resolvedPath = await resolveImportPath(imp.source, imp.file_path, projectRoot);
        if (!resolvedPath) continue;

        // Find symbols in the importing file that use this import
        // Create SYMBOL_IMPORTS edge from the importing file's module to the target file's module
        const result = await session.run(
          `MATCH (from:Symbol {file_path: $fromPath})
           WHERE from.kind IN ['function', 'class', 'module', 'variable']
           MATCH (to:Symbol {file_path: $toPath})
           WHERE to.kind IN ['function', 'class', 'module', 'variable']
             AND (to.name IN $specifiers OR $noSpecifiers)
           MERGE (from)-[:SYMBOL_IMPORTS]->(to)
           RETURN count(*) AS created`,
          {
            fromPath: imp.file_path,
            toPath: resolvedPath,
            specifiers: imp.specifiers.flatMap((s) => s.split(/[{},\s]+/).filter(Boolean)),
            noSpecifiers: imp.specifiers.length === 0,
          },
        );

        const count = result.records[0]?.get('created');
        if (count) {
          edgesCreated += typeof count === 'number' ? count : (count as { toNumber(): number }).toNumber();
        }
      }
      return edgesCreated;
    } finally {
      await session.close();
    }
  }

  /**
   * Link all symbols in a file to their containing Entity:Component node.
   */
  async linkSymbolsToEntity(filePath: string): Promise<number> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Symbol {file_path: $path})
         MATCH (e:Entity:Component {path: $path})
         MERGE (s)-[:DEFINED_IN]->(e)
         RETURN count(*) AS linked`,
        { path: filePath },
      );
      const count = result.records[0]?.get('linked');
      return typeof count === 'number' ? count : count ? (count as { toNumber(): number }).toNumber() : 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Bulk link: for all symbols, try to link to matching Entity:Component by file_path.
   */
  async linkAllSymbolsToEntities(): Promise<number> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Symbol)
         MATCH (e:Entity:Component {path: s.file_path})
         WHERE NOT (s)-[:DEFINED_IN]->(e)
         CREATE (s)-[:DEFINED_IN]->(e)
         RETURN count(*) AS linked`,
      );
      const count = result.records[0]?.get('linked');
      return typeof count === 'number' ? count : count ? (count as { toNumber(): number }).toNumber() : 0;
    } finally {
      await session.close();
    }
  }
}

// ─── Path resolution helpers ─────────────────────────────────────────────────

async function resolveImportPath(
  importSource: string,
  fromFile: string,
  projectRoot: string,
): Promise<string | null> {
  // Skip builtins / node_modules
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  const basePath = importSource.startsWith('/')
    ? resolve(projectRoot, importSource.slice(1))
    : resolve(fromDir, importSource);

  // Try exact path first, then with extensions
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.py`,
    `${basePath}.go`,
    `${basePath}.rs`,
    `${basePath}/index.ts`,
    `${basePath}/index.js`,
    `${basePath}/mod.rs`,
  ];

  for (const candidate of candidates) {
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch (err: unknown) {
      // Not found, try next
    }
  }

  return null;
}
