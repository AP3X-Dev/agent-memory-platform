// packages/redis/src/blocks.ts
import type { Redis } from 'ioredis';
import type { MemoryBlock, MemoryTier } from '@memberry/core';

const WORKING_TTL = 86400; // 24 hours

function keyFor(scope: string, name: string, sessionId?: string, tenantId?: string): string {
  const tenant = tenantId || 'default';
  if (sessionId) {
    return `amp:block:${tenant}:${scope}:${sessionId}:${name}`;
  }
  return `amp:block:${tenant}:${scope}:${name}`;
}

export class BlockStore {
  constructor(private redis: Redis) {}

  async get(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<MemoryBlock | null> {
    const raw = await this.redis.get(keyFor(scope, name, sessionId, tenantId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MemoryBlock;
    } catch (err) {
      console.error(`[BlockStore] Failed to parse block ${scope}:${name}:`, err);
      return null;
    }
  }

  async set(block: MemoryBlock, tenantId?: string): Promise<void> {
    const tenant = tenantId || block.tenant_id || 'default';
    const key = keyFor(block.scope, block.name, block.session_id, tenant);
    const json = JSON.stringify(block);
    if (block.tier === 'working') {
      await this.redis.setex(key, WORKING_TTL, json);
    } else {
      await this.redis.set(key, json);
    }
  }

  async list(scope: string, tier?: MemoryTier, sessionId?: string, tenantId?: string): Promise<MemoryBlock[]> {
    const tenant = tenantId || 'default';
    const pattern = `amp:block:${tenant}:${scope}:*`;
    const blocks: MemoryBlock[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.get(key);
        }
        const results = await pipeline.exec();
        if (results) {
          for (const [err, raw] of results) {
            if (err || !raw) continue;
            let block: MemoryBlock;
            try {
              block = JSON.parse(raw as string) as MemoryBlock;
            } catch (parseErr) {
              console.error(`[BlockStore] Failed to parse block in list():`, parseErr);
              continue;
            }
            if (tier && block.tier !== tier) continue;
            if (sessionId && block.session_id !== sessionId) continue;
            blocks.push(block);
          }
        }
      }
    } while (cursor !== '0');

    return blocks;
  }

  async delete(scope: string, name: string, sessionId?: string, tenantId?: string): Promise<void> {
    await this.redis.del(keyFor(scope, name, sessionId, tenantId));
  }
}
