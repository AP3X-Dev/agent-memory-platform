// packages/arch/src/__tests__/project-scope.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ArchEntityStore } from '../entity-store.js';
import { StructuralRelationStore } from '../relation-store.js';
import { AspectStore } from '../aspect-store.js';

function makeDriver() {
  const runs: Array<{ query: string; params?: Record<string, unknown> }> = [];
  const session = {
    run: vi.fn(async (query: string, params?: Record<string, unknown>) => {
      runs.push({ query, params });
      return { records: [] };
    }),
    close: vi.fn(),
  };

  return {
    driver: { session: () => session } as never,
    runs,
  };
}

describe('architecture project scoping regressions', () => {
  it('scopes full entity lookup to the requested project containment tree', async () => {
    const { driver, runs } = makeDriver();
    const store = new ArchEntityStore(driver);

    await store.getFullEntity('AuthService', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });

  it('scopes architecture dependencies to the requested project containment tree', async () => {
    const { driver, runs } = makeDriver();
    const store = new StructuralRelationStore(driver);

    await store.getDependencies('AuthService', undefined, 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });

  it('scopes effective aspects to the requested project containment tree', async () => {
    const { driver, runs } = makeDriver();
    const store = new AspectStore(driver);

    await store.getEffectiveAspects('AuthService', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });

  it('scopes aspect application to the requested project containment tree', async () => {
    const { driver, runs } = makeDriver();
    const store = new AspectStore(driver);

    await store.applyTo('audit-logging', 'AuthService', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });

  it('scopes aspect removal to the requested project containment tree', async () => {
    const { driver, runs } = makeDriver();
    const store = new AspectStore(driver);

    await store.removeFrom('audit-logging', 'AuthService', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });

  it('scopes aspect entity listing to the requested project containment tree', async () => {
    const { driver, runs } = makeDriver();
    const store = new AspectStore(driver);

    await store.getEntitiesForAspect('audit-logging', 'project:AMP');

    expect(runs[0].params?.projectName).toBe('AMP');
    expect(runs[0].query).toContain('$projectName IS NULL');
    expect(runs[0].query).toContain('CONTAINS*0..');
  });
});
