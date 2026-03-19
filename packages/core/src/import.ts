// packages/core/src/import.ts
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { type Driver } from 'neo4j-driver';
import type Redis from 'ioredis';
import { parseFromMarkdown, diffEntries } from './markdown.js';
import type { SemanticNode } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportStrategy = 'confidence-weighted' | 'overwrite';

export interface ImportOptions {
  strategy?: ImportStrategy;
  dryRun?: boolean;
}

export interface ImportResult {
  added: number;
  modified: number;
  deleted: number;
  unchanged: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function mapSemanticProps(props: Record<string, unknown>): SemanticNode {
  return {
    id: props.id as string,
    content: props.content as string,
    confidence: props.confidence as number,
    signal_count: props.signal_count as number,
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
    decay_class: props.decay_class as SemanticNode['decay_class'],
    tags: (props.tags as string[]) ?? [],
  };
}

// ─── importFromPath ───────────────────────────────────────────────────────────

/**
 * Walk {importPath}/semantic/, parse all .md files, diff against Neo4j,
 * and apply changes. Returns a summary of added/modified/deleted/unchanged counts.
 *
 * In dry-run mode, computes and prints the diff but does not write to Neo4j or Redis.
 */
export async function importFromPath(
  driver: Driver,
  redis: Redis,
  importPath: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { strategy = 'confidence-weighted', dryRun = false } = options;

  const semanticDir = path.join(importPath, 'semantic');

  // ── 1. Walk the semantic directory ─────────────────────────────────────────
  let filenames: string[];
  try {
    filenames = await fs.readdir(semanticDir);
  } catch {
    // Directory doesn't exist or is unreadable — treat as empty
    filenames = [];
  }

  const mdFilenames = filenames.filter((f) => f.endsWith('.md'));

  // ── 2. Parse each file → SemanticNode + content hash ──────────────────────
  const parsedNodes = new Map<string, SemanticNode>();
  const fileEntries: Array<{ id: string; contentHash: string }> = [];

  for (const filename of mdFilenames) {
    const filePath = path.join(semanticDir, filename);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const node = parseFromMarkdown(content);
      const contentHash = hashContent(content);
      parsedNodes.set(node.id, node);
      fileEntries.push({ id: node.id, contentHash });
    } catch {
      // Skip files that fail to parse
    }
  }

  // ── 3. Query Neo4j for existing semantic nodes ─────────────────────────────
  const graphEntries: Array<{ id: string; contentHash: string }> = [];
  const graphNodes = new Map<string, SemanticNode>();

  {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (s:Semantic) RETURN s');
      for (const record of result.records) {
        const props = record.get('s').properties as Record<string, unknown>;
        const node = mapSemanticProps(props);
        // Hash the rendered markdown of the graph node to compare with file
        const { renderToMarkdown } = await import('./markdown.js');
        const rendered = renderToMarkdown(node);
        const contentHash = hashContent(rendered);
        graphNodes.set(node.id, node);
        graphEntries.push({ id: node.id, contentHash });
      }
    } finally {
      await session.close();
    }
  }

  // ── 4. Diff file entries vs graph entries ──────────────────────────────────
  const diff = diffEntries(fileEntries, graphEntries);

  if (dryRun) {
    console.log('[dry-run] Import diff:');
    console.log(`  added:     ${diff.added.join(', ') || '(none)'}`);
    console.log(`  modified:  ${diff.modified.join(', ') || '(none)'}`);
    console.log(`  deleted:   ${diff.deleted.join(', ') || '(none)'}`);
    console.log(`  unchanged: ${diff.unchanged.length} node(s)`);
    return {
      added: diff.added.length,
      modified: diff.modified.length,
      deleted: diff.deleted.length,
      unchanged: diff.unchanged.length,
    };
  }

  const now = new Date().toISOString();

  // ── 5. Apply: added nodes ──────────────────────────────────────────────────
  for (const id of diff.added) {
    const node = parsedNodes.get(id);
    if (!node) continue;

    const confidence =
      strategy === 'confidence-weighted' ? Math.min(node.confidence, 0.8) : node.confidence;

    const session = driver.session();
    try {
      await session.run(
        `CREATE (s:Semantic {
          id: $id,
          content: $content,
          confidence: $confidence,
          signal_count: $signal_count,
          created_at: $created_at,
          updated_at: $updated_at,
          decay_class: $decay_class,
          tags: $tags
        })
        WITH s
        CREATE (s)<-[:HUMAN_EDIT { imported_at: $now, strategy: $strategy }]-(s)`,
        {
          id: node.id,
          content: node.content,
          confidence,
          signal_count: node.signal_count,
          created_at: node.created_at || now,
          updated_at: now,
          decay_class: node.decay_class,
          tags: node.tags,
          now,
          strategy,
        },
      );
    } catch {
      // Best-effort: log but continue
    } finally {
      await session.close();
    }

    // Invalidate Redis cache for this node
    try {
      const depsKey = `amp:deps:${id}`;
      const cacheKeys: string[] = await redis.smembers(depsKey);
      if (cacheKeys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of cacheKeys) pipeline.del(key);
        pipeline.del(depsKey);
        await pipeline.exec();
      }
    } catch {
      // Redis invalidation failure is non-fatal
    }
  }

  // ── 6. Apply: modified nodes ───────────────────────────────────────────────
  for (const id of diff.modified) {
    const node = parsedNodes.get(id);
    if (!node) continue;

    const confidence =
      strategy === 'confidence-weighted' ? Math.min(node.confidence, 0.8) : node.confidence;

    const session = driver.session();
    try {
      await session.run(
        `MATCH (s:Semantic {id: $id})
         SET s.content = $content,
             s.confidence = $confidence,
             s.signal_count = $signal_count,
             s.updated_at = $now,
             s.decay_class = $decay_class,
             s.tags = $tags
         WITH s
         CREATE (s)<-[:HUMAN_EDIT { imported_at: $now, strategy: $strategy }]-(s)`,
        {
          id: node.id,
          content: node.content,
          confidence,
          signal_count: node.signal_count,
          now,
          decay_class: node.decay_class,
          tags: node.tags,
          strategy,
        },
      );
    } catch {
      // Best-effort
    } finally {
      await session.close();
    }

    // Invalidate Redis cache
    try {
      const depsKey = `amp:deps:${id}`;
      const cacheKeys: string[] = await redis.smembers(depsKey);
      if (cacheKeys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of cacheKeys) pipeline.del(key);
        pipeline.del(depsKey);
        await pipeline.exec();
      }
    } catch {
      // Non-fatal
    }
  }

  // ── 7. Apply: deleted nodes — mark as archived (no hard delete) ────────────
  for (const id of diff.deleted) {
    const session = driver.session();
    try {
      await session.run(
        `MATCH (s:Semantic {id: $id})
         SET s.archived = true, s.archived_at = $now`,
        { id, now },
      );
    } catch {
      // Best-effort
    } finally {
      await session.close();
    }
  }

  return {
    added: diff.added.length,
    modified: diff.modified.length,
    deleted: diff.deleted.length,
    unchanged: diff.unchanged.length,
  };
}
