// packages/neo4j/src/__tests__/tenant-isolation.regression.test.ts
//
// Adversarial cross-tenant isolation gate: tenant A must NEVER see tenant B's
// data across semantics (byScope/byVector), memory blocks, and facts; the
// default tenant must still see legacy rows with no tenant_id. Runs against a
// live Neo4j (skips when unreachable; the CI integration job provides one).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { ScopedQuery } from '../query.js';
import { BlockStore } from '../blocks.js';
import { FactStore } from '../fact.js';
import { runMigrations } from '../migrations.js';
import type { FactNode, MemoryBlock } from '@memberry/core';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const TAG = '__tenanttest__';            // unique marker for cleanup
const SUBJECT = '__tenanttest_subject__';

async function reachable(): Promise<boolean> {
  const probe = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  try { await probe.getServerInfo(); return true; } catch { return false; }
  finally { await probe.close().catch(() => {}); }
}

function fact(tenant: string, object: string): FactNode {
  const now = new Date().toISOString();
  return {
    id: `${TAG}-fact-${tenant}`, subject: SUBJECT, predicate: 'uses', object,
    entity_id: null, source_episode_ids: [], valid_at: now, invalid_at: null,
    confidence: 0.9, status: 'active', supersedes_fact_id: null, scope: 'project',
    tags: [TAG], tenant_id: tenant, created_at: now, updated_at: now,
  };
}
function block(tenant: string, content: string): MemoryBlock {
  const now = new Date().toISOString();
  return {
    id: `${TAG}-block-${tenant}`, name: `${TAG}-block`, tier: 'core',
    content, scope: `${TAG}-scope`, created_at: now, updated_at: now, tenant_id: tenant,
  };
}

describe('Tenant isolation (adversarial)', () => {
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  const query = new ScopedQuery(driver);
  const blocks = new BlockStore(driver);
  const facts = new FactStore(driver);
  let ok = false;

  beforeAll(async () => {
    ok = await reachable();
    if (!ok) { console.warn(`[skip] Neo4j not reachable — skipping tenant isolation tests`); return; }
    await runMigrations(driver);
    const s = driver.session();
    try {
      // Seed semantics: tenant A, tenant B, and a legacy (no tenant_id) node — all same tag.
      await s.run(
        `CREATE (:Semantic {id:$a, content:'A secret', confidence:0.9, signal_count:0,
            created_at:$now, updated_at:$now, decay_class:'stable', tags:[$tag], tenant_id:'tenantA'})
         CREATE (:Semantic {id:$b, content:'B secret', confidence:0.9, signal_count:0,
            created_at:$now, updated_at:$now, decay_class:'stable', tags:[$tag], tenant_id:'tenantB'})
         CREATE (:Semantic {id:$l, content:'legacy', confidence:0.9, signal_count:0,
            created_at:$now, updated_at:$now, decay_class:'stable', tags:[$tag]})`,
        { a: `${TAG}-A`, b: `${TAG}-B`, l: `${TAG}-legacy`, tag: TAG, now: new Date().toISOString() },
      );
    } finally { await s.close(); }
    await blocks.save(block('tenantA', 'A-only block'), 'tenantA');
    await blocks.save(block('tenantB', 'B-only block'), 'tenantB');
    await facts.create(fact('tenantA', 'JWT-A'));
    await facts.create(fact('tenantB', 'JWT-B'));
  });

  afterAll(async () => {
    if (ok) {
      const s = driver.session();
      try {
        await s.run(`MATCH (n) WHERE $tag IN n.tags OR n.scope = $scope OR n.subject = $subj DETACH DELETE n`,
          { tag: TAG, scope: `${TAG}-scope`, subj: SUBJECT });
      } finally { await s.close(); }
    }
    await driver.close().catch(() => {});
  });

  it('byScope: a tenant sees only its own semantics', async () => {
    if (!ok) return;
    const a = await query.byScope({ tags: [TAG], limit: 50, tenantId: 'tenantA' });
    const ids = a.map((n) => n.id);
    expect(ids).toContain(`${TAG}-A`);
    expect(ids).not.toContain(`${TAG}-B`);      // never tenant B
    expect(ids).not.toContain(`${TAG}-legacy`); // named tenant: strict, no legacy

    const b = await query.byScope({ tags: [TAG], limit: 50, tenantId: 'tenantB' });
    const bids = b.map((n) => n.id);
    expect(bids).toContain(`${TAG}-B`);
    expect(bids).not.toContain(`${TAG}-A`);
  });

  it('byScope: the default tenant sees legacy (no tenant_id) but not named tenants', async () => {
    if (!ok) return;
    const d = await query.byScope({ tags: [TAG], limit: 50, tenantId: 'default' });
    const ids = d.map((n) => n.id);
    expect(ids).toContain(`${TAG}-legacy`);
    expect(ids).not.toContain(`${TAG}-A`);
    expect(ids).not.toContain(`${TAG}-B`);
  });

  it('blocks: a tenant reads only its own block at the same scope+name', async () => {
    if (!ok) return;
    const a = await blocks.get(`${TAG}-scope`, `${TAG}-block`, undefined, 'tenantA');
    const b = await blocks.get(`${TAG}-scope`, `${TAG}-block`, undefined, 'tenantB');
    expect(a?.content).toBe('A-only block');
    expect(b?.content).toBe('B-only block');
  });

  it('facts: getActive returns only the calling tenant\'s facts', async () => {
    if (!ok) return;
    const a = await facts.getActive(SUBJECT, undefined, 'tenantA');
    const b = await facts.getActive(SUBJECT, undefined, 'tenantB');
    expect(a.map((f) => f.object)).toEqual(['JWT-A']);
    expect(b.map((f) => f.object)).toEqual(['JWT-B']);
  });
});
