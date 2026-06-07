// packages/neo4j/src/semantic.ts
import { type Driver } from 'neo4j-driver';
import type { SemanticNode } from '@memberry/core';
import { temporalSetClause } from './temporal-edges.js';

export class SemanticStore {
  constructor(private driver: Driver) {}

  async create(node: SemanticNode & { embedding?: number[] }): Promise<string> {
    const session = this.driver.session();
    try {
      const query = `
        CREATE (s:Semantic {
          id: $id,
          content: $content,
          confidence: $confidence,
          signal_count: $signal_count,
          created_at: $created_at,
          updated_at: $updated_at,
          decay_class: $decay_class,
          tags: $tags
        })
        ${node.embedding ? 'SET s.embedding = $embedding' : ''}
        RETURN s.id AS id
      `;
      const params: Record<string, unknown> = {
        id: node.id,
        content: node.content,
        confidence: node.confidence,
        signal_count: node.signal_count,
        created_at: node.created_at,
        updated_at: node.updated_at,
        decay_class: node.decay_class,
        tags: node.tags,
      };
      if (node.embedding) {
        params.embedding = node.embedding;
      }
      const result = await session.run(query, params);
      return result.records[0].get('id') as string;
    } finally {
      await session.close();
    }
  }

  async getById(id: string): Promise<SemanticNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (s:Semantic {id: $id}) RETURN s',
        { id }
      );
      if (result.records.length === 0) return null;
      const props = result.records[0].get('s').properties as Record<string, unknown>;
      return {
        id: props.id as string,
        content: props.content as string,
        confidence: props.confidence as number,
        signal_count: props.signal_count as number,
        created_at: props.created_at as string,
        updated_at: props.updated_at as string,
        decay_class: props.decay_class as SemanticNode['decay_class'],
        tags: props.tags as string[],
        ...(props.embedding !== undefined && { embedding: props.embedding as number[] }),
      };
    } finally {
      await session.close();
    }
  }

  async updateConfidence(id: string, confidence: number): Promise<void> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      await session.run(
        'MATCH (s:Semantic {id: $id}) SET s.confidence = $confidence, s.updated_at = $now',
        { id, confidence, now }
      );
    } finally {
      await session.close();
    }
  }

  async supersede(oldId: string, newNode: SemanticNode): Promise<string> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      const query = `
        CREATE (new:Semantic {
          id: $id,
          content: $content,
          confidence: $confidence,
          signal_count: $signal_count,
          created_at: $created_at,
          updated_at: $updated_at,
          decay_class: $decay_class,
          tags: $tags
        })
        WITH new
        MATCH (old:Semantic {id: $oldId})
        CREATE (new)-[:SUPERSEDES]->(old)
        WITH new, old
        // Invalidate the old node's ABOUT relationships
        OPTIONAL MATCH (old)-[oldR:ABOUT]->(e:Entity)
        WHERE oldR.invalid_at IS NULL
        SET oldR.invalid_at = $now
        RETURN new.id AS id
      `;
      const result = await session.run(query, {
        id: newNode.id,
        content: newNode.content,
        confidence: newNode.confidence,
        signal_count: newNode.signal_count,
        created_at: newNode.created_at,
        updated_at: newNode.updated_at,
        decay_class: newNode.decay_class,
        tags: newNode.tags,
        oldId,
        now,
      });
      return result.records[0].get('id') as string;
    } finally {
      await session.close();
    }
  }

  async promoteFromEpisodic(episodicId: string, newNode: SemanticNode): Promise<string> {
    const session = this.driver.session();
    try {
      const query = `
        CREATE (s:Semantic {
          id: $id,
          content: $content,
          confidence: $confidence,
          signal_count: $signal_count,
          created_at: $created_at,
          updated_at: $updated_at,
          decay_class: $decay_class,
          tags: $tags
        })
        WITH s
        MATCH (ep:Episodic {id: $episodicId})
        CREATE (s)-[:PROMOTED_FROM]->(ep)
        RETURN s.id AS id
      `;
      const result = await session.run(query, {
        id: newNode.id,
        content: newNode.content,
        confidence: newNode.confidence,
        signal_count: newNode.signal_count,
        created_at: newNode.created_at,
        updated_at: newNode.updated_at,
        decay_class: newNode.decay_class,
        tags: newNode.tags,
        episodicId,
      });
      return result.records[0].get('id') as string;
    } finally {
      await session.close();
    }
  }

  async linkToEntity(semanticId: string, entityId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (s:Semantic {id: $semanticId}), (e:Entity {id: $entityId})
         MERGE (s)-[r:ABOUT]->(e)
         ${temporalSetClause('r')}`,
        { semanticId, entityId, now: new Date().toISOString() }
      );
    } finally {
      await session.close();
    }
  }
}
