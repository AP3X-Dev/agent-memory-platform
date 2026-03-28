// packages/arch/src/schema.ts
// Additive Neo4j schema for architectural graph elements.

import { type Driver } from 'neo4j-driver';

const ARCH_CONSTRAINTS: string[] = [
  'CREATE CONSTRAINT aspect_id IF NOT EXISTS FOR (a:Aspect) REQUIRE a.id IS UNIQUE',
  'CREATE CONSTRAINT aspect_name IF NOT EXISTS FOR (a:Aspect) REQUIRE a.name IS UNIQUE',
];

const ARCH_INDEXES: string[] = [
  'CREATE INDEX entity_category IF NOT EXISTS FOR (e:Entity) ON (e.category)',
  'CREATE INDEX entity_depth IF NOT EXISTS FOR (e:Entity) ON (e.depth)',
  'CREATE INDEX entity_stale IF NOT EXISTS FOR (e:Entity) ON (e.stale)',
  'CREATE INDEX aspect_stability IF NOT EXISTS FOR (a:Aspect) ON (a.stability_tier)',
];

const ARCH_FULLTEXT: string[] = [
  'CREATE FULLTEXT INDEX entity_arch_content IF NOT EXISTS FOR (e:Entity) ON EACH [e.responsibility, e.interface_desc, e.internals]',
  'CREATE FULLTEXT INDEX entity_name_search IF NOT EXISTS FOR (e:Entity) ON EACH [e.name, e.description]',
  'CREATE FULLTEXT INDEX aspect_content IF NOT EXISTS FOR (a:Aspect) ON EACH [a.name, a.description]',
];

export async function initArchSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const stmt of [...ARCH_CONSTRAINTS, ...ARCH_INDEXES, ...ARCH_FULLTEXT]) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}
