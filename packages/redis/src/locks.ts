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
    // Atomic compare-and-delete via Lua to prevent TOCTOU race
    const result = await this.redis.eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then
         return redis.call("DEL", KEYS[1])
       else
         return 0
       end`,
      1,
      key,
      holder,
    );
    return result === 1;
  }
}
