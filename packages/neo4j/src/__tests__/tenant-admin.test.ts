// packages/neo4j/src/__tests__/tenant-admin.test.ts
//
// Per-tenant admin (stats/export/delete) against a live Neo4j (skips when
// unreachable). delete is destructive, so we verify it only removes the named
// tenant's nodes and refuses the default tenant.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeo4jDriver } from '../driver.js';
import { TenantAdmin } from '../tenant-admin.js';
import { FactStore } from '../fact.js';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const T = '__tenantadmin__';

async function reachable(): Promise<boolean> {
  const p = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  try { await p.getServerInfo(); return true; } catch { return false; } finally { await p.close().catch(() => {}); }
}

describe('TenantAdmin', () => {
  const driver = createNeo4jDriver(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
  const admin = new TenantAdmin(driver);
  const facts = new FactStore(driver);
  let ok = false;

  beforeAll(async () => {
    ok = await reachable();
    if (!ok) { console.warn('[skip] Neo4j not reachable — skipping TenantAdmin tests'); return; }
    const now = new Date().toISOString();
    // Two tenants' facts (same subject) + one "keep" tenant we must NOT delete.
    await facts.create({ id: `${T}-a`, subject: `${T}-s`, predicate: 'p', object: 'A', entity_id: null,
      source_episode_ids: [], valid_at: now, invalid_at: null, confidence: 0.9, status: 'active',
      supersedes_fact_id: null, scope: 'project', tags: [T], tenant_id: `${T}-victim`, created_at: now, updated_at: now });
    await facts.create({ id: `${T}-b`, subject: `${T}-s`, predicate: 'p', object: 'B', entity_id: null,
      source_episode_ids: [], valid_at: now, invalid_at: null, confidence: 0.9, status: 'active',
      supersedes_fact_id: null, scope: 'project', tags: [T], tenant_id: `${T}-keep`, created_at: now, updated_at: now });
  });

  afterAll(async () => {
    if (ok) {
      const s = driver.session();
      try { await s.run(`MATCH (n) WHERE $t IN n.tags DETACH DELETE n`, { t: T }); } finally { await s.close(); }
    }
    await driver.close().catch(() => {});
  });

  it('stats counts only the named tenant', async () => {
    if (!ok) return;
    expect((await admin.stats(`${T}-victim`)).Fact).toBe(1);
    expect((await admin.stats(`${T}-keep`)).Fact).toBe(1);
  });

  it('refuses to delete the default tenant', async () => {
    if (!ok) return;
    await expect(admin.delete('default')).rejects.toThrow(/default/i);
    await expect(admin.delete('')).rejects.toThrow();
  });

  it('delete removes only the named tenant, leaving others intact', async () => {
    if (!ok) return;
    await admin.delete(`${T}-victim`);
    expect((await admin.stats(`${T}-victim`)).Fact).toBe(0);
    expect((await admin.stats(`${T}-keep`)).Fact).toBe(1); // untouched
  });
});
