// Shared Neo4j test helper — connects to local instance, cleans test data.
import neo4j, { type Driver } from 'neo4j-driver';

const NEO4J_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'amp-memory-2026';

let driver: Driver | null = null;

// Probe eagerly at module load (top-level await in ESM)
let neo4jAvailable = false;
try {
  const probe = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  await probe.getServerInfo();
  driver = probe;
  neo4jAvailable = true;
} catch {
  neo4jAvailable = false;
}

/** Whether Neo4j is reachable. Safe to call synchronously after import. */
export const NEO4J_AVAILABLE = neo4jAvailable;

export async function getDriver(): Promise<Driver | null> {
  return neo4jAvailable ? driver : null;
}

/** Delete all nodes with a test-specific label to avoid polluting real data. */
export async function cleanTestData(d: Driver, label: string): Promise<void> {
  const session = d.session();
  try {
    await session.run(`MATCH (n:${label}) DETACH DELETE n`);
  } finally {
    await session.close();
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    neo4jAvailable = false;
  }
}
