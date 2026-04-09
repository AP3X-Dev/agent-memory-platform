// packages/neo4j/src/__tests__/blocks.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { BlockStore } from '../blocks.js';
import type { MemoryBlock } from '@amp/core';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

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

const TEST_SCOPE = `test-blocks-${Date.now()}`;

function makeBlock(overrides: Partial<MemoryBlock> = {}): MemoryBlock {
  const now = new Date().toISOString();
  return {
    id: 'block-1',
    name: 'persona',
    tier: 'core',
    content: 'You are a helpful assistant.',
    scope: TEST_SCOPE,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('BlockStore (Neo4j)', () => {
  let neo4jAvailable = false;
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  let store: BlockStore;

  beforeAll(async () => {
    neo4jAvailable = await isNeo4jReachable(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
    if (!neo4jAvailable) {
      console.warn(`[skip] Neo4j not reachable at ${NEO4J_URI} — skipping block store tests`);
      return;
    }
    store = new BlockStore(driver);
  });

  afterAll(async () => {
    if (neo4jAvailable) {
      const session = driver.session();
      try {
        await session.run(
          'MATCH (b:MemoryBlock) WHERE b.scope STARTS WITH $prefix DETACH DELETE b',
          { prefix: 'test-blocks-' },
        );
      } finally {
        await session.close();
      }
    }
    await driver.close().catch(() => {});
  });

  it('should return null for a missing block', async () => {
    if (!neo4jAvailable) return;
    const result = await store.get(TEST_SCOPE, 'nonexistent');
    expect(result).toBeNull();
  });

  it('should save and get a block', async () => {
    if (!neo4jAvailable) return;
    const block = makeBlock();
    await store.save(block);
    const result = await store.get(TEST_SCOPE, 'persona');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(block.id);
    expect(result!.name).toBe('persona');
    expect(result!.tier).toBe('core');
    expect(result!.content).toBe(block.content);
    expect(result!.scope).toBe(TEST_SCOPE);
  });

  it('should upsert on save (MERGE behavior)', async () => {
    if (!neo4jAvailable) return;
    const block = makeBlock({ name: 'upsert-test', content: 'original' });
    await store.save(block);
    await store.save({ ...block, content: 'updated', updated_at: new Date().toISOString() });
    const result = await store.get(TEST_SCOPE, 'upsert-test');
    expect(result?.content).toBe('updated');

    // Verify only one node exists
    const session = driver.session();
    try {
      const countResult = await session.run(
        'MATCH (b:MemoryBlock {scope: $scope, name: $name}) RETURN count(b) AS cnt',
        { scope: TEST_SCOPE, name: 'upsert-test' },
      );
      const cnt = countResult.records[0].get('cnt') as { toNumber?: () => number } | number;
      const count = typeof cnt === 'object' && cnt.toNumber ? cnt.toNumber() : cnt;
      expect(count).toBe(1);
    } finally {
      await session.close();
    }
  });

  it('should list all blocks for a scope', async () => {
    if (!neo4jAvailable) return;
    await store.save(makeBlock({ id: 'list-1', name: 'list-a' }));
    await store.save(makeBlock({ id: 'list-2', name: 'list-b' }));
    const blocks = await store.list(TEST_SCOPE);
    const names = blocks.map((b) => b.name);
    expect(names).toContain('list-a');
    expect(names).toContain('list-b');
  });

  it('should list blocks filtered by tier', async () => {
    if (!neo4jAvailable) return;
    await store.save(makeBlock({ id: 'tier-core', name: 'tier-core', tier: 'core' }));
    await store.save(makeBlock({ id: 'tier-working', name: 'tier-working', tier: 'working' }));
    const coreBlocks = await store.list(TEST_SCOPE, 'core');
    const coreNames = coreBlocks.map((b) => b.name);
    expect(coreNames).toContain('tier-core');
    expect(coreNames).not.toContain('tier-working');
  });

  it('should delete a block', async () => {
    if (!neo4jAvailable) return;
    const block = makeBlock({ name: 'delete-me' });
    await store.save(block);
    await store.delete(TEST_SCOPE, 'delete-me');
    const result = await store.get(TEST_SCOPE, 'delete-me');
    expect(result).toBeNull();
  });

  it('should preserve optional fields', async () => {
    if (!neo4jAvailable) return;
    const block = makeBlock({
      name: 'optional-fields',
      agent_id: 'agent-1',
      session_id: 'sess-1',
      max_tokens: 500,
    });
    await store.save(block);
    const result = await store.get(TEST_SCOPE, 'optional-fields');
    expect(result?.agent_id).toBe('agent-1');
    expect(result?.session_id).toBe('sess-1');
    expect(result?.max_tokens).toBe(500);
  });
});
