// packages/arch/src/impact.ts
// Blast radius analysis: what breaks if I change this entity?

import { type Driver } from 'neo4j-driver';
import type { ImpactResult } from './types.js';
import { activeRelationshipFilter } from '@amp/neo4j';

export class ImpactAnalyzer {
  constructor(private driver: Driver) {}

  /**
   * Compute full blast radius for an entity.
   * Traverses structural relations, co-aspect membership, and containment.
   */
  /**
   * Compute full blast radius for an entity.
   * Traverses structural relations, co-aspect membership, and containment.
   *
   * @param entityName  Entity to analyze
   * @param asOf        Optional ISO timestamp — only traverse relationships active at this time
   */
  async blastRadius(entityName: string, asOf?: string): Promise<ImpactResult> {
    const session = this.driver.session();
    try {
      const filter = activeRelationshipFilter('r', asOf ? 'asOf' : undefined);
      const params: Record<string, unknown> = { name: entityName };
      if (asOf) params.asOf = asOf;

      // Direct dependents (1 hop)
      const directResult = await session.run(
        `MATCH (dep:Entity)-[r]->(target:Entity {name: $name})
         WHERE type(r) IN ['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'LISTENS']
           AND ${filter}
         RETURN DISTINCT dep.name AS name`,
        params,
      );
      const directDependents = directResult.records.map((r) => r.get('name') as string);

      // Transitive dependents (up to 5 hops)
      // For transitive traversal, filter each hop's relationship
      const transitiveResult = await session.run(
        `MATCH path = (dep:Entity)-[:USES|CALLS|EXTENDS|IMPLEMENTS|LISTENS*2..5]->(target:Entity {name: $name})
         WHERE dep.name <> $name
           AND ALL(r IN relationships(path) WHERE ${activeRelationshipFilter('r', asOf ? 'asOf' : undefined)})
         RETURN DISTINCT dep.name AS name`,
        params,
      );
      const transitiveDependents = transitiveResult.records
        .map((r) => r.get('name') as string)
        .filter((n) => !directDependents.includes(n));

      // Co-aspect entities (share at least one aspect)
      const coAspectResult = await session.run(
        `MATCH (a:Aspect)-[:APPLIES_TO]->(target:Entity {name: $name})
         MATCH (a)-[:APPLIES_TO]->(co:Entity)
         WHERE co.name <> $name
         RETURN DISTINCT co.name AS name`,
        { name: entityName },
      );
      const coAspectEntities = coAspectResult.records.map((r) => r.get('name') as string);

      // Affected aspects
      const aspectResult = await session.run(
        `MATCH (a:Aspect)-[:APPLIES_TO]->(e:Entity {name: $name})
         RETURN a.name AS name, a.stability_tier AS tier`,
        { name: entityName },
      );
      const affectedAspects = aspectResult.records.map((r) => r.get('name') as string);
      const tiers = aspectResult.records.map((r) => r.get('tier') as string);

      // Compute risk
      const totalBlast = directDependents.length + transitiveDependents.length + coAspectEntities.length;
      const hasSchemaAspect = tiers.includes('schema');
      const hasProtocolAspect = tiers.includes('protocol');

      let changeRisk: ImpactResult['change_risk'] = 'low';
      if (hasSchemaAspect || totalBlast > 20) changeRisk = 'critical';
      else if (hasProtocolAspect || totalBlast > 10) changeRisk = 'high';
      else if (totalBlast > 3) changeRisk = 'medium';

      return {
        entity: entityName,
        direct_dependents: directDependents,
        transitive_dependents: transitiveDependents,
        co_aspect_entities: coAspectEntities,
        affected_aspects: affectedAspects,
        total_blast_radius: totalBlast,
        change_risk: changeRisk,
      };
    } finally {
      await session.close();
    }
  }
}
