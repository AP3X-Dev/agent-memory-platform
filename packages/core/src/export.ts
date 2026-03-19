// packages/core/src/export.ts
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { type Driver } from 'neo4j-driver';
import { renderToMarkdown } from './markdown.js';
import type { SemanticNode, EpisodicNode } from './types.js';

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ExportResult {
  exported: number;
  skipped: number;
  errors: string[];
}

export interface ExportFilter {
  entities?: string[];
  tags?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function mapEpisodicProps(props: Record<string, unknown>): EpisodicNode {
  return {
    id: props.id as string,
    session_id: props.session_id as string,
    agent_id: props.agent_id as string,
    task: props.task as string,
    content: props.content as string,
    outcome: props.outcome as EpisodicNode['outcome'] ?? undefined,
    created_at: props.created_at as string,
    ttl: props.ttl != null ? (props.ttl as number) : undefined,
  };
}

async function writeNodeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

// ─── exportAll ────────────────────────────────────────────────────────────────

/**
 * Export all Semantic and Episodic nodes from Neo4j to markdown files.
 * Semantic nodes → {exportPath}/semantic/{id}.md
 * Episodic nodes → {exportPath}/episodic/{YYYY-MM-DD}/{id}.md
 */
export async function exportAll(driver: Driver, exportPath: string): Promise<ExportResult> {
  let exported = 0;
  let skipped = 0;
  const errors: string[] = [];

  // ── Semantic nodes ──────────────────────────────────────────────────────────
  {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (s:Semantic) RETURN s');
      for (const record of result.records) {
        const props = record.get('s').properties as Record<string, unknown>;
        const node = mapSemanticProps(props);
        const filePath = path.join(exportPath, 'semantic', `${node.id}.md`);
        try {
          const md = renderToMarkdown(node);
          await writeNodeFile(filePath, md);
          exported++;
        } catch (err) {
          errors.push(`semantic/${node.id}: ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }
    } catch (err) {
      errors.push(`Failed to query Semantic nodes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await session.close();
    }
  }

  // ── Episodic nodes ──────────────────────────────────────────────────────────
  {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (e:Episodic) RETURN e');
      for (const record of result.records) {
        const props = record.get('e').properties as Record<string, unknown>;
        const node = mapEpisodicProps(props);
        // Group by date from created_at (YYYY-MM-DD)
        const date = node.created_at.slice(0, 10);
        const filePath = path.join(exportPath, 'episodic', date, `${node.id}.md`);
        try {
          const md = renderToMarkdown(node);
          await writeNodeFile(filePath, md);
          exported++;
        } catch (err) {
          errors.push(`episodic/${node.id}: ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }
    } catch (err) {
      errors.push(`Failed to query Episodic nodes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await session.close();
    }
  }

  return { exported, skipped, errors };
}

// ─── exportFiltered ───────────────────────────────────────────────────────────

/**
 * Export Semantic nodes filtered by entity names and/or tags.
 * Episodic export is always unfiltered in v1.
 */
export async function exportFiltered(
  driver: Driver,
  exportPath: string,
  filter: ExportFilter,
): Promise<ExportResult> {
  let exported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const { entities = [], tags = [] } = filter;

  // Build filtered Cypher query for Semantic nodes
  let cypher: string;
  const params: Record<string, unknown> = {};

  if (entities.length > 0 && tags.length > 0) {
    params.entities = entities;
    params.tags = tags;
    cypher = `
      MATCH (s:Semantic)-[:ABOUT]->(e:Entity)
      WHERE e.name IN $entities AND ANY(t IN $tags WHERE t IN s.tags)
      RETURN DISTINCT s`;
  } else if (entities.length > 0) {
    params.entities = entities;
    cypher = `
      MATCH (s:Semantic)-[:ABOUT]->(e:Entity)
      WHERE e.name IN $entities
      RETURN DISTINCT s`;
  } else if (tags.length > 0) {
    params.tags = tags;
    cypher = `
      MATCH (s:Semantic)
      WHERE ANY(t IN $tags WHERE t IN s.tags)
      RETURN DISTINCT s`;
  } else {
    // No filters — fall back to full export
    return exportAll(driver, exportPath);
  }

  // ── Filtered Semantic nodes ─────────────────────────────────────────────────
  {
    const session = driver.session();
    try {
      const result = await session.run(cypher, params);
      for (const record of result.records) {
        const props = record.get('s').properties as Record<string, unknown>;
        const node = mapSemanticProps(props);
        const filePath = path.join(exportPath, 'semantic', `${node.id}.md`);
        try {
          const md = renderToMarkdown(node);
          await writeNodeFile(filePath, md);
          exported++;
        } catch (err) {
          errors.push(`semantic/${node.id}: ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }
    } catch (err) {
      errors.push(`Failed to query filtered Semantic nodes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await session.close();
    }
  }

  // ── Episodic nodes (unfiltered in v1) ───────────────────────────────────────
  {
    const session = driver.session();
    try {
      const result = await session.run('MATCH (e:Episodic) RETURN e');
      for (const record of result.records) {
        const props = record.get('e').properties as Record<string, unknown>;
        const node = mapEpisodicProps(props);
        const date = node.created_at.slice(0, 10);
        const filePath = path.join(exportPath, 'episodic', date, `${node.id}.md`);
        try {
          const md = renderToMarkdown(node);
          await writeNodeFile(filePath, md);
          exported++;
        } catch (err) {
          errors.push(`episodic/${node.id}: ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }
    } catch (err) {
      errors.push(`Failed to query Episodic nodes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await session.close();
    }
  }

  return { exported, skipped, errors };
}
