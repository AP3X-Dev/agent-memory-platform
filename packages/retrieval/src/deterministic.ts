// packages/retrieval/src/deterministic.ts
// Yggdrasil-inspired 5-step deterministic context assembly.
// Same graph state always produces the same output — no ranking heuristics.

import { type Driver } from 'neo4j-driver';
import type { RetrievalResult, ContextSection, ContextItem } from './types.js';

/**
 * Deterministic context assembly.
 *
 * Unlike ranked retrieval, this algorithm is fully reproducible:
 * same graph state → same output, every time.
 *
 * 5 steps:
 * 1. Identify target entities (from task description keywords matched against entity names)
 * 2. Walk hierarchy (ancestors provide domain context)
 * 3. Expand dependencies (typed structural relations)
 * 4. Overlay aspects (cross-cutting concerns)
 * 5. Include semantic memories scoped to target entities
 *
 * Token budgeting fills from most-specific to least-specific.
 */
export class DeterministicAssembler {
  constructor(private driver: Driver) {}

  async assemble(
    task: string,
    options?: { entity_scope?: string[]; project_name?: string; max_tokens?: number; as_of?: string },
  ): Promise<ContextSection[]> {
    const maxTokens = options?.max_tokens ?? 8000;
    const asOf = options?.as_of;
    const sections: ContextSection[] = [];
    let tokenBudget = maxTokens;

    // Step 1: Identify target entities
    const targets = options?.entity_scope?.length
      ? options.entity_scope
      : await this.matchEntities(task);

    if (targets.length === 0) {
      sections.push({
        heading: 'No matching entities found',
        source_type: 'arch_entity',
        items: [{ id: 'none', content: `No entities matched task: "${task}"`, score: 0, metadata: {} }],
      });
      return sections;
    }

    // Step 2: Hierarchy walk — ancestors provide domain context
    const hierarchyItems: ContextItem[] = [];
    for (const target of targets) {
      const ancestors = await this.getAncestors(target);
      for (const a of ancestors) {
        hierarchyItems.push({
          id: `hier-${a.name}`,
          content: `**${a.name}** (depth ${a.depth}): ${a.responsibility}`,
          score: 1 - (a.depth * 0.1), // Higher = closer to root = less specific
          metadata: { depth: a.depth },
        });
      }
    }
    if (hierarchyItems.length > 0) {
      const section = budgetSection('Domain Hierarchy', 'arch_entity', hierarchyItems, tokenBudget);
      sections.push(section.section);
      tokenBudget -= section.tokens;
    }

    // Step 3: Target entities with full properties
    const targetItems: ContextItem[] = [];
    for (const target of targets) {
      const entity = await this.getEntity(target);
      if (entity) {
        const parts: string[] = [`# ${entity.name} (${entity.category})`];
        if (entity.responsibility) parts.push(`**Responsibility:** ${entity.responsibility}`);
        if (entity.interface_desc) parts.push(`**Interface:** ${entity.interface_desc}`);
        if (entity.internals) parts.push(`**Internals:** ${entity.internals}`);
        targetItems.push({
          id: `target-${entity.name}`,
          content: parts.join('\n'),
          score: 1.0,
          metadata: { category: entity.category },
        });
      }
    }
    if (targetItems.length > 0) {
      const section = budgetSection('Target Components', 'arch_entity', targetItems, tokenBudget);
      sections.push(section.section);
      tokenBudget -= section.tokens;
    }

    // Step 4: Dependencies — what targets depend on
    const depItems: ContextItem[] = [];
    for (const target of targets) {
      const deps = await this.getDependencies(target);
      for (const d of deps) {
        depItems.push({
          id: `dep-${target}-${d.name}`,
          content: `**${target}** —[${d.relation}]→ **${d.name}**: ${d.interface_desc}`,
          score: 0.8,
          metadata: { relation: d.relation },
        });
      }
      const dependents = await this.getDependents(target);
      for (const d of dependents) {
        depItems.push({
          id: `dnt-${d.name}-${target}`,
          content: `**${d.name}** —[${d.relation}]→ **${target}** (dependent)`,
          score: 0.6,
          metadata: { relation: d.relation, direction: 'dependent' },
        });
      }
    }
    if (depItems.length > 0) {
      const section = budgetSection('Dependencies & Dependents', 'arch_entity', depItems, tokenBudget);
      sections.push(section.section);
      tokenBudget -= section.tokens;
    }

    // Step 5: Aspects — cross-cutting concerns
    const aspectItems: ContextItem[] = [];
    for (const target of targets) {
      const aspects = await this.getAspects(target);
      for (const a of aspects) {
        aspectItems.push({
          id: `aspect-${a.name}`,
          content: `**${a.name}** [${a.stability_tier}]: ${a.description}`,
          score: a.stability_tier === 'schema' ? 0.9 : a.stability_tier === 'protocol' ? 0.7 : 0.5,
          metadata: { stability_tier: a.stability_tier },
        });
      }
    }
    if (aspectItems.length > 0) {
      const section = budgetSection('Cross-Cutting Concerns', 'aspect', aspectItems, tokenBudget);
      sections.push(section.section);
      tokenBudget -= section.tokens;
    }

    // Step 6: Semantic memories scoped to target entities
    const semanticItems: ContextItem[] = [];
    for (const target of targets) {
      const memories = await this.getScopedSemantics(target, asOf);
      for (const m of memories) {
        semanticItems.push({
          id: m.id,
          content: m.content,
          score: m.confidence,
          metadata: { confidence: m.confidence, tags: m.tags },
        });
      }
    }
    if (semanticItems.length > 0) {
      const section = budgetSection('Semantic Knowledge', 'semantic', semanticItems, tokenBudget);
      sections.push(section.section);
      tokenBudget -= section.tokens;
    }

    return sections;
  }

  // ─── Private graph queries ──────────────────────────────────────────────

  private async matchEntities(task: string): Promise<string[]> {
    const session = this.driver.session();
    try {
      // Try fulltext search first (fast, uses index), fall back to CONTAINS
      const escaped = task
          .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')
          .replace(/\b(AND|OR|NOT|TO)\b/g, '"$1"');
      try {
        const ftResult = await session.run(
          `CALL db.index.fulltext.queryNodes('entity_name_search', $query)
           YIELD node, score
           RETURN node.name AS name
           ORDER BY score DESC LIMIT 5`,
          { query: escaped.split(/\s+/).filter((w) => w.length > 2).join(' ') || escaped },
        );
        if (ftResult.records.length > 0) {
          return ftResult.records.map((r) => r.get('name') as string);
        }
      } catch (err: unknown) {
        // Fulltext index may not exist yet — fall through
      }

      // Fallback: keyword CONTAINS match
      const words = task.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      if (words.length === 0) return [];

      const result = await session.run(
        `MATCH (e:Entity)
         WHERE ANY(word IN $words WHERE toLower(e.name) CONTAINS word)
           OR ANY(word IN $words WHERE toLower(COALESCE(e.responsibility, '')) CONTAINS word)
         RETURN e.name AS name
         ORDER BY size(e.name) DESC
         LIMIT 5`,
        { words },
      );
      return result.records.map((r) => r.get('name') as string);
    } finally {
      await session.close();
    }
  }

  private async getAncestors(entityName: string): Promise<Array<{ name: string; depth: number; responsibility: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (ancestor:Entity)-[:CONTAINS*]->(target:Entity {name: $name})
         UNWIND nodes(path) AS n
         WITH DISTINCT n WHERE n.name <> $name
         RETURN n.name AS name, COALESCE(n.depth, 0) AS depth, COALESCE(n.responsibility, '') AS responsibility
         ORDER BY depth ASC`,
        { name: entityName },
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        depth: toNum(r.get('depth')),
        responsibility: r.get('responsibility') as string,
      }));
    } finally {
      await session.close();
    }
  }

  private async getEntity(name: string): Promise<{
    name: string; category: string; responsibility: string; interface_desc: string; internals: string;
  } | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (e:Entity {name: $name}) RETURN e',
        { name },
      );
      if (result.records.length === 0) return null;
      const props = result.records[0].get('e').properties as Record<string, unknown>;
      return {
        name: props.name as string,
        category: (props.category as string) ?? (props.type as string) ?? 'unknown',
        responsibility: (props.responsibility as string) ?? '',
        interface_desc: (props.interface_desc as string) ?? '',
        internals: (props.internals as string) ?? '',
      };
    } finally {
      await session.close();
    }
  }

  private async getDependencies(entityName: string): Promise<Array<{ name: string; relation: string; interface_desc: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Entity {name: $name})-[r]->(dep:Entity)
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'EMITS']
         RETURN dep.name AS name, type(r) AS relation, COALESCE(dep.interface_desc, '') AS interface_desc
         ORDER BY dep.name ASC`,
        { name: entityName },
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

  private async getDependents(entityName: string): Promise<Array<{ name: string; relation: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (dep:Entity)-[r]->(e:Entity {name: $name})
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'LISTENS']
         RETURN dep.name AS name, type(r) AS relation
         ORDER BY dep.name ASC`,
        { name: entityName },
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        relation: r.get('relation') as string,
      }));
    } finally {
      await session.close();
    }
  }

  private async getAspects(entityName: string): Promise<Array<{ name: string; stability_tier: string; description: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (a:Aspect)-[:APPLIES_TO]->(e:Entity {name: $name})
         RETURN a.name AS name, a.stability_tier AS stability_tier, a.description AS description
         UNION
         MATCH (ancestor:Entity)-[:CONTAINS*]->(e:Entity {name: $name})
         MATCH (a:Aspect)-[:APPLIES_TO]->(ancestor)
         RETURN DISTINCT a.name AS name, a.stability_tier AS stability_tier, a.description AS description`,
        { name: entityName },
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        stability_tier: (r.get('stability_tier') as string) ?? 'implementation',
        description: (r.get('description') as string) ?? '',
      }));
    } finally {
      await session.close();
    }
  }

  private async getScopedSemantics(entityName: string, asOf?: string): Promise<Array<{ id: string; content: string; confidence: number; tags: string[] }>> {
    const session = this.driver.session();
    try {
      // When as_of is provided, filter to semantics created before that timestamp
      const temporalFilter = asOf ? ' AND s.created_at <= $asOf' : '';
      const result = await session.run(
        `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $name})
         WHERE true${temporalFilter}
         RETURN s.id AS id, s.content AS content, s.confidence AS confidence, s.tags AS tags
         ORDER BY s.confidence DESC
         LIMIT 10`,
        { name: entityName, ...(asOf ? { asOf } : {}) },
      );
      return result.records.map((r) => ({
        id: r.get('id') as string,
        content: r.get('content') as string,
        confidence: r.get('confidence') as number,
        tags: (r.get('tags') as string[]) ?? [],
      }));
    } finally {
      await session.close();
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function budgetSection(
  heading: string,
  sourceType: ContextSection['source_type'],
  items: ContextItem[],
  remainingTokens: number,
): { section: ContextSection; tokens: number } {
  const budgeted: ContextItem[] = [];
  let tokens = 0;

  // Sort by score descending — most relevant first
  const sorted = [...items].sort((a, b) => b.score - a.score);

  for (const item of sorted) {
    const itemTokens = Math.ceil(item.content.length / 4);
    if (tokens + itemTokens > remainingTokens) break;
    budgeted.push(item);
    tokens += itemTokens;
  }

  return {
    section: { heading, source_type: sourceType, items: budgeted },
    tokens,
  };
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}
