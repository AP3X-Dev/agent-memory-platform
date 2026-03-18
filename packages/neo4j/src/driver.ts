// packages/neo4j/src/driver.ts
import neo4j, { type Driver } from 'neo4j-driver';

export function createNeo4jDriver(uri: string, user: string, password: string): Driver {
  return neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000,
  });
}

export interface Neo4jHealthResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

export async function healthCheck(driver: Driver): Promise<Neo4jHealthResult> {
  const start = performance.now();
  try {
    await driver.getServerInfo();
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
