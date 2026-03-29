// packages/arch/src/aspect-store.ts
// CRUD for Aspect nodes + APPLIES_TO / IMPLIES relationships.

import { type Driver } from 'neo4j-driver';
import { nanoid } from 'nanoid';
import type { AspectNode, StabilityTier } from './types.js';

export class AspectStore {
  constructor(private driver: Driver) {}

  async create(input: {
    name: string;
    description: string;
    stability_tier: StabilityTier;
    implies?: string[];
    anchors?: string[];
  }): Promise<string> {
    const session = this.driver.session();
    try {
      const id = `aspect-${nanoid(10)}`;
      const now = new Date().toISOString();

      const result = await session.run(
        `MERGE (a:Aspect {name: $name})
         ON CREATE SET a.id = $id, a.description = $description,
                       a.stability_tier = $stability_tier,
                       a.implies = $implies, a.anchors = $anchors,
                       a.created_at = $now, a.updated_at = $now
         ON MATCH SET a.description = $description,
                      a.stability_tier = $stability_tier,
                      a.implies = $implies, a.anchors = $anchors,
                      a.updated_at = $now
         RETURN a.id AS nodeId`,
        {
          id,
          name: input.name,
          description: input.description,
          stability_tier: input.stability_tier,
          implies: input.implies ?? [],
          anchors: input.anchors ?? [],
          now,
        },
      );

      const actualId = result.records[0].get('nodeId') as string;

      // Create IMPLIES edges for implied aspects
      for (const impliedName of input.implies ?? []) {
        await session.run(
          `MATCH (a:Aspect {name: $name})
           MERGE (b:Aspect {name: $implied})
           ON CREATE SET b.id = $impliedId, b.description = '', b.stability_tier = 'implementation',
                         b.implies = [], b.anchors = [], b.created_at = $now, b.updated_at = $now
           MERGE (a)-[:IMPLIES]->(b)`,
          { name: input.name, implied: impliedName, impliedId: `aspect-${nanoid(10)}`, now },
        );
      }

      return actualId;
    } finally {
      await session.close();
    }
  }

  async applyTo(aspectName: string, entityName: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (a:Aspect {name: $aspect}), (e:Entity {name: $entity})
         MERGE (a)-[:APPLIES_TO]->(e)`,
        { aspect: aspectName, entity: entityName },
      );
    } finally {
      await session.close();
    }
  }

  async removeFrom(aspectName: string, entityName: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (a:Aspect {name: $aspect})-[r:APPLIES_TO]->(e:Entity {name: $entity})
         DELETE r`,
        { aspect: aspectName, entity: entityName },
      );
    } finally {
      await session.close();
    }
  }

  async getByName(name: string): Promise<AspectNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (a:Aspect {name: $name}) RETURN a',
        { name },
      );
      if (result.records.length === 0) return null;
      return mapAspect(result.records[0].get('a').properties);
    } finally {
      await session.close();
    }
  }

  /**
   * Get all aspects that apply to an entity (direct + inherited from ancestors + implied).
   */
  async getEffectiveAspects(entityName: string): Promise<AspectNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `// Direct aspects on this entity
         MATCH (a:Aspect)-[:APPLIES_TO]->(e:Entity {name: $name})
         RETURN DISTINCT a
         UNION
         // Aspects inherited from ancestors
         MATCH (ancestor:Entity)-[:CONTAINS*]->(e:Entity {name: $name})
         MATCH (a:Aspect)-[:APPLIES_TO]->(ancestor)
         RETURN DISTINCT a
         UNION
         // Implied aspects (transitive)
         MATCH (a:Aspect)-[:APPLIES_TO]->(e:Entity {name: $name})
         MATCH (a)-[:IMPLIES*]->(implied:Aspect)
         RETURN DISTINCT implied AS a`,
        { name: entityName },
      );
      return result.records.map((r) => mapAspect(r.get('a').properties));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all entities that a given aspect applies to.
   */
  async getEntitiesForAspect(aspectName: string): Promise<string[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (a:Aspect {name: $name})-[:APPLIES_TO]->(e:Entity)
         RETURN e.name AS name ORDER BY e.name ASC`,
        { name: aspectName },
      );
      return result.records.map((r) => r.get('name') as string);
    } finally {
      await session.close();
    }
  }

  async listAll(): Promise<AspectNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (a:Aspect) RETURN a ORDER BY a.stability_tier ASC, a.name ASC',
      );
      return result.records.map((r) => mapAspect(r.get('a').properties));
    } finally {
      await session.close();
    }
  }
}

function mapAspect(props: Record<string, unknown>): AspectNode {
  return {
    id: props.id as string,
    name: props.name as string,
    description: (props.description as string) ?? '',
    stability_tier: (props.stability_tier as StabilityTier) ?? 'implementation',
    implies: (props.implies as string[]) ?? [],
    anchors: (props.anchors as string[]) ?? [],
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
  };
}
