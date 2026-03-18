// packages/redis/src/locks.ts
import type Redis from 'ioredis';

const DEFAULT_TTL = 30;

function lockKey(scope: string): string {
  return `amp:lock:consolidate:${scope}`;
}

export class DistributedLock {
  constructor(private redis: Redis) {}

  async acquire(scope: string, holder: string, ttlSeconds: number = DEFAULT_TTL): Promise<boolean> {
    const result = await this.redis.set(lockKey(scope), holder, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async release(scope: string, holder: string): Promise<boolean> {
    const key = lockKey(scope);
    const current = await this.redis.get(key);
    if (current !== holder) return false;
    await this.redis.del(key);
    return true;
  }
}
