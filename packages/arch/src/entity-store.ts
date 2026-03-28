// packages/arch/src/entity-store.ts
// Enriches existing Entity nodes with architectural properties.

import neo4j, { type Driver } from 'neo4j-driver';
import type { ArchEntityProperties, EntityCategory } from './types.js';

export class ArchEntityStore {
  constructor(private driver: Driver) {}

  /**
   * Enrich an existing Entity node with architectural properties.
   * Uses SET (not CREATE) — the Entity must already exist from amp_bootstrap.
   */
  async setArchProperties(
    entityName: string,
    props: Partial<ArchEntityProperties>,
  ): Promise<boolean> {
    const session = this.driver.session();
    try {
      const setClauses: string[] = [];
      const params: Record<string, unknown> = { name: entityName };

      for (const [key, value] of Object.entries(props)) {
        if (value !== undefined) {
          setClauses.push(`e.${key} = $${key}`);
          params[key] = value;
        }
      }

      if (setClauses.length === 0) return false;

      const result = await session.run(
        `MATCH (e:Entity {name: $name})
         SET ${setClauses.join(', ')}
         RETURN e.name AS name`,
        params,
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  async getByCategory(category: EntityCategory): Promise<Array<{ name: string; depth: number; responsibility: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Entity {category: $category})
         RETURN e.name AS name, e.depth AS depth, e.responsibility AS responsibility
         ORDER BY e.depth ASC, e.name ASC`,
        { category },
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        depth: toNum(r.get('depth')),
        responsibility: (r.get('responsibility') as string) ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  async getChildren(entityName: string): Promise<Array<{ name: string; category: string; responsibility: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (parent:Entity {name: $name})-[:CONTAINS]->(child:Entity)
         RETURN child.name AS name, child.category AS category, child.responsibility AS responsibility
         ORDER BY child.name ASC`,
        { name: entityName },
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        category: (r.get('category') as string) ?? 'unknown',
        responsibility: (r.get('responsibility') as string) ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  async getAncestors(entityName: string): Promise<Array<{ name: string; depth: number; responsibility: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (ancestor:Entity)-[:CONTAINS*]->(target:Entity {name: $name})
         UNWIND nodes(path) AS n
         WITH DISTINCT n
         WHERE n.name <> $name
         RETURN n.name AS name, n.depth AS depth, n.responsibility AS responsibility
         ORDER BY n.depth ASC`,
        { name: entityName },
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        depth: toNum(r.get('depth')),
        responsibility: (r.get('responsibility') as string) ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  async findStale(): Promise<Array<{ name: string; last_indexed_at: string | null }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Entity {stale: true})
         RETURN e.name AS name, e.last_indexed_at AS lastIndexed
         ORDER BY e.name ASC`,
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        last_indexed_at: r.get('lastIndexed') as string | null,
      }));
    } finally {
      await session.close();
    }
  }

  async getFullEntity(entityName: string): Promise<Record<string, unknown> | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (e:Entity {name: $name}) RETURN e',
        { name: entityName },
      );
      if (result.records.length === 0) return null;
      return result.records[0].get('e').properties as Record<string, unknown>;
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
