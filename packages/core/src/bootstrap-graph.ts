// packages/core/src/bootstrap-graph.ts
// Seeds the Neo4j graph with foundational nodes for a project.
// This solves the chicken-and-egg problem: without Entity/Agent/Semantic nodes,
// episodic memories are orphaned islands with no relationships.

import { type Driver } from 'neo4j-driver';
import { nanoid } from 'nanoid';

// ─── Input types ─────────────────────────────────────────────────────────────

export interface BootstrapEntity {
  name: string;
  type: 'project' | 'module' | 'service' | 'component' | 'team' | 'person' | 'tool' | string;
  description?: string;
  /** Parent entity name — creates a CONTAINS relationship */
  parent?: string;
}

export interface BootstrapSemantic {
  claim: string;
  domain: string;
  confidence?: number;
  /** Entity names this principle is ABOUT */
  about?: string[];
  tags?: string[];
}

export interface BootstrapAgent {
  id: string;
  name: string;
  type: 'assistant' | 'sentinel' | 'fixer' | 'researcher' | string;
}

export interface BootstrapInput {
  project_name: string;
  project_tag: string;
  description: string;
  domain: string;
  entities: BootstrapEntity[];
  semantic_seeds: BootstrapSemantic[];
  agents: BootstrapAgent[];
}

export interface BootstrapResult {
  entities_created: number;
  entities_existing: number;
  agents_created: number;
  agents_existing: number;
  semantics_created: number;
  relationships_created: number;
  project_entity_id: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class BootstrapGraphService {
  constructor(private driver: Driver) {}

  /**
   * Seed the graph with foundational nodes for a project.
   * Idempotent — MERGE prevents duplicates. Safe to run multiple times.
   */
  async bootstrap(input: BootstrapInput): Promise<BootstrapResult> {
    const result: BootstrapResult = {
      entities_created: 0,
      entities_existing: 0,
      agents_created: 0,
      agents_existing: 0,
      semantics_created: 0,
      relationships_created: 0,
      project_entity_id: '',
    };

    const session = this.driver.session();
    try {
      // 1. Create the project entity (always first)
      const projectId = await this.mergeEntity(session, {
        name: input.project_name,
        type: 'project',
        description: input.description,
      }, result);
      result.project_entity_id = projectId;

      // 2. Create all entities
      for (const entity of input.entities) {
        const entityId = await this.mergeEntity(session, entity, result);

        // Link to project (all entities belong to the project)
        if (entity.type !== 'project') {
          await this.mergeRelationship(session, projectId, entityId, 'CONTAINS', result);
        }

        // Link to parent if specified
        if (entity.parent) {
          const parentResult = await session.run(
            'MATCH (e:Entity {name: $parent}) RETURN e.id AS id',
            { parent: entity.parent },
          );
          if (parentResult.records.length > 0) {
            const parentId = parentResult.records[0].get('id') as string;
            await this.mergeRelationship(session, parentId, entityId, 'CONTAINS', result);
          }
        }
      }

      // 3. Create agents
      for (const agent of input.agents) {
        await this.mergeAgent(session, agent, result);
      }

      // 4. Create semantic seeds
      for (const seed of input.semantic_seeds) {
        const semId = await this.createSemantic(session, seed, input.project_tag, result);

        // Link ABOUT relationships to named entities
        for (const entityName of seed.about ?? []) {
          const entityResult = await session.run(
            'MATCH (e:Entity {name: $name}) RETURN e.id AS id',
            { name: entityName },
          );
          if (entityResult.records.length > 0) {
            const entityId = entityResult.records[0].get('id') as string;
            await session.run(
              `MATCH (s:Semantic {id: $semId}), (e:Entity {id: $entityId})
               MERGE (s)-[:ABOUT]->(e)`,
              { semId, entityId },
            );
            result.relationships_created++;
          }
        }
      }

      // 5. Link all existing orphaned Episodic nodes for this project to the project entity
      const orphanResult = await session.run(
        `MATCH (ep:Episodic)
         WHERE ep.task CONTAINS $tag
           AND NOT (ep)-[:REFERENCES]->(:Entity {name: $projectName})
         WITH ep
         MATCH (proj:Entity {name: $projectName})
         CREATE (ep)-[:REFERENCES]->(proj)
         RETURN count(ep) AS linked`,
        { tag: input.project_tag, projectName: input.project_name },
      );
      const linked = orphanResult.records[0]?.get('linked');
      if (linked) {
        const count = typeof linked === 'number' ? linked : (linked as { toNumber(): number }).toNumber();
        result.relationships_created += count;
      }

      return result;
    } finally {
      await session.close();
    }
  }

  /**
   * Check if a project has been bootstrapped.
   */
  async isBootstrapped(projectName: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (e:Entity {name: $name, type: "project"}) RETURN count(e) AS count',
        { name: projectName },
      );
      const count = result.records[0]?.get('count');
      return (typeof count === 'number' ? count : (count as { toNumber(): number }).toNumber()) > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Get bootstrap status for a project — what nodes and relationships exist.
   */
  async status(projectName: string): Promise<{
    bootstrapped: boolean;
    entities: number;
    agents: number;
    semantics: number;
    episodics: number;
    relationships: number;
  }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `OPTIONAL MATCH (proj:Entity {name: $name, type: 'project'})
         WITH proj
         OPTIONAL MATCH (proj)<-[:CONTAINS*0..]-(e:Entity)
         WITH proj, count(DISTINCT e) AS entityCount
         OPTIONAL MATCH (a:Agent)
         WITH proj, entityCount, count(a) AS agentCount
         OPTIONAL MATCH (s:Semantic)
         WITH proj, entityCount, agentCount, count(s) AS semCount
         OPTIONAL MATCH (ep:Episodic)
         WITH proj, entityCount, agentCount, semCount, count(ep) AS epCount
         OPTIONAL MATCH ()-[r]->()
         RETURN proj IS NOT NULL AS bootstrapped,
                entityCount, agentCount, semCount, epCount, count(r) AS relCount`,
        { name: projectName },
      );
      const r = result.records[0];
      const toNum = (v: unknown) => {
        if (typeof v === 'number') return v;
        if (v && typeof v === 'object' && 'toNumber' in v) return (v as { toNumber(): number }).toNumber();
        return 0;
      };
      return {
        bootstrapped: r.get('bootstrapped') as boolean,
        entities: toNum(r.get('entityCount')),
        agents: toNum(r.get('agentCount')),
        semantics: toNum(r.get('semCount')),
        episodics: toNum(r.get('epCount')),
        relationships: toNum(r.get('relCount')),
      };
    } finally {
      await session.close();
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async mergeEntity(
    session: ReturnType<Driver['session']>,
    entity: BootstrapEntity,
    result: BootstrapResult,
  ): Promise<string> {
    const res = await session.run(
      `MERGE (e:Entity {name: $name})
       ON CREATE SET e.id = $id, e.type = $type, e.description = $description, e.created_at = $now
       ON MATCH SET e.description = CASE WHEN $description IS NOT NULL THEN $description ELSE e.description END
       RETURN e.id AS id, e.created_at = $now AS isNew`,
      {
        name: entity.name,
        id: nanoid(),
        type: entity.type,
        description: entity.description ?? null,
        now: new Date().toISOString(),
      },
    );
    const isNew = res.records[0].get('isNew') as boolean;
    if (isNew) result.entities_created++;
    else result.entities_existing++;
    return res.records[0].get('id') as string;
  }

  private async mergeAgent(
    session: ReturnType<Driver['session']>,
    agent: BootstrapAgent,
    result: BootstrapResult,
  ): Promise<void> {
    const res = await session.run(
      `MERGE (a:Agent {id: $id})
       ON CREATE SET a.name = $name, a.type = $type, a.created_at = $now
       RETURN a.created_at = $now AS isNew`,
      { id: agent.id, name: agent.name, type: agent.type, now: new Date().toISOString() },
    );
    const isNew = res.records[0].get('isNew') as boolean;
    if (isNew) result.agents_created++;
    else result.agents_existing++;
  }

  private async createSemantic(
    session: ReturnType<Driver['session']>,
    seed: BootstrapSemantic,
    projectTag: string,
    result: BootstrapResult,
  ): Promise<string> {
    const id = `sem-${nanoid(10)}`;
    const now = new Date().toISOString();
    const tags = [projectTag, seed.domain, ...(seed.tags ?? [])];

    await session.run(
      `CREATE (s:Semantic {
        id: $id,
        content: $content,
        confidence: $confidence,
        signal_count: 0,
        created_at: $now,
        updated_at: $now,
        decay_class: 'stable',
        tags: $tags
      })`,
      {
        id,
        content: seed.claim,
        confidence: seed.confidence ?? 0.3,
        now,
        tags,
      },
    );
    result.semantics_created++;
    return id;
  }

  private async mergeRelationship(
    session: ReturnType<Driver['session']>,
    fromId: string,
    toId: string,
    relType: string,
    result: BootstrapResult,
  ): Promise<void> {
    // Relationship types can't be parameterized in Cypher
    await session.run(
      `MATCH (a:Entity {id: $fromId}), (b:Entity {id: $toId})
       MERGE (a)-[:${relType}]->(b)`,
      { fromId, toId },
    );
    result.relationships_created++;
  }
}
