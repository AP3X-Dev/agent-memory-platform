// packages/neo4j/src/query.ts
import neo4j, { type Driver } from 'neo4j-driver';
import type { SemanticNode, FactNode, EpisodicNode, TemporalOptions } from '@memberry/core';
import { activeRelationshipFilter } from './temporal-edges.js';

export interface QueryScope {
  entities?: string[];
  tags?: string[];
  limit: number;
  /** ISO timestamp — when provided, only traverse relationships active at this time */
  asOf?: string;
}

// ─── Cypher read-only validation ─────────────────────────────────────────────

/**
 * Mutating Cypher keywords that must not appear in user-supplied queries.
 * Checked as whole words (with word-boundary assertions) after stripping
 * string literals, line/block comments, and parameter references.
 */
const MUTATING_KEYWORDS = [
  'CREATE', 'MERGE', 'SET', 'DELETE', 'DETACH', 'REMOVE', 'DROP',
  'FOREACH', 'LOAD',
];

const ADMINISTRATIVE_COMMAND_RE = /^\s*(SHOW|USE)\b/i;
const MAX_RAW_CYPHER_LIMIT = 100;

function stripTrailingSemicolons(cypher: string): string {
  return cypher.trim().replace(/;+\s*$/g, '');
}

/**
 * Validates that a Cypher query is read-only.
 *
 * Steps:
 *  1. Strip string literals (single- and double-quoted) so keywords inside
 *     strings don't trigger false positives.
 *  2. Strip line comments (`// ...`) and block comments (`/* ... *​/`).
 *  3. Strip parameter references (`$identifier`) so parameter names like
 *     `$SET`, `$DELETE` don't trigger false positives.
 *  4. Check for mutating keywords using word-boundary regex.
 *  5. Check for `CALL` followed by a procedure name (word chars / dots),
 *     but allow `CALL {` which is a read-only subquery in Neo4j 4.x+.
 *
 * Throws an error describing the violation when a mutating construct is found.
 */
export function validateReadOnlyCypher(cypher: string): void {
  // Step 1: Strip string literals (replace with empty string)
  let stripped = cypher.replace(/'(?:[^'\\]|\\.)*'/g, '""');
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');

  // Step 2: Strip comments
  stripped = stripped.replace(/\/\/[^\n]*/g, ' ');       // line comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, ' '); // block comments

  // Step 3: Strip parameter references ($word) to prevent false positives
  // e.g. $SET, $DELETE, $REMOVE should not trigger keyword checks
  stripped = stripped.replace(/\$\w+/g, ' ');

  const adminMatch = stripped.match(ADMINISTRATIVE_COMMAND_RE);
  if (adminMatch) {
    throw new Error(
      `Cypher validation failed: query contains administrative keyword "${adminMatch[1].toUpperCase()}". ` +
      'Only graph read queries are allowed via amp_query.',
    );
  }

  // Step 4: Check for mutating keywords
  for (const kw of MUTATING_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(stripped)) {
      throw new Error(
        `Cypher validation failed: query contains mutating keyword "${kw}". ` +
        'Only read-only queries are allowed via amp_query.',
      );
    }
  }

  // Step 5: Block CALL to procedures but allow CALL {} subqueries
  // CALL { ... } is a read-only subquery in Neo4j 4.x+ → allowed
  // CALL procedureName(...) invokes a stored procedure → blocked
  // Strategy: find all CALL occurrences, check what follows each one.
  // If the first non-whitespace character after CALL is '{', it's a subquery.
  // Otherwise (word char = procedure name), it's a procedure call → reject.
  const callProcRe = /\bCALL\b\s+(?!\s*\{)[\w.]/gi;
  if (callProcRe.test(stripped)) {
    throw new Error(
      'Cypher validation failed: query contains CALL to a stored procedure. ' +
      'Only read-only queries are allowed via amp_query. ' +
      'CALL {} subqueries are permitted.',
    );
  }
}

function normalizeRawCypherLimit(limit: number): number {
  const floored = Math.floor(limit);
  if (Number.isNaN(floored)) return 1;
  if (!Number.isFinite(floored)) return MAX_RAW_CYPHER_LIMIT;
  return Math.min(MAX_RAW_CYPHER_LIMIT, Math.max(1, floored));
}

export class ScopedQuery {
  constructor(private driver: Driver) {}

  async byEntity(entityName: string, limit: number, asOf?: string): Promise<SemanticNode[]> {
    const session = this.driver.session();
    try {
      const relFilter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = { entityName, limit: neo4j.int(limit) };
      if (asOf) params.asOf = asOf;

      const result = await session.run(
        `MATCH (s:Semantic)-[r:ABOUT]->(e:Entity {name: $entityName})
         WHERE ${relFilter}
         RETURN s
         ORDER BY s.confidence DESC, s.updated_at DESC
         LIMIT $limit`,
        params,
      );
      return result.records.map((r) => mapSemanticNode(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  async byTag(tag: string, limit: number): Promise<SemanticNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)
         WHERE $tag IN s.tags
         RETURN s
         ORDER BY s.confidence DESC, s.updated_at DESC
         LIMIT $limit`,
        { tag, limit: neo4j.int(limit) },
      );
      return result.records.map((r) => mapSemanticNode(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  async byScope(scope: QueryScope): Promise<SemanticNode[]> {
    const { entities = [], tags = [], limit, asOf } = scope;
    const session = this.driver.session();
    try {
      // Build query that handles entities and/or tags with DISTINCT results
      let cypher: string;
      const params: Record<string, unknown> = { limit: neo4j.int(limit) };
      if (asOf) params.asOf = asOf;

      const relFilter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);

      if (entities.length > 0 && tags.length > 0) {
        params.entities = entities;
        params.tags = tags;
        cypher = `
          MATCH (s:Semantic)-[r:ABOUT]->(e:Entity)
          WHERE e.name IN $entities AND ANY(t IN $tags WHERE t IN s.tags)
            AND ${relFilter}
          RETURN DISTINCT s
          ORDER BY s.confidence DESC, s.updated_at DESC
          LIMIT $limit`;
      } else if (entities.length > 0) {
        params.entities = entities;
        cypher = `
          MATCH (s:Semantic)-[r:ABOUT]->(e:Entity)
          WHERE e.name IN $entities
            AND ${relFilter}
          RETURN DISTINCT s
          ORDER BY s.confidence DESC, s.updated_at DESC
          LIMIT $limit`;
      } else if (tags.length > 0) {
        params.tags = tags;
        cypher = `
          MATCH (s:Semantic)
          WHERE ANY(t IN $tags WHERE t IN s.tags)
          RETURN DISTINCT s
          ORDER BY s.confidence DESC, s.updated_at DESC
          LIMIT $limit`;
      } else {
        // No filters — return most-confident semantics
        cypher = `
          MATCH (s:Semantic)
          RETURN s
          ORDER BY s.confidence DESC, s.updated_at DESC
          LIMIT $limit`;
      }

      const result = await session.run(cypher, params);
      return result.records.map((r) => mapSemanticNode(r.get('s').properties));
    } finally {
      await session.close();
    }
  }

  async byVector(
    embedding: number[],
    limit: number,
  ): Promise<Array<SemanticNode & { score: number }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `CALL db.index.vector.queryNodes('semantic_embedding', $limit, $embedding)
         YIELD node, score
         RETURN node, score`,
        { limit: neo4j.int(limit), embedding },
      );
      return result.records.map((r) => ({
        ...mapSemanticNode(r.get('node').properties),
        score: r.get('score') as number,
      }));
    } finally {
      await session.close();
    }
  }

  async byFacts(entityName: string, options?: TemporalOptions): Promise<FactNode[]> {
    const session = this.driver.session();
    try {
      const timeMode = options?.time_mode ?? 'current';
      let cypher: string;
      const params: Record<string, unknown> = { entityName };

      switch (timeMode) {
        case 'current':
          cypher = `
            MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
            WHERE f.status = 'active' AND f.invalid_at IS NULL
            RETURN f
            ORDER BY f.confidence DESC, f.valid_at DESC`;
          break;

        case 'historical':
          params.as_of = options?.as_of ?? new Date().toISOString();
          cypher = `
            MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
            WHERE f.valid_at <= $as_of AND (f.invalid_at IS NULL OR f.invalid_at > $as_of)
            RETURN f
            ORDER BY f.confidence DESC, f.valid_at DESC`;
          break;

        case 'interval':
          params.from = options?.from ?? '1970-01-01T00:00:00.000Z';
          params.to = options?.to ?? new Date().toISOString();
          cypher = `
            MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
            WHERE f.valid_at <= $to AND (f.invalid_at IS NULL OR f.invalid_at > $from)
            RETURN f
            ORDER BY f.confidence DESC, f.valid_at DESC`;
          break;

        case 'evolution':
          if (options?.include_invalidated) {
            cypher = `
              MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
              RETURN f
              ORDER BY f.valid_at ASC`;
          } else {
            cypher = `
              MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
              WHERE f.status <> 'invalidated'
              RETURN f
              ORDER BY f.valid_at ASC`;
          }
          break;

        default: {
          const _exhaustive: never = timeMode;
          throw new Error(`Unknown time_mode: ${String(_exhaustive)}`);
        }
      }

      const result = await session.run(cypher, params);
      return result.records.map((r) => mapFactNode(r.get('f').properties));
    } finally {
      await session.close();
    }
  }

  async byEntityWithFacts(
    entityName: string,
    options?: TemporalOptions,
  ): Promise<{ semantics: SemanticNode[]; facts: FactNode[]; episodes: EpisodicNode[] }> {
    let semantics: SemanticNode[];
    let episodes: EpisodicNode[];

    const asOf = options?.as_of;

    // Query semantics and episodes in one session
    const session = this.driver.session();
    try {
      const aboutFilter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const semParams: Record<string, unknown> = { entityName };
      if (asOf) semParams.asOf = asOf;

      const semanticResult = await session.run(
        `MATCH (s:Semantic)-[r:ABOUT]->(e:Entity {name: $entityName})
         WHERE ${aboutFilter}
         RETURN s
         ORDER BY s.confidence DESC, s.updated_at DESC`,
        semParams,
      );
      semantics = semanticResult.records.map((r) =>
        mapSemanticNode(r.get('s').properties),
      );

      const refFilter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const epParams: Record<string, unknown> = { entityName };
      if (asOf) epParams.asOf = asOf;

      const episodeResult = await session.run(
        `MATCH (ep:Episodic)-[r:REFERENCES]->(e:Entity {name: $entityName})
         WHERE ${refFilter}
         RETURN ep
         ORDER BY ep.created_at DESC`,
        epParams,
      );
      episodes = episodeResult.records.map((r) =>
        mapEpisodicNode(r.get('ep').properties),
      );
    } finally {
      await session.close();
    }

    // Query facts via byFacts (opens its own session)
    const facts = await this.byFacts(entityName, options);

    return { semantics, facts, episodes };
  }

  /**
   * Graph-structural retrieval: expand from seed entities via ABOUT and SAME_EPISODE edges.
   * Pulls in connected knowledge that vector/fulltext search alone would miss.
   *
   * Traversal paths:
   * - Entity <-[ABOUT]- Semantic -[ABOUT]-> Entity (semantic neighbors)
   * - Entity <-[FACT_ABOUT]- Fact -[SAME_EPISODE]- Fact -[FACT_ABOUT]-> Entity (co-extracted fact neighbors)
   *
   * Returns deduplicated semantic nodes scored by distance from seed (closer = higher score).
   */
  async expandByGraph(
    entityNames: string[],
    depth: number = 1,
    maxPerHop: number = 5,
    asOf?: string,
  ): Promise<SemanticNode[]> {
    if (entityNames.length === 0) return [];

    const session = this.driver.session();
    try {
      const relFilter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = {
        entityNames,
        maxPerHop: neo4j.int(maxPerHop),
      };
      if (asOf) params.asOf = asOf;

      // Path 1: Semantic neighbors — find semantics ABOUT other entities connected
      // via shared semantic nodes to the seed entities
      const semanticNeighborCypher = depth >= 2
        ? `MATCH (e:Entity)<-[r:ABOUT]-(s:Semantic)-[r2:ABOUT]->(e2:Entity)<-[r3:ABOUT]-(s2:Semantic)
           WHERE toLower(e.name) IN $lowerNames
             AND ${relFilter}
             AND r2.invalid_at IS NULL
             AND r3.invalid_at IS NULL
             AND NOT toLower(e2.name) IN $lowerNames
           RETURN DISTINCT s2 AS node, 0.2 AS hopScore
           ORDER BY s2.confidence DESC
           LIMIT $maxPerHop`
        : `MATCH (e:Entity)<-[r:ABOUT]-(s:Semantic)-[r2:ABOUT]->(e2:Entity)<-[r3:ABOUT]-(s2:Semantic)
           WHERE toLower(e.name) IN $lowerNames
             AND ${relFilter}
             AND r2.invalid_at IS NULL
             AND r3.invalid_at IS NULL
             AND NOT toLower(e2.name) IN $lowerNames
           RETURN DISTINCT s2 AS node, 0.3 AS hopScore
           ORDER BY s2.confidence DESC
           LIMIT $maxPerHop`;

      // Path 2: Co-extracted fact neighbors — traverse SAME_EPISODE edges on facts
      const factNeighborCypher =
        `MATCH (e:Entity)<-[:FACT_ABOUT]-(f1:Fact)-[:SAME_EPISODE]-(f2:Fact)-[:FACT_ABOUT]->(e2:Entity)<-[r:ABOUT]-(s:Semantic)
         WHERE toLower(e.name) IN $lowerNames
           AND NOT toLower(e2.name) IN $lowerNames
           AND ${relFilter}
         RETURN DISTINCT s AS node, 0.25 AS hopScore
         ORDER BY s.confidence DESC
         LIMIT $maxPerHop`;

      const lowerNames = entityNames.map(n => n.toLowerCase());
      const paramsWithLower = { ...params, lowerNames };

      // Run the two neighbor expansions in parallel, but each on its OWN session
      // — a single Neo4j session permits only one concurrent query (a shared
      // session throws "Queries cannot be run … with an open transaction").
      const factSession = this.driver.session();
      const [semResult, factResult] = await Promise.all([
        session.run(semanticNeighborCypher, paramsWithLower),
        factSession.run(factNeighborCypher, paramsWithLower).finally(() => factSession.close()),
      ]);

      const seen = new Set<string>();
      const results: SemanticNode[] = [];

      for (const record of semResult.records) {
        const node = mapSemanticNode(record.get('node').properties);
        if (!seen.has(node.id)) {
          seen.add(node.id);
          results.push(node);
        }
      }

      for (const record of factResult.records) {
        const node = mapSemanticNode(record.get('node').properties);
        if (!seen.has(node.id)) {
          seen.add(node.id);
          results.push(node);
        }
      }

      return results;
    } finally {
      await session.close();
    }
  }

  async rawCypher(cypher: string, limit: number, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    // Validate that the query is read-only before executing
    validateReadOnlyCypher(cypher);

    const session = this.driver.session();
    try {
      const safeLimit = normalizeRawCypherLimit(limit);
      const finalCypher = `CALL {\n${stripTrailingSemicolons(cypher)}\n}\nRETURN * LIMIT ${safeLimit}`;

      const result = await session.run(finalCypher, params);
      return result.records.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const key of r.keys) {
          const strKey = String(key);
          const val = r.get(strKey);
          // Unwrap Neo4j node to its properties when applicable
          if (val !== null && typeof val === 'object' && 'properties' in val) {
            obj[strKey] = val.properties as Record<string, unknown>;
          } else {
            obj[strKey] = val;
          }
        }
        return obj;
      });
    } finally {
      await session.close();
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function mapSemanticNode(props: Record<string, unknown>): SemanticNode {
  return {
    id: props.id as string,
    content: props.content as string,
    confidence: props.confidence as number,
    signal_count: props.signal_count as number,
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
    decay_class: props.decay_class as SemanticNode['decay_class'],
    tags: (props.tags as string[]) ?? [],
    embedding: props.embedding != null ? (props.embedding as number[]) : undefined,
  };
}

function mapFactNode(props: Record<string, unknown>): FactNode {
  return {
    id: props.id as string,
    subject: props.subject as string,
    predicate: props.predicate as string,
    object: props.object as string,
    entity_id: (props.entity_id as string | null) ?? null,
    source_episode_ids: (props.source_episode_ids as string[]) ?? [],
    valid_at: props.valid_at as string,
    invalid_at: (props.invalid_at as string) ?? null,
    confidence: props.confidence as number,
    status: props.status as FactNode['status'],
    supersedes_fact_id: (props.supersedes_fact_id as string) ?? null,
    scope: props.scope as FactNode['scope'],
    tags: (props.tags as string[]) ?? [],
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
    ...(props.embedding != null && { embedding: props.embedding as number[] }),
  };
}

function mapEpisodicNode(props: Record<string, unknown>): EpisodicNode {
  return {
    id: props.id as string,
    session_id: props.session_id as string,
    agent_id: props.agent_id as string,
    task: props.task as string,
    content: props.content as string,
    outcome: (props.outcome as EpisodicNode['outcome']) ?? undefined,
    created_at: props.created_at as string,
    ttl: props.ttl != null ? (props.ttl as number) : undefined,
    embedding: props.embedding != null ? (props.embedding as number[]) : undefined,
  };
}
