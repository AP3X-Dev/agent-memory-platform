// packages/neo4j/src/__tests__/driver.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createNeo4jDriver, healthCheck } from '../driver.js';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// Probe whether Neo4j is reachable before running connection tests
async function isNeo4jReachable(uri: string, user: string, password: string): Promise<boolean> {
  const probe = createNeo4jDriver(uri, user, password);
  try {
    await probe.getServerInfo();
    return true;
  } catch {
    return false;
  } finally {
    await probe.close().catch(() => {});
  }
}

describe('Neo4j Driver', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping connection tests`);
    }
  });

  afterAll(async () => {
    await driver.close().catch(() => {});
  });

  it('should connect and verify connectivity', async () => {
    if (!neo4jAvailable) return;
    const info = await driver.getServerInfo();
    expect(info).toBeTruthy();
  });

  it('should report healthy when connected', async () => {
    if (!neo4jAvailable) return;
    const health = await healthCheck(driver);
    expect(health.status).toBe('healthy');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should report unhealthy for bad connection', async () => {
    const badDriver = createNeo4jDriver('bolt://localhost:19999', 'neo4j', 'password');
    const health = await healthCheck(badDriver);
    expect(health.status).toBe('unhealthy');
    expect(health.error).toBeTruthy();
    await badDriver.close().catch(() => {});
  });
});
