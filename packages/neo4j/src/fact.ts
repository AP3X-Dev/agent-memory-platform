// packages/neo4j/src/fact.ts
import { type Driver } from 'neo4j-driver';
import { nanoid } from 'nanoid';
import type { FactNode, FactTimeline, FactDiff, TemporalOptions } from '@amp/core';

export class FactStore {
  constructor(private driver: Driver) {}

  async create(fact: FactNode): Promise<string> {
    const session = this.driver.session();
    try {
      // Create the Fact node
      await session.run(
        `CREATE (f:Fact {
          id: $id,
          subject: $subject,
          predicate: $predicate,
          object: $object,
          source_episode_ids: $source_episode_ids,
          valid_at: $valid_at,
          invalid_at: $invalid_at,
          confidence: $confidence,
          status: $status,
          supersedes_fact_id: $supersedes_fact_id,
          scope: $scope,
          tags: $tags,
          created_at: $created_at,
          updated_at: $updated_at
        })`,
        {
          id: fact.id,
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          source_episode_ids: fact.source_episode_ids,
          valid_at: fact.valid_at,
          invalid_at: fact.invalid_at,
          confidence: fact.confidence,
          status: fact.status,
          supersedes_fact_id: fact.supersedes_fact_id,
          scope: fact.scope,
          tags: fact.tags,
          created_at: fact.created_at,
          updated_at: fact.updated_at,
        },
      );

      // Set embedding if provided
      if (fact.embedding) {
        await session.run(
          `MATCH (f:Fact {id: $id}) SET f.embedding = $embedding`,
          { id: fact.id, embedding: fact.embedding },
        );
      }

      // Link SOURCED_FROM → Episodic for each source episode
      for (const episodeId of fact.source_episode_ids) {
        await session.run(
          `MATCH (f:Fact {id: $factId}), (e:Episodic {id: $episodeId})
           MERGE (f)-[:SOURCED_FROM]->(e)`,
          { factId: fact.id, episodeId },
        );
      }

      // Link FACT_ABOUT → Entity (MERGE on subject name)
      await session.run(
        `MATCH (f:Fact {id: $factId})
         MERGE (e:Entity {name: $subject})
         ON CREATE SET e.id = $entityId, e.type = 'concept', e.created_at = $now
         MERGE (f)-[:FACT_ABOUT]->(e)`,
        {
          factId: fact.id,
          subject: fact.subject,
          entityId: `ent-${nanoid(12)}`,
          now: new Date().toISOString(),
        },
      );

      // Link SUPERSEDES → old Fact if supersedes_fact_id is set
      if (fact.supersedes_fact_id) {
        await session.run(
          `MATCH (newF:Fact {id: $newId}), (oldF:Fact {id: $oldId})
           MERGE (newF)-[:SUPERSEDES_FACT]->(oldF)`,
          { newId: fact.id, oldId: fact.supersedes_fact_id },
        );
      }

      return fact.id;
    } finally {
      await session.close();
    }
  }

  async getById(id: string): Promise<FactNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (f:Fact {id: $id}) RETURN f',
        { id },
      );
      if (result.records.length === 0) return null;
      return mapFactNode(result.records[0].get('f').properties);
    } finally {
      await session.close();
    }
  }

  async getActive(entityName: string, options?: TemporalOptions): Promise<FactNode[]> {
    const session = this.driver.session();
    try {
      const timeMode = options?.time_mode ?? 'current';
      let cypher: string;
      const params: Record<string, unknown> = { entityName };

      switch (timeMode) {
        case 'current':
          // Active facts with no invalidation date
          cypher = `
            MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
            WHERE f.status = 'active' AND f.invalid_at IS NULL
            RETURN f
            ORDER BY f.valid_at DESC`;
          break;

        case 'historical':
          // Facts valid at a specific point in time
          params.as_of = options?.as_of ?? new Date().toISOString();
          cypher = `
            MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
            WHERE f.valid_at <= $as_of AND (f.invalid_at IS NULL OR f.invalid_at > $as_of)
            RETURN f
            ORDER BY f.valid_at DESC`;
          break;

        case 'interval':
          // Facts active during an interval
          params.from = options?.from ?? '1970-01-01T00:00:00.000Z';
          params.to = options?.to ?? new Date().toISOString();
          cypher = `
            MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
            WHERE f.valid_at <= $to AND (f.invalid_at IS NULL OR f.invalid_at > $from)
            RETURN f
            ORDER BY f.valid_at DESC`;
          break;

        case 'evolution':
          // All facts, ordered chronologically, optionally including invalidated
          if (options?.include_invalidated) {
            cypher = `
              MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
              RETURN f
              ORDER BY f.valid_at ASC`;
          } else {
            cypher = `
              MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
              WHERE f.status <> 'invalidated'
              RETURN f
              ORDER BY f.valid_at ASC`;
          }
          break;

        default: {
          const _exhaustive: never = timeMode;
          throw new Error(`Unknown time_mode: ${String(_exhaustive)}`);
        }
      }

      const result = await session.run(cypher, params);
      return result.records.map((r) => mapFactNode(r.get('f').properties));
    } finally {
      await session.close();
    }
  }

  async invalidate(id: string, invalidAt: string, supersededById?: string): Promise<void> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      await session.run(
        `MATCH (f:Fact {id: $id})
         SET f.status = 'invalidated', f.invalid_at = $invalidAt, f.updated_at = $now`,
        { id, invalidAt, now },
      );

      if (supersededById) {
        await session.run(
          `MATCH (newF:Fact {id: $newId}), (oldF:Fact {id: $oldId})
           MERGE (newF)-[:SUPERSEDES_FACT]->(oldF)`,
          { newId: supersededById, oldId: id },
        );
      }
    } finally {
      await session.close();
    }
  }

  async dispute(id: string): Promise<void> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      await session.run(
        `MATCH (f:Fact {id: $id})
         SET f.status = 'disputed', f.updated_at = $now`,
        { id, now },
      );
    } finally {
      await session.close();
    }
  }

  async timeline(entityName: string): Promise<FactTimeline> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
         RETURN f
         ORDER BY f.valid_at ASC`,
        { entityName },
      );

      const facts = result.records.map((r) => {
        const fact = mapFactNode(r.get('f').properties);
        let event: 'created' | 'invalidated' | 'disputed' | 'superseded';
        let at: string;

        if (fact.status === 'invalidated') {
          event = fact.supersedes_fact_id ? 'superseded' : 'invalidated';
          at = fact.invalid_at ?? fact.updated_at;
        } else if (fact.status === 'disputed') {
          event = 'disputed';
          at = fact.updated_at;
        } else {
          event = 'created';
          at = fact.valid_at;
        }

        return { ...fact, event, at };
      });

      return { entity: entityName, facts };
    } finally {
      await session.close();
    }
  }

  async diff(entityName: string, from: string, to: string): Promise<FactDiff> {
    const session = this.driver.session();
    try {
      // Facts active at 'from' timestamp
      const fromResult = await session.run(
        `MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
         WHERE f.valid_at <= $from AND (f.invalid_at IS NULL OR f.invalid_at > $from)
         RETURN f`,
        { entityName, from },
      );
      const fromFacts = fromResult.records.map((r) => mapFactNode(r.get('f').properties));

      // Facts active at 'to' timestamp
      const toResult = await session.run(
        `MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $entityName})
         WHERE f.valid_at <= $to AND (f.invalid_at IS NULL OR f.invalid_at > $to)
         RETURN f`,
        { entityName, to },
      );
      const toFacts = toResult.records.map((r) => mapFactNode(r.get('f').properties));

      const fromIds = new Set(fromFacts.map((f) => f.id));
      const toIds = new Set(toFacts.map((f) => f.id));

      // Added: in 'to' but not in 'from'
      const added = toFacts.filter((f) => !fromIds.has(f.id));

      // Invalidated: in 'from' but not in 'to'
      const invalidated = fromFacts.filter((f) => !toIds.has(f.id));

      // Changed: facts that supersede other facts — find pairs
      const changed: Array<{ before: FactNode; after: FactNode }> = [];
      for (const addedFact of added) {
        if (addedFact.supersedes_fact_id) {
          const beforeFact = invalidated.find((f) => f.id === addedFact.supersedes_fact_id);
          if (beforeFact) {
            changed.push({ before: beforeFact, after: addedFact });
          }
        }
      }

      // Remove changed items from added/invalidated to avoid double-counting
      const changedBeforeIds = new Set(changed.map((c) => c.before.id));
      const changedAfterIds = new Set(changed.map((c) => c.after.id));

      return {
        entity: entityName,
        from,
        to,
        added: added.filter((f) => !changedAfterIds.has(f.id)),
        invalidated: invalidated.filter((f) => !changedBeforeIds.has(f.id)),
        changed,
      };
    } finally {
      await session.close();
    }
  }

  async findBySubjectPredicate(subject: string, predicate: string): Promise<FactNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (f:Fact)
         WHERE f.subject = $subject AND f.predicate = $predicate AND f.status = 'active'
         RETURN f
         ORDER BY f.valid_at DESC`,
        { subject, predicate },
      );
      return result.records.map((r) => mapFactNode(r.get('f').properties));
    } finally {
      await session.close();
    }
  }

  async setEmbedding(id: string, embedding: number[]): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (f:Fact {id: $id}) SET f.embedding = $embedding`,
        { id, embedding },
      );
    } finally {
      await session.close();
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapFactNode(props: Record<string, unknown>): FactNode {
  return {
    id: props.id as string,
    subject: props.subject as string,
    predicate: props.predicate as string,
    object: props.object as string,
    source_episode_ids: (props.source_episode_ids as string[]) ?? [],
    valid_at: props.valid_at as string,
    invalid_at: (props.invalid_at as string) ?? null,
    confidence: props.confidence as number,
    status: props.status as FactNode['status'],
    supersedes_fact_id: (props.supersedes_fact_id as string) ?? null,
    scope: props.scope as FactNode['scope'],
    tags: (props.tags as string[]) ?? [],
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
    ...(props.embedding != null && { embedding: props.embedding as number[] }),
  };
}
