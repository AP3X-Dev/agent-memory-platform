// packages/neo4j/src/query.ts
import { type Driver } from 'neo4j-driver';
import type { SemanticNode } from '@amp/core';

export interface QueryScope {
  entities?: string[];
  tags?: string[];
  limit: number;
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
        { entityName, limit },
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
        { tag, limit },
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
      const params: Record<string, unknown> = { limit };

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
        { limit, embedding },
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
