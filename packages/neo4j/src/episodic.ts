// packages/neo4j/src/episodic.ts
import { type Driver } from 'neo4j-driver';
import type { EpisodicNode, Signal } from '@memberry/core';
import { temporalSetClause } from './temporal-edges.js';

export class EpisodicStore {
  constructor(private driver: Driver) {}

  async create(node: EpisodicNode): Promise<string> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `CREATE (e:Episodic {
          id: $id,
          session_id: $session_id,
          agent_id: $agent_id,
          task: $task,
          content: $content,
          outcome: $outcome,
          created_at: $created_at,
          ttl: $ttl,
          scope: $scope,
          tags: $tags
        }) RETURN e.id AS id`,
        {
          id: node.id,
          session_id: node.session_id,
          agent_id: node.agent_id,
          task: node.task,
          content: node.content,
          outcome: node.outcome ?? null,
          created_at: node.created_at,
          ttl: node.ttl ?? null,
          scope: node.scope ?? null,
          tags: node.tags ?? [],
        },
      );

      if (node.embedding) {
        await session.run(
          `MATCH (e:Episodic {id: $id}) SET e.embedding = $embedding`,
          { id: node.id, embedding: node.embedding },
        );
      }

      return result.records[0].get('id') as string;
    } finally {
      await session.close();
    }
  }

  async getById(id: string): Promise<EpisodicNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Episodic {id: $id}) RETURN e`,
        { id },
      );

      if (result.records.length === 0) {
        return null;
      }

      const props = result.records[0].get('e').properties as Record<string, unknown>;
      return {
        id: props.id as string,
        session_id: props.session_id as string,
        agent_id: props.agent_id as string,
        task: props.task as string,
        content: props.content as string,
        outcome: props.outcome as EpisodicNode['outcome'] ?? undefined,
        created_at: props.created_at as string,
        ttl: props.ttl != null ? (props.ttl as number) : undefined,
        embedding: props.embedding != null ? (props.embedding as number[]) : undefined,
        scope: props.scope != null ? (props.scope as string) : undefined,
        tags: props.tags != null ? (props.tags as string[]) : undefined,
      };
    } finally {
      await session.close();
    }
  }

  async linkToAgent(episodicId: string, agentId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (e:Episodic {id: $episodicId}), (a:Agent {id: $agentId})
         MERGE (e)-[:GENERATED_BY]->(a)`,
        { episodicId, agentId },
      );
    } finally {
      await session.close();
    }
  }

  async linkToEntity(episodicId: string, entityId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (e:Episodic {id: $episodicId}), (ent:Entity {id: $entityId})
         MERGE (e)-[r:REFERENCES]->(ent)
         ${temporalSetClause('r')}`,
        { episodicId, entityId, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }

  async linkToModel(episodicId: string, modelId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (e:Episodic {id: $episodicId}), (m:Model {id: $modelId})
         MERGE (e)-[:USED_MODEL]->(m)`,
        { episodicId, modelId },
      );
    } finally {
      await session.close();
    }
  }

  async linkSignal(episodicId: string, signal: Signal): Promise<void> {
    const relTypeMap: Record<Signal['type'], string> = {
      reinforcement: 'REINFORCES',
      correction: 'CORRECTS',
      contradiction: 'CONTRADICTS',
    };
    const relType = relTypeMap[signal.type];
    if (!relType) {
      throw new Error(`Unrecognised signal type: ${String(signal.type)}`);
    }

    const session = this.driver.session();
    try {
      // Relationship types cannot be parameterized in Cypher, so build dynamically
      await session.run(
        `MATCH (e:Episodic {id: $episodicId}), (s:Semantic {id: $targetId})
         MERGE (e)-[r:${relType}]->(s)
         SET r.detail = $detail
         ${temporalSetClause('r')}`,
        { episodicId, targetId: signal.target_id, detail: signal.detail, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }
}
