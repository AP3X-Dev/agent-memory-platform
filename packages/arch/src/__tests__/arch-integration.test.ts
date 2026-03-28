// packages/arch/src/__tests__/arch-integration.test.ts
// Integration tests for arch package — requires running Neo4j.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDriver, cleanTestData, closeDriver, NEO4J_AVAILABLE } from './neo4j-helper.js';
import { initArchSchema } from '../schema.js';
import { ArchEntityStore } from '../entity-store.js';
import { AspectStore } from '../aspect-store.js';
import { StructuralRelationStore } from '../relation-store.js';
import { ImpactAnalyzer } from '../impact.js';
import { ArchContextBuilder } from '../context.js';
import type { Driver } from 'neo4j-driver';

let driver: Driver;
let entities: ArchEntityStore;
let aspects: AspectStore;
let relations: StructuralRelationStore;
let impact: ImpactAnalyzer;
let context: ArchContextBuilder;

beforeAll(async () => {
  const d = await getDriver();
  if (!d) return;
  driver = d;
  await initArchSchema(driver);

  // Seed test entities
  const session = driver.session();
  try {
    await cleanTestData(driver, '_TestEntity');
    await cleanTestData(driver, '_TestAspect');
    await session.run(`
      CREATE (proj:Entity:_TestEntity {id: 'test-proj', name: 'test-project', type: 'project', created_at: datetime()})
      CREATE (mod:Entity:_TestEntity {id: 'test-mod', name: 'test-module', type: 'module', created_at: datetime()})
      CREATE (svc:Entity:_TestEntity {id: 'test-svc', name: 'test-service', type: 'service', created_at: datetime()})
      CREATE (proj)-[:CONTAINS]->(mod)
      CREATE (mod)-[:CONTAINS]->(svc)
    `);
  } finally {
    await session.close();
  }

  entities = new ArchEntityStore(driver);
  aspects = new AspectStore(driver);
  relations = new StructuralRelationStore(driver);
  impact = new ImpactAnalyzer(driver);
  context = new ArchContextBuilder(driver);
});

afterAll(async () => {
  if (driver) {
    await cleanTestData(driver, '_TestEntity');
    await cleanTestData(driver, '_TestAspect');
  }
  await closeDriver();
});

describe.runIf(NEO4J_AVAILABLE)('ArchEntityStore', () => {
  it('sets and retrieves arch properties', async () => {
    const updated = await entities.setArchProperties('test-module', {
      category: 'module',
      depth: 1,
      responsibility: 'Handles core business logic',
      interface_desc: 'Exports processOrder(), validateInput()',
      internals: 'Uses strategy pattern for validation',
    });
    expect(updated).toBe(true);

    const full = await entities.getFullEntity('test-module');
    expect(full).toBeDefined();
    expect(full!.responsibility).toBe('Handles core business logic');
    expect(full!.category).toBe('module');
    expect(full!.depth).toBe(1);
  });

  it('gets children of an entity', async () => {
    const children = await entities.getChildren('test-project');
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.some((c) => c.name === 'test-module')).toBe(true);
  });

  it('gets ancestors of an entity', async () => {
    const ancestors = await entities.getAncestors('test-service');
    expect(ancestors.length).toBeGreaterThanOrEqual(1);
    expect(ancestors.some((a) => a.name === 'test-module')).toBe(true);
  });
});

describe.runIf(NEO4J_AVAILABLE)('AspectStore', () => {
  it('creates and retrieves an aspect', async () => {
    const id = await aspects.create({
      name: 'test-rate-limiting',
      description: 'All public endpoints must be rate-limited',
      stability_tier: 'protocol',
      implies: ['test-logging'],
    });
    expect(id).toBeDefined();

    const aspect = await aspects.getByName('test-rate-limiting');
    expect(aspect).toBeDefined();
    expect(aspect!.stability_tier).toBe('protocol');
    expect(aspect!.implies).toContain('test-logging');
  });

  it('applies aspect to entity and retrieves effective aspects', async () => {
    await aspects.applyTo('test-rate-limiting', 'test-service');
    const effective = await aspects.getEffectiveAspects('test-service');
    expect(effective.some((a) => a.name === 'test-rate-limiting')).toBe(true);
  });
});

describe.runIf(NEO4J_AVAILABLE)('StructuralRelationStore', () => {
  it('creates typed relation between entities', async () => {
    const created = await relations.create('test-service', 'test-module', 'USES', { consumes: 'processOrder' });
    expect(created).toBe(true);
  });

  it('queries dependencies', async () => {
    const deps = await relations.getDependencies('test-service');
    expect(deps.some((d) => d.name === 'test-module' && d.relation === 'USES')).toBe(true);
  });

  it('queries dependents', async () => {
    const dependents = await relations.getDependents('test-module');
    expect(dependents.some((d) => d.name === 'test-service' && d.relation === 'USES')).toBe(true);
  });
});

describe.runIf(NEO4J_AVAILABLE)('ImpactAnalyzer', () => {
  it('computes blast radius', async () => {
    const result = await impact.blastRadius('test-module');
    expect(result.entity).toBe('test-module');
    expect(result.direct_dependents).toContain('test-service');
    expect(result.change_risk).toBeDefined();
  });
});

describe.runIf(NEO4J_AVAILABLE)('ArchContextBuilder', () => {
  it('builds deterministic context', async () => {
    const md = await context.renderMarkdown('test-module');
    expect(md).toContain('test-module');
    expect(md).toContain('Handles core business logic');
  });
});
