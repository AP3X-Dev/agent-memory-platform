// packages/arch/src/context.ts
// Deterministic 5-step architectural context assembly.
// Inspired by Yggdrasil: same graph state always produces same output.

import { type Driver } from 'neo4j-driver';
import type { ArchContext } from './types.js';
import { ArchEntityStore } from './entity-store.js';
import { AspectStore } from './aspect-store.js';
import { StructuralRelationStore } from './relation-store.js';

export class ArchContextBuilder {
  private entities: ArchEntityStore;
  private aspects: AspectStore;
  private relations: StructuralRelationStore;

  constructor(private driver: Driver) {
    this.entities = new ArchEntityStore(driver);
    this.aspects = new AspectStore(driver);
    this.relations = new StructuralRelationStore(driver);
  }

  /**
   * Deterministic 5-step context assembly for an entity.
   *
   * 1. Target entity identification
   * 2. Hierarchy walk (ancestors for domain context)
   * 3. Dependency expansion (typed structural relations)
   * 4. Aspect overlay (cross-cutting concerns)
   * 5. Token budgeting (fill from most-specific to least-specific)
   *
   * @param entityName  The entity to build context for
   * @param maxTokens   Token budget
   * @param asOf        Optional ISO timestamp — only traverse relationships active at this time
   */
  async build(entityName: string, maxTokens = 6000, asOf?: string): Promise<ArchContext> {
    // Step 1: Target entity
    const entity = await this.entities.getFullEntity(entityName);
    if (!entity) {
      return {
        target: { name: entityName, category: 'unknown', responsibility: 'Entity not found' },
        hierarchy: [],
        dependencies: [],
        dependents: [],
        aspects: [],
        token_count: 0,
      };
    }

    const target = {
      name: entityName,
      category: (entity.category as string) ?? (entity.type as string) ?? 'unknown',
      responsibility: (entity.responsibility as string) ?? '',
    };

    // Step 2: Hierarchy walk
    const ancestors = await this.entities.getAncestors(entityName);

    // Step 3: Dependency expansion (filter by temporal validity)
    const dependencies = await this.relations.getDependencies(entityName, asOf);
    const dependents = await this.relations.getDependents(entityName, asOf);

    // Step 4: Aspect overlay
    const effectiveAspects = await this.aspects.getEffectiveAspects(entityName);
    const aspectEntries = effectiveAspects.map((a) => ({
      name: a.name,
      stability_tier: a.stability_tier,
      description: a.description,
    }));

    // Step 5: Token budgeting — estimate and truncate if needed
    const ctx: ArchContext = {
      target,
      hierarchy: ancestors,
      dependencies,
      dependents: dependents.map((d) => ({ name: d.name, relation: d.relation })),
      aspects: aspectEntries,
      token_count: 0,
    };

    ctx.token_count = estimateTokens(ctx);

    // If over budget, trim from least-specific: dependents first, then transitive deps, then aspects
    if (ctx.token_count > maxTokens) {
      ctx.dependents = ctx.dependents.slice(0, 10);
      ctx.token_count = estimateTokens(ctx);
    }
    if (ctx.token_count > maxTokens) {
      ctx.dependencies = ctx.dependencies.slice(0, 10);
      ctx.token_count = estimateTokens(ctx);
    }

    return ctx;
  }

  /**
   * Render context as markdown.
   */
  async renderMarkdown(entityName: string, maxTokens = 6000, asOf?: string): Promise<string> {
    const ctx = await this.build(entityName, maxTokens, asOf);
    const lines: string[] = [];

    // Target
    lines.push(`# ${ctx.target.name} (${ctx.target.category})`);
    lines.push('');
    if (ctx.target.responsibility) {
      lines.push(`## Responsibility`);
      lines.push(ctx.target.responsibility);
      lines.push('');
    }

    // Get full entity for interface/internals
    const full = await this.entities.getFullEntity(entityName);
    if (full?.interface_desc) {
      lines.push('## Interface');
      lines.push(full.interface_desc as string);
      lines.push('');
    }
    if (full?.internals) {
      lines.push('## Internals');
      lines.push(full.internals as string);
      lines.push('');
    }

    // Hierarchy
    if (ctx.hierarchy.length > 0) {
      lines.push('## Hierarchy');
      for (const h of ctx.hierarchy) {
        lines.push(`${'  '.repeat(h.depth)}${h.name}: ${h.responsibility}`);
      }
      lines.push('');
    }

    // Dependencies
    if (ctx.dependencies.length > 0) {
      lines.push('## Dependencies');
      for (const d of ctx.dependencies) {
        const iface = d.interface_desc ? ` — ${d.interface_desc.slice(0, 100)}` : '';
        lines.push(`- **${d.relation}** → ${d.name}${iface}`);
      }
      lines.push('');
    }

    // Dependents
    if (ctx.dependents.length > 0) {
      lines.push('## Dependents (what breaks if this changes)');
      for (const d of ctx.dependents) {
        lines.push(`- ${d.name} (${d.relation})`);
      }
      lines.push('');
    }

    // Aspects
    if (ctx.aspects.length > 0) {
      lines.push('## Cross-Cutting Concerns');
      for (const a of ctx.aspects) {
        lines.push(`- **${a.name}** [${a.stability_tier}]: ${a.description}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

function estimateTokens(ctx: ArchContext): number {
  const json = JSON.stringify(ctx);
  return Math.ceil(json.length / 4);
}
