// packages/redis/src/client.ts
import Redis, { RedisOptions } from 'ioredis';

export function createRedisClient(url: string, overrides?: Partial<RedisOptions>): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    retryStrategy(times: number) {
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
    ...overrides,
  });
}

export interface HealthResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

export async function healthCheck(client: Redis): Promise<HealthResult> {
  const start = performance.now();
  try {
    await client.ping();
    return {
      status: 'healthy',
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
