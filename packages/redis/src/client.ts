// packages/redis/src/client.ts
import { Redis, type RedisOptions } from 'ioredis';

export function createRedisClient(url: string, overrides?: Partial<RedisOptions>): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    retryStrategy(times: number) {
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
    ...overrides,
  });

  // Prevent unhandled error events when Redis is unavailable (e.g., in CI or tests)
  client.on('error', (err: Error) => {
    if (!client.listenerCount('error') || client.listenerCount('error') <= 1) {
      // Only log if no other error listeners are attached
      console.error(`[amp-redis] Connection error: ${err.message}`);
    }
  });

  return client;
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
