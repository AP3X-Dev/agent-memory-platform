// packages/arch/src/relation-store.ts
// Typed structural relationships between entities.

import { type Driver } from 'neo4j-driver';
import type { StructuralRelationType } from './types.js';
import { temporalSetClause, activeRelationshipFilter, invalidateRelationship } from '@amp/neo4j';

const VALID_RELATION_TYPES: Set<string> = new Set([
  'USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'EMITS', 'LISTENS',
]);

export class StructuralRelationStore {
  constructor(private driver: Driver) {}

  /**
   * Create a typed structural relationship between two entities.
   * Relation type must be one of: USES, CALLS, EXTENDS, IMPLEMENTS, EMITS, LISTENS.
   */
  async create(
    fromEntity: string,
    toEntity: string,
    type: StructuralRelationType,
    properties?: Record<string, string>,
  ): Promise<boolean> {
    if (!VALID_RELATION_TYPES.has(type)) {
      throw new Error(`Invalid relation type: ${type}. Must be one of: ${[...VALID_RELATION_TYPES].join(', ')}`);
    }

    const session = this.driver.session();
    try {
      // Relationship types cannot be parameterized in Cypher — validated against enum above.
      // Properties are passed via Neo4j parameters to prevent injection.
      const result = await session.run(
        `MATCH (a:Entity {name: $from}), (b:Entity {name: $to})
         MERGE (a)-[r:${type}]->(b)
         SET r += $props
         ${temporalSetClause('r')}
         RETURN a.name AS from, b.name AS to`,
        { from: fromEntity, to: toEntity, props: properties ?? {}, now: new Date().toISOString() },
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  async remove(fromEntity: string, toEntity: string, type: StructuralRelationType): Promise<void> {
    if (!VALID_RELATION_TYPES.has(type)) return; // Validated against enum — safe for interpolation
    const session = this.driver.session();
    try {
      // Invalidate rather than delete — preserves temporal history
      const now = new Date().toISOString();
      await session.run(
        `MATCH (a:Entity {name: $from})-[r:${type}]->(b:Entity {name: $to})
         WHERE r.invalid_at IS NULL
         SET r.invalid_at = $now`,
        { from: fromEntity, to: toEntity, now },
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Get all entities that depend ON the given entity (entities that USE/CALL/EXTEND/LISTEN to it).
   */
  async getDependents(entityName: string, asOf?: string): Promise<Array<{ name: string; relation: string }>> {
    const session = this.driver.session();
    try {
      const filter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = { name: entityName };
      if (asOf) params.asOf = asOf;

      const result = await session.run(
        `MATCH (dependent:Entity)-[r]->(target:Entity {name: $name})
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'LISTENS']
           AND ${filter}
         RETURN dependent.name AS name, type(r) AS relation
         ORDER BY dependent.name ASC`,
        params,
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        relation: r.get('relation') as string,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all entities that the given entity depends ON.
   */
  async getDependencies(entityName: string, asOf?: string): Promise<Array<{ name: string; relation: string; interface_desc: string }>> {
    const session = this.driver.session();
    try {
      const filter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = { name: entityName };
      if (asOf) params.asOf = asOf;

      const result = await session.run(
        `MATCH (source:Entity {name: $name})-[r]->(dep:Entity)
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'EMITS']
           AND ${filter}
         RETURN dep.name AS name, type(r) AS relation,
                COALESCE(dep.interface_desc, '') AS interface_desc
         ORDER BY dep.name ASC`,
        params,
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        relation: r.get('relation') as string,
        interface_desc: r.get('interface_desc') as string,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get the full call graph from an entity up to a given depth.
   */
  async getCallGraph(
    entityName: string,
    maxDepth = 3,
    asOf?: string,
  ): Promise<Array<{ from: string; to: string; relation: string; depth: number }>> {
    const depth = Math.floor(Number(maxDepth));
    if (!Number.isFinite(depth) || depth < 1 || depth > 20) {
      throw new Error(`maxDepth must be an integer between 1 and 20, got: ${maxDepth}`);
    }
    const session = this.driver.session();
    try {
      const filter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = { name: entityName };
      if (asOf) params.asOf = asOf;

      const result = await session.run(
        `MATCH path = (start:Entity {name: $name})-[:USES|CALLS*1..${depth}]->(dep:Entity)
         UNWIND range(0, length(path)-1) AS idx
         WITH relationships(path)[idx] AS r, nodes(path)[idx] AS from, nodes(path)[idx+1] AS to, idx+1 AS depth
         WHERE ${filter}
         RETURN DISTINCT from.name AS fromName, to.name AS toName, type(r) AS relation, depth
         ORDER BY depth ASC, fromName ASC`,
        params,
      );
      return result.records.map((r) => ({
        from: r.get('fromName') as string,
        to: r.get('toName') as string,
        relation: r.get('relation') as string,
        depth: toNum(r.get('depth')),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all structural relationships for a given entity (both directions).
   */
  async getAllRelations(entityName: string, asOf?: string): Promise<Array<{ from: string; to: string; relation: string }>> {
    const session = this.driver.session();
    try {
      const filter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = { name: entityName };
      if (asOf) params.asOf = asOf;

      const result = await session.run(
        `MATCH (e:Entity {name: $name})-[r]->(other:Entity)
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'EMITS', 'LISTENS']
           AND ${filter}
         RETURN e.name AS from, other.name AS to, type(r) AS relation
         UNION
         MATCH (other:Entity)-[r]->(e:Entity {name: $name})
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'EMITS', 'LISTENS']
           AND ${filter}
         RETURN other.name AS from, e.name AS to, type(r) AS relation`,
        params,
      );
      return result.records.map((r) => ({
        from: r.get('from') as string,
        to: r.get('to') as string,
        relation: r.get('relation') as string,
      }));
    } finally {
      await session.close();
    }
  }
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}
