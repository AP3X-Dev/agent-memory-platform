// packages/arch/src/drift.ts
// SHA-256 file hash tracking for drift detection.

import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { type Driver } from 'neo4j-driver';
import type { DriftResult } from './types.js';

/**
 * Validate that a file path is safely within the allowed base directory.
 * Prevents path traversal attacks from untrusted Neo4j data.
 * Throws if the resolved path escapes the base directory.
 */
function validateFilePath(filePath: string, baseDir: string): string {
  const resolved = path.resolve(baseDir, filePath);
  // Ensure the resolved path is within baseDir (with trailing separator to avoid prefix tricks like /app-evil matching /app)
  const normalizedBase = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (resolved !== baseDir && !resolved.startsWith(normalizedBase)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  return resolved;
}

export class DriftDetector {
  private baseDir: string;

  constructor(private driver: Driver, baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? process.cwd());
  }

  /**
   * Check if an entity's tracked files have changed since last indexing.
   * Computes SHA-256 of each file and compares against stored hashes.
   */
  async checkFreshness(entityName: string, projectName?: string): Promise<DriftResult> {
    const session = this.driver.session();
    try {
      const params = { name: entityName, projectName: normalizeProjectName(projectName) };
      const result = await session.run(
        `MATCH (e:Entity {name: $name})
         WHERE ${entityProjectFilter('e')}
         RETURN e.file_paths AS paths, e.file_hashes_json AS hashes, e.last_indexed_at AS lastIndexed`,
        params,
      );

      if (result.records.length === 0) {
        return {
          entity_name: entityName,
          stale: false,
          changed_files: [],
          unchanged_files: [],
          missing_files: [],
          last_indexed_at: null,
        };
      }

      const record = result.records[0];
      const filePaths = (record.get('paths') as string[]) ?? [];
      const hashesJson = (record.get('hashes') as string) ?? '{}';
      const lastIndexed = record.get('lastIndexed') as string | null;
      const storedHashes: Record<string, string> = JSON.parse(hashesJson);

      const changed: string[] = [];
      const unchanged: string[] = [];
      const missing: string[] = [];

      for (const filePath of filePaths) {
        try {
          const safePath = validateFilePath(filePath, this.baseDir);
          await stat(safePath);
          const currentHash = await hashFile(safePath);
          const storedHash = storedHashes[filePath];

          if (!storedHash || currentHash !== storedHash) {
            changed.push(filePath);
          } else {
            unchanged.push(filePath);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Path traversal detected')) {
            throw err;
          }
          missing.push(filePath);
        }
      }

      const stale = changed.length > 0 || missing.length > 0;

      // Update stale flag in graph
      if (stale) {
        await session.run(
          `MATCH (e:Entity {name: $name})
           WHERE ${entityProjectFilter('e')}
           SET e.stale = true`,
          params,
        );
      }

      return {
        entity_name: entityName,
        stale,
        changed_files: changed,
        unchanged_files: unchanged,
        missing_files: missing,
        last_indexed_at: lastIndexed,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Mark an entity as fresh — update stored hashes to current file state.
   */
  async markFresh(entityName: string, projectName?: string): Promise<number> {
    const session = this.driver.session();
    try {
      const params = { name: entityName, projectName: normalizeProjectName(projectName) };
      const result = await session.run(
        `MATCH (e:Entity {name: $name})
         WHERE ${entityProjectFilter('e')}
         RETURN e.file_paths AS paths`,
        params,
      );

      if (result.records.length === 0) return 0;

      const filePaths = (result.records[0].get('paths') as string[]) ?? [];
      const hashes: Record<string, string> = {};
      let count = 0;

      for (const filePath of filePaths) {
        try {
          const safePath = validateFilePath(filePath, this.baseDir);
          hashes[filePath] = await hashFile(safePath);
          count++;
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Path traversal detected')) {
            throw err;
          }
          // File missing — skip
        }
      }

      await session.run(
        `MATCH (e:Entity {name: $name})
         WHERE ${entityProjectFilter('e')}
         SET e.file_hashes_json = $hashes, e.stale = false, e.last_indexed_at = $now`,
        { ...params, hashes: JSON.stringify(hashes), now: new Date().toISOString() },
      );

      return count;
    } finally {
      await session.close();
    }
  }

  /**
   * Batch check all entities in a project.
   * Single query to fetch all entities with file tracking, then batch file hashing.
   */
  async checkAll(projectName: string): Promise<DriftResult[]> {
    const session = this.driver.session();
    try {
      const normalizedProjectName = normalizeProjectName(projectName) ?? projectName;
      // Single query: get all entities with file tracking in one shot
      const result = await session.run(
        `MATCH (proj:Entity {name: $name, type: 'project'})-[:CONTAINS*0..]->(e:Entity)
         WHERE e.file_paths IS NOT NULL AND size(e.file_paths) > 0
         RETURN e.id AS id, e.name AS name, e.file_paths AS paths,
                e.file_hashes_json AS hashes, e.last_indexed_at AS lastIndexed`,
        { name: normalizedProjectName },
      );

      const results: DriftResult[] = [];
      const staleIds: string[] = [];

      for (const record of result.records) {
        const entityId = record.get('id') as string;
        const entityName = record.get('name') as string;
        const filePaths = (record.get('paths') as string[]) ?? [];
        const hashesJson = (record.get('hashes') as string) ?? '{}';
        const lastIndexed = record.get('lastIndexed') as string | null;
        const storedHashes: Record<string, string> = JSON.parse(hashesJson);

        const changed: string[] = [];
        const unchanged: string[] = [];
        const missing: string[] = [];

        for (const filePath of filePaths) {
          try {
            const safePath = validateFilePath(filePath, this.baseDir);
            await stat(safePath);
            const currentHash = await hashFile(safePath);
            if (!storedHashes[filePath] || currentHash !== storedHashes[filePath]) {
              changed.push(filePath);
            } else {
              unchanged.push(filePath);
            }
          } catch (err) {
            if (err instanceof Error && err.message.startsWith('Path traversal detected')) {
              throw err;
            }
            missing.push(filePath);
          }
        }

        const isStale = changed.length > 0 || missing.length > 0;
        if (isStale && entityId) staleIds.push(entityId);

        results.push({
          entity_name: entityName,
          stale: isStale,
          changed_files: changed,
          unchanged_files: unchanged,
          missing_files: missing,
          last_indexed_at: lastIndexed,
        });
      }

      // Batch update stale flags by ID — names are NOT unique across projects, so
      // matching by name would mark same-named entities in OTHER projects stale.
      if (staleIds.length > 0) {
        await session.run(
          'MATCH (e:Entity) WHERE e.id IN $ids SET e.stale = true',
          { ids: staleIds },
        );
      }

      return results;
    } finally {
      await session.close();
    }
  }
}

function entityProjectFilter(alias: string): string {
  return `($projectName IS NULL
            OR toLower(COALESCE(${alias}.name, '')) = toLower($projectName)
            OR EXISTS {
              MATCH (project:Entity)-[:CONTAINS*0..]->(${alias})
              WHERE toLower(COALESCE(project.name, '')) = toLower($projectName)
            })`;
}

function normalizeProjectName(projectName?: string): string | null {
  const trimmed = projectName?.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^project:/i, '').trim();
  return withoutPrefix || null;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}
