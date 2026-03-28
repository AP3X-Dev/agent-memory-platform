// packages/redis/src/cache.ts
import type { Redis } from 'ioredis';
import type { MemoryContext } from '@amp/core';

export class ContextCache {
  constructor(private redis: Redis) {}

  async get(scopeHash: string): Promise<MemoryContext | null> {
    const raw = await this.redis.get(`amp:ctx:${scopeHash}`);
    if (!raw) return null;
    return JSON.parse(raw) as MemoryContext;
  }

  async set(
    scopeHash: string,
    context: MemoryContext,
    sourceNodeIds: string[],
    ttl: number = 300,
  ): Promise<void> {
    const key = `amp:ctx:${scopeHash}`;
    await this.redis.setex(key, ttl, JSON.stringify(context));

    // Track reverse dependencies for targeted invalidation
    // Use a longer TTL for dep sets so they outlive the context keys they reference
    const depsTtl = ttl * 2;
    const pipeline = this.redis.pipeline();
    for (const nodeId of sourceNodeIds) {
      pipeline.sadd(`amp:deps:${nodeId}`, key);
      pipeline.expire(`amp:deps:${nodeId}`, depsTtl);
    }
    await pipeline.exec();
  }

  async invalidateByNodeId(nodeId: string): Promise<number> {
    const depsKey = `amp:deps:${nodeId}`;
    const cacheKeys = await this.redis.smembers(depsKey);
    if (cacheKeys.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    for (const key of cacheKeys) {
      pipeline.del(key);
    }
    pipeline.del(depsKey);
    await pipeline.exec();
    return cacheKeys.length;
  }
}
