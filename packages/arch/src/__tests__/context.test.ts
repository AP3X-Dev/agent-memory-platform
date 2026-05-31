// packages/arch/src/__tests__/context.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchContextBuilder } from '../context.js';

// ─── Mock the sub-stores so we test context assembly logic, not Neo4j queries ─

vi.mock('../entity-store.js', () => ({
  ArchEntityStore: vi.fn().mockImplementation(() => ({
    getFullEntity: vi.fn(),
    getAncestors: vi.fn(),
  })),
}));

vi.mock('../aspect-store.js', () => ({
  AspectStore: vi.fn().mockImplementation(() => ({
    getEffectiveAspects: vi.fn(),
  })),
}));

vi.mock('../relation-store.js', () => ({
  StructuralRelationStore: vi.fn().mockImplementation(() => ({
    getDependencies: vi.fn(),
    getDependents: vi.fn(),
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MockEntityStore {
  getFullEntity: ReturnType<typeof vi.fn>;
  getAncestors: ReturnType<typeof vi.fn>;
}

interface MockAspectStore {
  getEffectiveAspects: ReturnType<typeof vi.fn>;
}

interface MockRelationStore {
  getDependencies: ReturnType<typeof vi.fn>;
  getDependents: ReturnType<typeof vi.fn>;
}

function createBuilder(): {
  builder: ArchContextBuilder;
  entityStore: MockEntityStore;
  aspectStore: MockAspectStore;
  relationStore: MockRelationStore;
} {
  const mockDriver = {} as never;
  const builder = new ArchContextBuilder(mockDriver);

  // Access the mocked instances via the builder's private fields
  const entityStore = (builder as unknown as { entities: MockEntityStore }).entities;
  const aspectStore = (builder as unknown as { aspects: MockAspectStore }).aspects;
  const relationStore = (builder as unknown as { relations: MockRelationStore }).relations;

  return { builder, entityStore, aspectStore, relationStore };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ArchContextBuilder', () => {
  describe('build', () => {
    it('returns not-found context when entity does not exist', async () => {
      const { builder, entityStore } = createBuilder();
      entityStore.getFullEntity.mockResolvedValue(null);

      const ctx = await builder.build('NonExistent');

      expect(ctx.target.name).toBe('NonExistent');
      expect(ctx.target.category).toBe('unknown');
      expect(ctx.target.responsibility).toBe('Entity not found');
      expect(ctx.hierarchy).toEqual([]);
      expect(ctx.dependencies).toEqual([]);
      expect(ctx.dependents).toEqual([]);
      expect(ctx.aspects).toEqual([]);
      expect(ctx.token_count).toBe(0);
    });

    it('assembles full context from all sub-stores', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({
        name: 'AuthService',
        category: 'service',
        responsibility: 'Handles authentication',
        interface_desc: 'JWT-based auth',
        internals: 'Uses bcrypt for hashing',
      });
      entityStore.getAncestors.mockResolvedValue([
        { name: 'Platform', depth: 0, responsibility: 'Top-level platform' },
        { name: 'Security', depth: 1, responsibility: 'Security domain' },
      ]);
      relationStore.getDependencies.mockResolvedValue([
        { name: 'UserStore', relation: 'USES', interface_desc: 'CRUD for users' },
      ]);
      relationStore.getDependents.mockResolvedValue([
        { name: 'APIGateway', relation: 'CALLS' },
      ]);
      aspectStore.getEffectiveAspects.mockResolvedValue([
        { name: 'auth-protocol', stability_tier: 'protocol', description: 'JWT auth protocol' },
      ]);

      const ctx = await builder.build('AuthService');

      expect(ctx.target.name).toBe('AuthService');
      expect(ctx.target.category).toBe('service');
      expect(ctx.target.responsibility).toBe('Handles authentication');
      expect(ctx.hierarchy).toHaveLength(2);
      expect(ctx.hierarchy[0].name).toBe('Platform');
      expect(ctx.dependencies).toHaveLength(1);
      expect(ctx.dependencies[0].name).toBe('UserStore');
      expect(ctx.dependents).toHaveLength(1);
      expect(ctx.dependents[0]).toEqual({ name: 'APIGateway', relation: 'CALLS' });
      expect(ctx.aspects).toHaveLength(1);
      expect(ctx.aspects[0].name).toBe('auth-protocol');
      expect(ctx.token_count).toBeGreaterThan(0);
    });

    it('uses type as fallback when category is missing', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({
        name: 'Utils',
        type: 'library',
        // no category
      });
      entityStore.getAncestors.mockResolvedValue([]);
      relationStore.getDependencies.mockResolvedValue([]);
      relationStore.getDependents.mockResolvedValue([]);
      aspectStore.getEffectiveAspects.mockResolvedValue([]);

      const ctx = await builder.build('Utils');

      expect(ctx.target.category).toBe('library');
    });

    it('falls back to "unknown" when both category and type are missing', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({ name: 'Mystery' });
      entityStore.getAncestors.mockResolvedValue([]);
      relationStore.getDependencies.mockResolvedValue([]);
      relationStore.getDependents.mockResolvedValue([]);
      aspectStore.getEffectiveAspects.mockResolvedValue([]);

      const ctx = await builder.build('Mystery');

      expect(ctx.target.category).toBe('unknown');
      expect(ctx.target.responsibility).toBe('');
    });

    it('passes asOf to dependency queries', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({ name: 'Svc', category: 'service' });
      entityStore.getAncestors.mockResolvedValue([]);
      relationStore.getDependencies.mockResolvedValue([]);
      relationStore.getDependents.mockResolvedValue([]);
      aspectStore.getEffectiveAspects.mockResolvedValue([]);

      const asOf = '2025-06-01T00:00:00Z';
      await builder.build('Svc', 6000, asOf);

      expect(relationStore.getDependencies).toHaveBeenCalledWith('Svc', asOf, undefined);
      expect(relationStore.getDependents).toHaveBeenCalledWith('Svc', asOf, undefined);
    });

    it('normalizes and forwards project scope to all architecture context sub-stores', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({ name: 'AuthService', category: 'service' });
      entityStore.getAncestors.mockResolvedValue([]);
      relationStore.getDependencies.mockResolvedValue([]);
      relationStore.getDependents.mockResolvedValue([]);
      aspectStore.getEffectiveAspects.mockResolvedValue([]);

      await builder.build('AuthService', 6000, undefined, 'project:AMP');

      expect(entityStore.getFullEntity).toHaveBeenCalledWith('AuthService', 'AMP');
      expect(entityStore.getAncestors).toHaveBeenCalledWith('AuthService', 'AMP');
      expect(relationStore.getDependencies).toHaveBeenCalledWith('AuthService', undefined, 'AMP');
      expect(relationStore.getDependents).toHaveBeenCalledWith('AuthService', undefined, 'AMP');
      expect(aspectStore.getEffectiveAspects).toHaveBeenCalledWith('AuthService', 'AMP');
    });

    // ─── Token budgeting ────────────────────────────────────────────────

    describe('token budgeting', () => {
      it('truncates dependents first when over budget', async () => {
        const { builder, entityStore, aspectStore, relationStore } = createBuilder();

        entityStore.getFullEntity.mockResolvedValue({
          name: 'BigEntity',
          category: 'service',
          responsibility: 'A'.repeat(200),
        });
        entityStore.getAncestors.mockResolvedValue([]);
        relationStore.getDependencies.mockResolvedValue([]);
        // 50 dependents — will be large
        const manyDependents = Array.from({ length: 50 }, (_, i) => ({
          name: `dep-${i}`,
          relation: 'CALLS',
        }));
        relationStore.getDependents.mockResolvedValue(manyDependents);
        aspectStore.getEffectiveAspects.mockResolvedValue([]);

        // Very small token budget to force truncation
        const ctx = await builder.build('BigEntity', 100);

        // Dependents should be trimmed to at most 10
        expect(ctx.dependents.length).toBeLessThanOrEqual(10);
      });

      it('truncates dependencies when dependents alone are not enough', async () => {
        const { builder, entityStore, aspectStore, relationStore } = createBuilder();

        entityStore.getFullEntity.mockResolvedValue({
          name: 'BigEntity',
          category: 'service',
          responsibility: 'A'.repeat(200),
        });
        entityStore.getAncestors.mockResolvedValue([]);
        // Many dependencies
        const manyDeps = Array.from({ length: 50 }, (_, i) => ({
          name: `dep-${i}`,
          relation: 'USES',
          interface_desc: 'A'.repeat(100),
        }));
        relationStore.getDependencies.mockResolvedValue(manyDeps);
        const manyDependents = Array.from({ length: 50 }, (_, i) => ({
          name: `dnt-${i}`,
          relation: 'CALLS',
        }));
        relationStore.getDependents.mockResolvedValue(manyDependents);
        aspectStore.getEffectiveAspects.mockResolvedValue([]);

        // Very small budget
        const ctx = await builder.build('BigEntity', 50);

        expect(ctx.dependents.length).toBeLessThanOrEqual(10);
        expect(ctx.dependencies.length).toBeLessThanOrEqual(10);
      });

      it('continues trimming removable sections until the context fits the token budget', async () => {
        const { builder, entityStore, aspectStore, relationStore } = createBuilder();

        entityStore.getFullEntity.mockResolvedValue({
          name: 'BudgetedEntity',
          category: 'service',
          responsibility: 'Small target responsibility',
        });
        entityStore.getAncestors.mockResolvedValue([]);
        relationStore.getDependents.mockResolvedValue([]);
        relationStore.getDependencies.mockResolvedValue(
          Array.from({ length: 12 }, (_, i) => ({
            name: `dep-${i}`,
            relation: 'USES',
            interface_desc: 'A'.repeat(200),
          })),
        );
        aspectStore.getEffectiveAspects.mockResolvedValue([]);

        const ctx = await builder.build('BudgetedEntity', 120);

        expect(ctx.token_count).toBeLessThanOrEqual(120);
        expect(ctx.dependencies.length).toBeLessThan(10);
      });
    });
  });

  describe('renderMarkdown', () => {
    it('renders markdown with all sections', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({
        name: 'MyService',
        category: 'service',
        responsibility: 'Does stuff',
        interface_desc: 'REST API',
        internals: 'Uses PostgreSQL',
      });
      entityStore.getAncestors.mockResolvedValue([
        { name: 'Root', depth: 0, responsibility: 'Root domain' },
      ]);
      relationStore.getDependencies.mockResolvedValue([
        { name: 'Database', relation: 'USES', interface_desc: 'SQL queries' },
      ]);
      relationStore.getDependents.mockResolvedValue([
        { name: 'Frontend', relation: 'CALLS' },
      ]);
      aspectStore.getEffectiveAspects.mockResolvedValue([
        { name: 'logging', stability_tier: 'implementation', description: 'Structured logging' },
      ]);

      const md = await builder.renderMarkdown('MyService');

      expect(md).toContain('# MyService (service)');
      expect(md).toContain('## Responsibility');
      expect(md).toContain('Does stuff');
      expect(md).toContain('## Interface');
      expect(md).toContain('REST API');
      expect(md).toContain('## Internals');
      expect(md).toContain('Uses PostgreSQL');
      expect(md).toContain('## Hierarchy');
      expect(md).toContain('Root: Root domain');
      expect(md).toContain('## Dependencies');
      expect(md).toContain('**USES**');
      expect(md).toContain('Database');
      expect(md).toContain('## Dependents (what breaks if this changes)');
      expect(md).toContain('Frontend (CALLS)');
      expect(md).toContain('## Cross-Cutting Concerns');
      expect(md).toContain('**logging** [implementation]');
    });

    it('omits sections that have no data', async () => {
      const { builder, entityStore, aspectStore, relationStore } = createBuilder();

      entityStore.getFullEntity.mockResolvedValue({
        name: 'Minimal',
        category: 'component',
        // no responsibility, interface_desc, internals
      });
      entityStore.getAncestors.mockResolvedValue([]);
      relationStore.getDependencies.mockResolvedValue([]);
      relationStore.getDependents.mockResolvedValue([]);
      aspectStore.getEffectiveAspects.mockResolvedValue([]);

      const md = await builder.renderMarkdown('Minimal');

      expect(md).toContain('# Minimal (component)');
      expect(md).not.toContain('## Responsibility');
      expect(md).not.toContain('## Interface');
      expect(md).not.toContain('## Internals');
      expect(md).not.toContain('## Hierarchy');
      expect(md).not.toContain('## Dependencies');
      expect(md).not.toContain('## Dependents');
      expect(md).not.toContain('## Cross-Cutting Concerns');
    });

    it('renders entity not found markdown for missing entity', async () => {
      const { builder, entityStore } = createBuilder();
      entityStore.getFullEntity.mockResolvedValue(null);

      const md = await builder.renderMarkdown('Ghost');

      expect(md).toContain('# Ghost (unknown)');
    });
  });
});
