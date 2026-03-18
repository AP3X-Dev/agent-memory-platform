// packages/redis/src/queue.ts
import type Redis from 'ioredis';

const QUEUE_KEY = 'amp:consolidation-queue';

export class ConsolidationQueue {
  constructor(private redis: Redis) {}

  async incrementScore(member: string, increment: number): Promise<number> {
    const result = await this.redis.zincrby(QUEUE_KEY, increment, member);
    return parseFloat(result);
  }

  async popHighest(): Promise<{ member: string; score: number } | null> {
    const result = await this.redis.zpopmax(QUEUE_KEY);
    if (!result || result.length < 2) return null;
    return { member: result[0], score: parseFloat(result[1]) };
  }

  async peek(count: number = 10): Promise<Array<{ member: string; score: number }>> {
    const result = await this.redis.zrevrange(QUEUE_KEY, 0, count - 1, 'WITHSCORES');
    const entries: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      entries.push({ member: result[i], score: parseFloat(result[i + 1]) });
    }
    return entries;
  }
}
