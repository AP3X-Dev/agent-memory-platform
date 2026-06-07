// packages/wiki/src/ingest.ts
// Ingests raw source documents into the AMP graph as Source nodes,
// Entity nodes, and Semantic nodes with CITES/ABOUT relationships.

import neo4j, { type Driver } from 'neo4j-driver';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { nanoid } from 'nanoid';
import type { ExtractionProvider } from '@memberry/core';
import type { IngestInput, IngestResult } from './types.js';
import { needsConversion, type DocumentConverter } from './document-converter.js';

// ─── Schema for Source nodes ─────────────────────────────────────────────────

const SOURCE_SCHEMA: string[] = [
  'CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:Source) REQUIRE s.id IS UNIQUE',
  'CREATE INDEX source_title IF NOT EXISTS FOR (s:Source) ON (s.title)',
  'CREATE INDEX source_type IF NOT EXISTS FOR (s:Source) ON (s.source_type)',
];

export async function initWikiSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const stmt of SOURCE_SCHEMA) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}

// ─── Ingestion service ──────────────────────────────────────────────────────

export class IngestionService {
  constructor(
    private driver: Driver,
    private extractor?: ExtractionProvider,
    private converter?: DocumentConverter,
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const {
      source_path,
      content: inlineContent,
      source_type,
      project_tag,
      title: inputTitle,
      entities: preEntities,
      claims: preClaims,
      tags: globalTags,
      base_confidence,
      decay_class,
      author,
      ensure_project,
    } = input;

    const projectName = project_tag.replace(/^project:/, '');
    const isHuman = author === 'human';
    const decayClass = decay_class ?? (isHuman ? 'stable' : 'volatile');
    const baseConfidence = base_confidence ?? (isHuman ? 0.7 : 0.3);
    // Provenance tags applied to the Source and every created Semantic.
    const provenanceTags = isHuman ? ['human-authored', 'source:brain-dump'] : [];

    // 1. Obtain source content (inline text wins over a file path).
    let content: string;
    if (typeof inlineContent === 'string') {
      content = inlineContent;
    } else if (source_path) {
      try {
        // Documents (PDF/Office/HTML/RTF) go through the converter when one is
        // injected; plain-text files are read directly as before.
        if (this.converter && needsConversion(source_path)) {
          content = (await this.converter.convert(source_path)).text;
        } else {
          content = await readFile(source_path, 'utf-8');
        }
      } catch (err: unknown) {
        console.error("[ingest] Suppressed error:", err);
        throw new Error(`Failed to read source file: ${source_path}`);
      }
    } else {
      throw new Error('ingest requires either `content` or `source_path`');
    }

    // 2. Determine title
    const title = inputTitle ?? extractTitle(content, source_path ?? 'brain-dump');

    // 3. Create Source node
    const sourceId = `src-${nanoid(12)}`;
    await this.createSourceNode(sourceId, title, source_type, source_path ?? 'inline', project_tag);

    // 4. Ensure project entity exists, link source
    if (ensure_project) {
      await this.ensureProjectEntity(projectName);
    }
    await this.linkSourceToProject(sourceId, projectName);

    // 4b. Auto-extract claims and entities if none provided
    let autoExtractedClaims: typeof preClaims = undefined;
    let autoExtractedEntities: string[] | undefined;

    if (this.extractor && (!preClaims || preClaims.length === 0)) {
      try {
        // Truncate content to avoid token limits
        const truncated = content.slice(0, 8000);
        const result = await this.extractor.extractAll(truncated);
        autoExtractedEntities = result.entities.map((e: { name: string }) => e.name);
        autoExtractedClaims = result.claims.map((c: { content: string; about: string[]; confidence: number; tags: string[] }) => ({
          content: c.content,
          about: c.about,
          confidence: c.confidence,
          tags: c.tags,
        }));
        console.error(`[amp-ingest] Auto-extracted ${result.entities.length} entities, ${result.claims.length} claims from ${source_path}`);
      } catch (err) {
        console.error('[amp-ingest] Auto-extraction failed (non-critical):', err instanceof Error ? err.message : err);
      }
    }

    // 5. Process pre-extracted entities
    let entitiesCreated = 0;
    let entitiesLinked = 0;
    const allEntities = new Set<string>([...(preEntities ?? []), ...(autoExtractedEntities ?? [])]);

    for (const entityName of allEntities) {
      const created = await this.ensureEntity(entityName, 'concept', projectName);
      if (created) entitiesCreated++;
      else entitiesLinked++;
    }

    // 6. Process claims → semantic nodes (pre-extracted or auto-extracted)
    let claimsStored = 0;
    let citationsCreated = 0;
    let claims = preClaims ?? autoExtractedClaims ?? [];

    // Fallback for human brain dumps with no extractor and no pre-structured claims:
    // store the verbatim text as a single durable claim so the dump is never lost and
    // stays queryable. Richer multi-claim extraction kicks in when an ExtractionProvider
    // is configured. Split into paragraphs so distinct thoughts become distinct claims.
    if (claims.length === 0 && isHuman && content.trim()) {
      const paragraphs = content
        .split(/\n\s*\n/)
        .map((p) => p.replace(/^#+\s*/, '').trim())
        .filter((p) => p.length > 0);
      const bodies = paragraphs.length > 0 ? paragraphs : [content.trim()];
      claims = bodies.map((body) => ({ content: body.slice(0, 1500), about: [title] }));
    }

    for (const claim of claims) {
      const semanticId = `sem-${nanoid(12)}`;
      const tags = [
        ...(claim.tags ?? []),
        ...(globalTags ?? []),
        ...provenanceTags,
        project_tag,
      ];

      await this.createSemanticNode(semanticId, claim.content, claim.confidence ?? baseConfidence, tags, decayClass);
      claimsStored++;

      // Link CITES → Source
      await this.createRelation(semanticId, 'Semantic', sourceId, 'Source', 'CITES');
      citationsCreated++;

      // Link ABOUT → Entities
      for (const entityName of claim.about) {
        // Ensure entity exists
        const created = await this.ensureEntity(entityName, 'concept', projectName);
        if (created && !allEntities.has(entityName)) {
          entitiesCreated++;
          allEntities.add(entityName);
        }

        const entityId = await this.getEntityId(entityName);
        if (entityId) {
          await this.createRelation(semanticId, 'Semantic', entityId, 'Entity', 'ABOUT');
        }
      }
    }

    // For brain dumps, link the dump's entities under the project so they become
    // navigable wiki articles (the compiler reaches entities via project CONTAINS).
    if (ensure_project) {
      for (const entityName of allEntities) {
        await this.linkEntityToProject(projectName, entityName);
      }
    }

    return {
      source_id: sourceId,
      entities_created: entitiesCreated,
      entities_linked: entitiesLinked,
      claims_stored: claimsStored,
      citations_created: citationsCreated,
    };
  }

  // ─── Graph operations ──────────────────────────────────────────────────────

  private async createSourceNode(
    id: string,
    title: string,
    sourceType: string,
    path: string,
    projectTag: string,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `CREATE (s:Source {
          id: $id,
          title: $title,
          source_type: $sourceType,
          path: $path,
          project_tag: $projectTag,
          created_at: $now
        })`,
        {
          id,
          title,
          sourceType,
          path,
          projectTag,
          now: new Date().toISOString(),
        },
      );
    } finally {
      await session.close();
    }
  }

  private async linkSourceToProject(sourceId: string, projectName: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (s:Source {id: $sourceId})
         MATCH (p:Entity {type: 'project'})
         WHERE p.name CONTAINS $projectName
         MERGE (p)-[:HAS_SOURCE]->(s)`,
        { sourceId, projectName },
      );
    } finally {
      await session.close();
    }
  }

  private async ensureEntity(name: string, type: string, projectName: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MERGE (e:Entity {name: $name})
         ON CREATE SET e.id = $id, e.type = $type, e.created_at = $now
         RETURN e.id AS id, e.created_at = $now AS created`,
        {
          name,
          id: `ent-${nanoid(12)}`,
          type,
          now: new Date().toISOString(),
        },
      );
      // Check if it was newly created by comparing timestamps
      const record = result.records[0];
      return record ? (record.get('created') as boolean) : false;
    } finally {
      await session.close();
    }
  }

  private async getEntityId(name: string): Promise<string | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Entity {name: $name}) RETURN e.id AS id LIMIT 1`,
        { name },
      );
      return result.records[0]?.get('id') as string ?? null;
    } finally {
      await session.close();
    }
  }

  private async createSemanticNode(
    id: string,
    content: string,
    confidence: number,
    tags: string[],
    decayClass: 'volatile' | 'stable' | 'permanent' = 'volatile',
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `CREATE (s:Semantic {
          id: $id,
          content: $content,
          confidence: $confidence,
          signal_count: 0,
          created_at: $now,
          updated_at: $now,
          decay_class: $decayClass,
          tags: $tags
        })`,
        {
          id,
          content,
          confidence,
          tags,
          decayClass,
          now: new Date().toISOString(),
        },
      );
    } finally {
      await session.close();
    }
  }

  /** Link an entity under the project via CONTAINS (skips self-linking the project). */
  private async linkEntityToProject(projectName: string, entityName: string): Promise<void> {
    if (entityName === projectName) return;
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (p:Entity {type: 'project'}) WHERE p.name CONTAINS $projectName
         MATCH (e:Entity {name: $entityName})
         MERGE (p)-[:CONTAINS]->(e)`,
        { projectName, entityName },
      );
    } finally {
      await session.close();
    }
  }

  /** Create the project Entity if missing (used by brain-dump ingestion). */
  private async ensureProjectEntity(projectName: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MERGE (e:Entity {name: $name})
         ON CREATE SET e.id = $id, e.type = 'project', e.created_at = $now`,
        { name: projectName, id: `ent-${nanoid(12)}`, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }

  private async createRelation(
    sourceId: string,
    sourceLabel: string,
    targetId: string,
    targetLabel: string,
    relType: string,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      // Dynamic relationship types require APOC or string interpolation.
      // Since we control relType, it's safe to interpolate.
      await session.run(
        `MATCH (a:${sourceLabel} {id: $sourceId})
         MATCH (b:${targetLabel} {id: $targetId})
         MERGE (a)-[:${relType}]->(b)`,
        { sourceId, targetId },
      );
    } finally {
      await session.close();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTitle(content: string, path: string): string {
  // Try to extract from markdown H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Try YAML frontmatter title
  const fmMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
  if (fmMatch) return fmMatch[1].trim();

  // Fall back to filename
  return basename(path, extname(path)).replace(/[-_]/g, ' ');
}
