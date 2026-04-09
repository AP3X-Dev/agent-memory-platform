// packages/neo4j/src/blocks.ts
import { type Driver } from 'neo4j-driver';
import type { MemoryBlock, MemoryTier } from '@amp/core';

export class BlockStore {
  constructor(private driver: Driver) {}

  async save(block: MemoryBlock): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MERGE (b:MemoryBlock {scope: $scope, name: $name})
         SET b.id = $id,
             b.tier = $tier,
             b.content = $content,
             b.agent_id = $agent_id,
             b.session_id = $session_id,
             b.max_tokens = $max_tokens,
             b.created_at = $created_at,
             b.updated_at = $updated_at`,
        {
          scope: block.scope,
          name: block.name,
          id: block.id,
          tier: block.tier,
          content: block.content,
          agent_id: block.agent_id ?? null,
          session_id: block.session_id ?? null,
          max_tokens: block.max_tokens ?? null,
          created_at: block.created_at,
          updated_at: block.updated_at,
        },
      );
    } finally {
      await session.close();
    }
  }

  async get(scope: string, name: string): Promise<MemoryBlock | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (b:MemoryBlock {scope: $scope, name: $name}) RETURN b',
        { scope, name },
      );
      if (result.records.length === 0) return null;
      const props = result.records[0].get('b').properties as Record<string, unknown>;
      return toMemoryBlock(props);
    } finally {
      await session.close();
    }
  }

  async list(scope: string, tier?: MemoryTier): Promise<MemoryBlock[]> {
    const session = this.driver.session();
    try {
      const query = tier
        ? 'MATCH (b:MemoryBlock {scope: $scope, tier: $tier}) RETURN b ORDER BY b.name'
        : 'MATCH (b:MemoryBlock {scope: $scope}) RETURN b ORDER BY b.name';
      const params: Record<string, unknown> = { scope };
      if (tier) params.tier = tier;
      const result = await session.run(query, params);
      return result.records.map((r) => toMemoryBlock(r.get('b').properties as Record<string, unknown>));
    } finally {
      await session.close();
    }
  }

  async delete(scope: string, name: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        'MATCH (b:MemoryBlock {scope: $scope, name: $name}) DETACH DELETE b',
        { scope, name },
      );
    } finally {
      await session.close();
    }
  }
}

function toMemoryBlock(props: Record<string, unknown>): MemoryBlock {
  return {
    id: props.id as string,
    name: props.name as string,
    tier: props.tier as MemoryTier,
    content: props.content as string,
    scope: props.scope as string,
    ...(props.agent_id != null && { agent_id: props.agent_id as string }),
    ...(props.session_id != null && { session_id: props.session_id as string }),
    ...(props.max_tokens != null && { max_tokens: props.max_tokens as number }),
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
  };
}
