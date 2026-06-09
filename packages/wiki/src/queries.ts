// packages/wiki/src/queries.ts
// All Neo4j graph queries for the wiki compiler.

import type { Driver } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import type { EntityInfo, EpisodicEntry, SourceInfo, ResolvedClaim } from './types.js';
import { slugify } from './compile.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'toNumber' in val) return (val as { toNumber(): number }).toNumber();
  return Number(val);
}

/** Extract project scope from a task string like "[project:agent-assist] Fix bug" */
export function extractProjectScope(task: string): string | null {
  const match = task.match(/^\[project:([^\]]+)\]/);
  return match ? match[1] : null;
}

// ─── Project discovery ──────────────────────────────────────────────────────

export async function fetchAllProjects(driver: Driver): Promise<EntityInfo[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (e:Entity {type: 'project'})
       RETURN e.id AS id, e.name AS name, e.type AS type, e.description AS description,
              e.aliases AS aliases, e.created_at AS created_at
       ORDER BY e.name`,
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      name: r.get('name') as string,
      type: r.get('type') as string,
      slug: slugify(r.get('name') as string),
      description: r.get('description') as string | undefined,
      aliases: r.get('aliases') as string[] | undefined,
      created_at: r.get('created_at') as string,
    }));
  } finally {
    await session.close();
  }
}

/** Discover projects that exist only in episodic task prefixes but have no Entity node */
export async function fetchEpisodicProjectScopes(driver: Driver): Promise<string[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (ep:Episodic)
       WHERE ep.task STARTS WITH '[project:'
       WITH DISTINCT split(split(ep.task, ']')[0], ':')[1] AS proj
       OPTIONAL MATCH (e:Entity {type: 'project'})
       WHERE toLower(e.name) = toLower(proj)
       WITH proj WHERE e IS NULL
       RETURN proj ORDER BY proj`,
    );
    return result.records.map((r) => r.get('proj') as string);
  } finally {
    await session.close();
  }
}

// ─── Entity queries ─────────────────────────────────────────────────────────

export async function fetchProjectEntities(driver: Driver, projectName: string): Promise<EntityInfo[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (project:Entity {type: 'project'})-[:CONTAINS*1..]->(e:Entity)
       WHERE project.name = $projectName
       RETURN e.id AS id, e.name AS name, e.type AS type, e.description AS description,
              e.aliases AS aliases, e.created_at AS created_at
       ORDER BY e.name`,
      { projectName },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      name: r.get('name') as string,
      type: r.get('type') as string,
      slug: slugify(r.get('name') as string),
      description: r.get('description') as string | undefined,
      aliases: r.get('aliases') as string[] | undefined,
      created_at: r.get('created_at') as string,
    }));
  } finally {
    await session.close();
  }
}

/** Entities linked via MODIFIED from episodics scoped to a project */
export async function fetchEntitiesModifiedByProject(driver: Driver, projectScope: string): Promise<EntityInfo[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (ep:Episodic)-[:MODIFIED]->(e:Entity)
       WHERE ep.task CONTAINS $tag
       RETURN DISTINCT e.id AS id, e.name AS name, e.type AS type, e.description AS description,
              e.aliases AS aliases, e.created_at AS created_at
       ORDER BY e.name`,
      { tag: `[project:${projectScope}]` },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      name: r.get('name') as string,
      type: r.get('type') as string,
      slug: slugify(r.get('name') as string),
      description: r.get('description') as string | undefined,
      aliases: r.get('aliases') as string[] | undefined,
      created_at: r.get('created_at') as string,
    }));
  } finally {
    await session.close();
  }
}

// ─── Semantic queries ───────────────────────────────────────────────────────

export async function fetchSemanticsForEntity(driver: Driver, entityName: string): Promise<Array<{
  id: string; content: string; confidence: number; tags: string[]; updated_at: string; entity_refs: string[];
}>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $name})
       OPTIONAL MATCH (s)-[:ABOUT]->(other:Entity)
       WHERE other.name <> $name
       RETURN s.id AS id, s.content AS content, s.confidence AS confidence,
              s.tags AS tags, s.updated_at AS updated_at,
              collect(DISTINCT other.name) AS entity_refs
       ORDER BY s.confidence DESC, s.updated_at DESC`,
      { name: entityName },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      content: r.get('content') as string,
      confidence: r.get('confidence') as number,
      tags: (r.get('tags') as string[]) ?? [],
      updated_at: r.get('updated_at') as string,
      entity_refs: (r.get('entity_refs') as string[]) ?? [],
    }));
  } finally {
    await session.close();
  }
}

export async function fetchSemanticCountForEntity(driver: Driver, entityName: string): Promise<number> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $name})
       RETURN count(s) AS cnt`,
      { name: entityName },
    );
    return toNumber(result.records[0]?.get('cnt') ?? 0);
  } finally {
    await session.close();
  }
}

export async function fetchAllSemantics(driver: Driver): Promise<Array<{
  id: string; content: string; confidence: number; tags: string[]; entities: string[];
}>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)
       OPTIONAL MATCH (s)-[:ABOUT]->(e:Entity)
       RETURN s.id AS id, s.content AS content, s.confidence AS confidence,
              s.tags AS tags, collect(DISTINCT e.name) AS entities
       ORDER BY s.confidence DESC`,
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      content: r.get('content') as string,
      confidence: r.get('confidence') as number,
      tags: (r.get('tags') as string[]) ?? [],
      entities: (r.get('entities') as string[]).filter(Boolean),
    }));
  } finally {
    await session.close();
  }
}

// ─── Episodic queries ───────────────────────────────────────────────────────

export async function fetchEpisodicsForProject(driver: Driver, projectScope: string): Promise<EpisodicEntry[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (ep:Episodic)
       WHERE ep.task CONTAINS $tag
       RETURN ep.id AS id, ep.task AS task, ep.content AS content,
              ep.outcome AS outcome, ep.session_id AS session_id, ep.created_at AS created_at
       ORDER BY ep.created_at DESC`,
      { tag: `[project:${projectScope}]` },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      task: r.get('task') as string,
      content: r.get('content') as string,
      outcome: r.get('outcome') as string | null,
      session_id: r.get('session_id') as string,
      created_at: r.get('created_at') as string,
      project_scope: projectScope,
    }));
  } finally {
    await session.close();
  }
}

export async function fetchEpisodicsForEntity(driver: Driver, entityName: string): Promise<EpisodicEntry[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (ep:Episodic)
       WHERE (ep.task CONTAINS $name OR ep.content CONTAINS $name)
          OR EXISTS { MATCH (ep)-[:MODIFIED]->(e:Entity {name: $name}) }
       RETURN DISTINCT ep.id AS id, ep.task AS task, ep.content AS content,
              ep.outcome AS outcome, ep.session_id AS session_id, ep.created_at AS created_at
       ORDER BY ep.created_at DESC
       LIMIT 20`,
      { name: entityName },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      task: r.get('task') as string,
      content: r.get('content') as string,
      outcome: r.get('outcome') as string | null,
      session_id: r.get('session_id') as string,
      created_at: r.get('created_at') as string,
      project_scope: extractProjectScope(r.get('task') as string),
    }));
  } finally {
    await session.close();
  }
}

export async function fetchRecentEpisodics(driver: Driver, limit: number): Promise<EpisodicEntry[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (ep:Episodic)
       RETURN ep.id AS id, ep.task AS task, ep.content AS content,
              ep.outcome AS outcome, ep.session_id AS session_id, ep.created_at AS created_at
       ORDER BY ep.created_at DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      task: r.get('task') as string,
      content: r.get('content') as string,
      outcome: r.get('outcome') as string | null,
      session_id: r.get('session_id') as string,
      created_at: r.get('created_at') as string,
      project_scope: extractProjectScope(r.get('task') as string),
    }));
  } finally {
    await session.close();
  }
}

// ─── Hierarchy ──────────────────────────────────────────────────────────────

export async function fetchHierarchy(driver: Driver, entityName: string): Promise<{ parent?: string; children: string[] }> {
  const sessionA = driver.session();
  const sessionB = driver.session();
  try {
    const [parentResult, childrenResult] = await Promise.all([
      sessionA.run(
        `MATCH (parent:Entity)-[:CONTAINS]->(e:Entity {name: $name})
         RETURN parent.name AS name LIMIT 1`,
        { name: entityName },
      ),
      sessionB.run(
        `MATCH (e:Entity {name: $name})-[:CONTAINS]->(child:Entity)
         RETURN child.name AS name ORDER BY name`,
        { name: entityName },
      ),
    ]);
    return {
      parent: parentResult.records.length > 0 ? parentResult.records[0].get('name') as string : undefined,
      children: childrenResult.records.map((r) => r.get('name') as string),
    };
  } finally {
    await Promise.all([sessionA.close(), sessionB.close()]);
  }
}

// ─── Backlinks ──────────────────────────────────────────────────────────────

export async function fetchBacklinks(driver: Driver, entityName: string): Promise<Array<{ entity_name: string; entity_slug: string; context: string }>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)-[:ABOUT]->(target:Entity {name: $name})
       MATCH (s)-[:ABOUT]->(other:Entity)
       WHERE other.name <> $name
       RETURN DISTINCT other.name AS name, substring(s.content, 0, 120) AS context
       ORDER BY name
       LIMIT 50`,
      { name: entityName },
    );
    return result.records.map((r) => ({
      entity_name: r.get('name') as string,
      entity_slug: slugify(r.get('name') as string),
      context: (r.get('context') as string) ?? '',
    }));
  } finally {
    await session.close();
  }
}

// ─── Related entities ───────────────────────────────────────────────────────

export async function fetchRelatedEntities(driver: Driver, entityName: string): Promise<Array<{ entity_name: string; entity_slug: string; context: string; weight: number }>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (e:Entity {name: $name})
       OPTIONAL MATCH (e)-[r]->(related:Entity)
       WHERE type(r) <> 'CONTAINS'
       WITH collect({name: related.name, rel: type(r)}) AS outgoing
       OPTIONAL MATCH (other:Entity)-[r2]->(e2:Entity {name: $name})
       WHERE type(r2) <> 'CONTAINS'
       WITH outgoing, collect({name: other.name, rel: type(r2)}) AS incoming
       UNWIND (outgoing + incoming) AS rel
       WITH rel WHERE rel.name IS NOT NULL
       RETURN DISTINCT rel.name AS name, rel.rel AS rel_type
       ORDER BY name
       LIMIT 20`,
      { name: entityName },
    );
    return result.records.map((r) => ({
      entity_name: r.get('name') as string,
      entity_slug: slugify(r.get('name') as string),
      context: `via ${(r.get('rel_type') as string).toLowerCase()}`,
      weight: 1.0,
    }));
  } finally {
    await session.close();
  }
}

// ─── Sources ────────────────────────────────────────────────────────────────

export async function fetchAllSources(driver: Driver): Promise<SourceInfo[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Source)
       RETURN s.id AS id, s.title AS title, s.source_type AS source_type,
              s.path AS path, s.project_tag AS project_tag, s.created_at AS created_at
       ORDER BY s.title`,
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      title: (r.get('title') as string) ?? 'Untitled',
      source_type: (r.get('source_type') as string) ?? 'unknown',
      path: (r.get('path') as string) ?? '',
      project_tag: (r.get('project_tag') as string) ?? '',
      created_at: (r.get('created_at') as string) ?? '',
    }));
  } finally {
    await session.close();
  }
}

export async function fetchClaimsForSource(driver: Driver, sourceId: string): Promise<ResolvedClaim[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)-[:CITES]->(src:Source {id: $sourceId})
       OPTIONAL MATCH (s)-[:ABOUT]->(e:Entity)
       RETURN s.id AS id, s.content AS content, s.confidence AS confidence,
              collect(DISTINCT e.name) AS entity_refs
       ORDER BY s.confidence DESC`,
      { sourceId },
    );
    return result.records.map((r) => ({
      content: r.get('content') as string,
      confidence: r.get('confidence') as number,
      amp_id: r.get('id') as string,
      source_refs: [sourceId],
      entity_refs: (r.get('entity_refs') as string[]).filter(Boolean),
    }));
  } finally {
    await session.close();
  }
}

// ─── Tags / Topics ──────────────────────────────────────────────────────────

export async function fetchAllTags(driver: Driver): Promise<Array<{ tag: string; count: number; projects: string[] }>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)
       UNWIND s.tags AS tag
       WITH tag WHERE NOT tag STARTS WITH 'project:'
       WITH tag, count(*) AS cnt
       RETURN tag, cnt AS count, [] AS projects
       ORDER BY cnt DESC`,
    );
    return result.records.map((r) => ({
      tag: r.get('tag') as string,
      count: toNumber(r.get('count')),
      projects: (r.get('projects') as string[]).filter(Boolean),
    }));
  } finally {
    await session.close();
  }
}

export async function fetchSemanticsForTag(driver: Driver, tag: string): Promise<Array<{
  content: string; confidence: number; entities: string[];
}>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)
       WHERE $tag IN s.tags
       OPTIONAL MATCH (s)-[:ABOUT]->(e:Entity)
       RETURN s.content AS content, s.confidence AS confidence,
              collect(DISTINCT e.name) AS entities
       ORDER BY s.confidence DESC`,
      { tag },
    );
    return result.records.map((r) => ({
      content: r.get('content') as string,
      confidence: r.get('confidence') as number,
      entities: (r.get('entities') as string[]).filter(Boolean),
    }));
  } finally {
    await session.close();
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function fetchGraphStats(driver: Driver): Promise<{
  total_entities: number; total_facts: number; total_semantics: number; total_episodics: number; total_sources: number;
}> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (n)
       RETURN labels(n)[0] AS label, count(n) AS cnt`,
    );
    const counts: Record<string, number> = {};
    for (const r of result.records) {
      counts[r.get('label') as string] = toNumber(r.get('cnt'));
    }
    return {
      total_entities: counts['Entity'] ?? 0,
      total_facts: counts['Fact'] ?? 0,
      total_semantics: counts['Semantic'] ?? 0,
      total_episodics: counts['Episodic'] ?? 0,
      total_sources: counts['Source'] ?? 0,
    };
  } finally {
    await session.close();
  }
}

// ─── Inbound link count ─────────────────────────────────────────────────────

export async function fetchInboundLinkCount(driver: Driver, entityName: string): Promise<number> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $name})
       MATCH (s)-[:ABOUT]->(other:Entity)
       WHERE other.name <> $name
       RETURN count(DISTINCT other) AS cnt`,
      { name: entityName },
    );
    return toNumber(result.records[0]?.get('cnt') ?? 0);
  } finally {
    await session.close();
  }
}

// ─── Sources for an entity ──────────────────────────────────────────────────

export async function fetchSourcesForEntity(driver: Driver, entityName: string): Promise<Array<{
  id: string; title: string; source_type: string; slug: string;
}>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $name})
       MATCH (s)-[:CITES]->(src:Source)
       RETURN DISTINCT src.id AS id, src.title AS title, src.source_type AS source_type
       ORDER BY title`,
      { name: entityName },
    );
    return result.records.map((r) => ({
      id: r.get('id') as string,
      title: (r.get('title') as string) ?? 'Untitled',
      source_type: (r.get('source_type') as string) ?? 'unknown',
      slug: slugify((r.get('title') as string) ?? r.get('id') as string),
    }));
  } finally {
    await session.close();
  }
}
