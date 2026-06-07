// packages/neo4j/src/blocks.ts
import { type Driver } from 'neo4j-driver';
import type { MemoryBlock, MemoryTier } from '@memberry/core';
import { tenantWhere, resolveTenant, TENANT_PARAM } from './tenant.js';

export class BlockStore {
  constructor(private driver: Driver) {}

  async save(block: MemoryBlock, tenantId?: string): Promise<void> {
    const session = this.driver.session();
    try {
      const tenant = resolveTenant(tenantId);
      // Session-scoped blocks (working tier) include session_id in the MERGE key
      // to prevent cross-session overwrites. Core blocks use scope+name only.
      // tenant_id is part of the MERGE key so a block is unique per
      // scope+name+tenant[+session] — different tenants get distinct nodes.
      const mergeKey = block.session_id
        ? '{scope: $scope, name: $name, session_id: $session_id, tenant_id: $tenantId}'
        : '{scope: $scope, name: $name, tenant_id: $tenantId}';

      await session.run(
        `MERGE (b:MemoryBlock ${mergeKey})
         SET b.id = $id,
             b.tier = $tier,
             b.content = $content,
             b.agent_id = $agent_id,
             b.session_id = $session_id,
             b.max_tokens = $max_tokens,
             b.tenant_id = $tenantId,
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
          [TENANT_PARAM]: tenant,
          created_at: block.created_at,
          updated_at: block.updated_at,
        },
      );
    } finally {
      await session.close();
    }
  }

  async get(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock | null> {
    const session = this.driver.session();
    try {
      const tenant = resolveTenant(tenantId);
      const conditions: string[] = [tenantWhere('b', tenant)];
      const params: Record<string, unknown> = { scope, name, [TENANT_PARAM]: tenant };
      if (sessionId) {
        conditions.push('b.session_id = $sessionId');
        params.sessionId = sessionId;
      }
      const query = `MATCH (b:MemoryBlock {scope: $scope, name: $name}) WHERE ${conditions.join(' AND ')} RETURN b`;
      const result = await session.run(query, params);
      if (result.records.length === 0) return null;
      const props = result.records[0].get('b').properties as Record<string, unknown>;
      return toMemoryBlock(props);
    } finally {
      await session.close();
    }
  }

  async list(scope: string, tier?: MemoryTier, sessionId?: string, tenantId?: string): Promise<MemoryBlock[]> {
    const session = this.driver.session();
    try {
      const tenant = resolveTenant(tenantId);
      const conditions: string[] = [tenantWhere('b', tenant)];
      const params: Record<string, unknown> = { scope, [TENANT_PARAM]: tenant };
      if (tier) {
        conditions.push('b.tier = $tier');
        params.tier = tier;
      }
      if (sessionId) {
        conditions.push('b.session_id = $sessionId');
        params.sessionId = sessionId;
      }
      const query =
        `MATCH (b:MemoryBlock {scope: $scope}) WHERE ${conditions.join(' AND ')} RETURN b ORDER BY b.name`;
      const result = await session.run(query, params);
      return result.records.map((r) => toMemoryBlock(r.get('b').properties as Record<string, unknown>));
    } finally {
      await session.close();
    }
  }

  async delete(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<void> {
    const session = this.driver.session();
    try {
      const tenant = resolveTenant(tenantId);
      const conditions: string[] = [tenantWhere('b', tenant)];
      const params: Record<string, unknown> = { scope, name, [TENANT_PARAM]: tenant };
      if (sessionId) {
        conditions.push('b.session_id = $sessionId');
        params.sessionId = sessionId;
      } else {
        conditions.push('b.session_id IS NULL');
      }
      const query =
        `MATCH (b:MemoryBlock {scope: $scope, name: $name}) WHERE ${conditions.join(' AND ')} DETACH DELETE b`;
      await session.run(query, params);
    } finally {
      await session.close();
    }
  }
}

function toMemoryBlock(props: Record<string, unknown>): MemoryBlock {
  const now = new Date().toISOString();
  return {
    id: (props.id as string) ?? '',
    name: (props.name as string) ?? '',
    tier: (props.tier as MemoryTier) ?? 'core',
    content: (props.content as string) ?? '',
    scope: (props.scope as string) ?? '',
    ...(props.agent_id != null && { agent_id: props.agent_id as string }),
    ...(props.session_id != null && { session_id: props.session_id as string }),
    ...(props.max_tokens != null && { max_tokens: props.max_tokens as number }),
    created_at: (props.created_at as string) ?? now,
    updated_at: (props.updated_at as string) ?? now,
  };
}
