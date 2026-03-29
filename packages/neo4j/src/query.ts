// packages/neo4j/src/query.ts
import neo4j, { type Driver } from 'neo4j-driver';
import type { SemanticNode } from '@amp/core';

export interface QueryScope {
  entities?: string[];
  tags?: string[];
  limit: number;
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

export class ScopedQuery {
  constructor(private driver: Driver) {}

  async byEntity(entityName: string, limit: number): Promise<SemanticNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $entityName})
         RETURN s
         ORDER BY s.confidence DESC, s.updated_at DESC
         LIMIT $limit`,
        { entityName, limit: neo4j.int(limit) },
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
    const { entities = [], tags = [], limit } = scope;
    const session = this.driver.session();
    try {
      // Build query that handles entities and/or tags with DISTINCT results
      let cypher: string;
      const params: Record<string, unknown> = { limit: neo4j.int(limit) };

      if (entities.length > 0 && tags.length > 0) {
        params.entities = entities;
        params.tags = tags;
        cypher = `
          MATCH (s:Semantic)-[:ABOUT]->(e:Entity)
          WHERE e.name IN $entities AND ANY(t IN $tags WHERE t IN s.tags)
          RETURN DISTINCT s
          ORDER BY s.confidence DESC, s.updated_at DESC
          LIMIT $limit`;
      } else if (entities.length > 0) {
        params.entities = entities;
        cypher = `
          MATCH (s:Semantic)-[:ABOUT]->(e:Entity)
          WHERE e.name IN $entities
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

  async rawCypher(cypher: string, limit: number): Promise<Record<string, unknown>[]> {
    // Validate that the query is read-only before executing
    validateReadOnlyCypher(cypher);

    const session = this.driver.session();
    try {
      // Append LIMIT clause only if not already present (case-insensitive)
      const hasLimit = /\bLIMIT\b/i.test(cypher);
      const finalCypher = hasLimit ? cypher : `${cypher.trimEnd()} LIMIT ${limit}`;

      const result = await session.run(finalCypher, {});
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
