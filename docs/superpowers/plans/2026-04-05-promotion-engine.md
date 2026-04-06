# AMP Promotion Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the episodic-to-semantic promotion pipeline so AMP's 157+ episodic records become visible semantic knowledge.

**Architecture:** A PromotionScanner runs on a 5-minute interval, scanning episodic records for clusters worth promoting (by entity, cross-session patterns, and orphaned entities). It generates `promote` proposals consumed by the existing ConsolidationEngine. A separate episodic fallback in `amp_load` provides immediate visibility while the semantic layer populates.

**Tech Stack:** TypeScript, Neo4j (Cypher), Redis, vitest, nanoid

**Spec:** `docs/superpowers/specs/2026-04-05-promotion-engine-design.md`

---

### Task 1: Add Promotion Types to `@amp/core`

**Files:**
- Modify: `packages/core/src/types.ts:144` (after RECENCY_DECAY_DAYS)

- [ ] **Step 1: Add cluster types and promotion config**

Add after line 144 (`export const RECENCY_DECAY_DAYS = 7;`) in `packages/core/src/types.ts`:

```typescript
// === Promotion ===

export interface PromotionConfig {
  enabled: boolean;
  intervalMs: number;
  minEpisodes: number;
  minSessions: number;
  coldStartEnabled: boolean;
  scoreThreshold: number;
}

export interface EpisodeClusterItem {
  id: string;
  session_id: string;
  content: string;
  outcome: string | null;
  created_at: string;
}

export interface EntityCluster {
  entityId: string;
  entityName: string;
  episodes: EpisodeClusterItem[];
  sessions: string[];
}

export interface SessionCluster {
  entityId: string;
  entityName: string;
  episodes: EpisodeClusterItem[];
  sessions: string[];
}

export interface OrphanedEntityEpisode {
  entityId: string;
  entityName: string;
  episodes: EpisodeClusterItem[];
}

export interface StalePromotedNode {
  id: string;
  confidence: number;
  decay_class: string;
}
```

- [ ] **Step 2: Add `promotion` to AMPConfig interface**

In `packages/core/src/types.ts`, find the `AMPConfig` interface and add the `promotion` field. The interface currently ends around line 133. Add after the `exportPath` field:

```typescript
export interface AMPConfig {
  redis: { url: string };
  neo4j: { uri: string; user: string; password: string };
  embedding: { provider: 'openai'; apiKey: string };
  cache: { defaultTTL: number; contextTTL: number; embeddingTTL: number };
  consolidation: { autoApply: boolean; signalThreshold: number };
  exportPath: string;
  promotion: PromotionConfig;
}
```

- [ ] **Step 3: Update makeConfig helpers in existing tests**

Every test that calls `makeConfig()` will break because `AMPConfig` now requires `promotion`. Update these files to add the field:

In `packages/core/src/__tests__/consolidation.test.ts`, update `makeConfig`:

```typescript
function makeConfig(autoApply = false): AMPConfig {
  return {
    redis: { url: 'redis://localhost:6379' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'password' },
    embedding: { provider: 'openai', apiKey: 'test-key' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply, signalThreshold: 3 },
    exportPath: '/tmp/amp-export',
    promotion: { enabled: true, intervalMs: 300_000, minEpisodes: 3, minSessions: 2, coldStartEnabled: true, scoreThreshold: 3 },
  };
}
```

Apply the same `promotion` field to `makeConfig` in:
- `packages/core/src/__tests__/service.test.ts`
- `packages/core/src/__tests__/service.regression.test.ts`
- `packages/core/src/__tests__/integration.test.ts`
- Any other test file in `packages/core/src/__tests__/` that defines `makeConfig`

Search with: `grep -rn 'makeConfig' packages/core/src/__tests__/`

- [ ] **Step 4: Run existing tests to verify nothing broke**

Run: `cd ~/projects/amp && npx vitest run --project core 2>&1 | tail -20`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/__tests__/
git commit -m "feat(core): add promotion types and config to AMPConfig"
```

---

### Task 2: Add Promotion Query Methods to EpisodicStore

**Files:**
- Modify: `packages/neo4j/src/episodic.ts:139` (end of file, add new methods)
- Test: `packages/neo4j/src/__tests__/episodic.test.ts`

- [ ] **Step 1: Write failing tests for the three promotion query methods**

Add to the end of `packages/neo4j/src/__tests__/episodic.test.ts`, inside the existing `describe('EpisodicStore', ...)` block, before the final closing `});`:

```typescript
  describe('promotion queries', () => {
    const PROMO_ENTITY_ID = 'test-promo-entity-001';
    const PROMO_ENTITY_NAME = 'TestPromoEntity';

    beforeAll(async () => {
      if (!neo4jAvailable) return;
      const session = driver.session();
      try {
        // Clean up any prior test data
        await session.run(`MATCH (n) WHERE n.id STARTS WITH 'promo-test-' DETACH DELETE n`);
        await session.run(`MATCH (n:Entity {id: $id}) DETACH DELETE n`, { id: PROMO_ENTITY_ID });

        // Create test entity
        await session.run(
          `CREATE (:Entity {id: $id, name: $name, type: 'Component', created_at: $now})`,
          { id: PROMO_ENTITY_ID, name: PROMO_ENTITY_NAME, now: new Date().toISOString() }
        );

        // Create 4 episodes across 3 sessions, all referencing the entity
        const episodes = [
          { id: 'promo-test-ep1', session_id: 'sess-A', outcome: 'approved', age: 1 },
          { id: 'promo-test-ep2', session_id: 'sess-A', outcome: null, age: 2 },
          { id: 'promo-test-ep3', session_id: 'sess-B', outcome: 'approved', age: 3 },
          { id: 'promo-test-ep4', session_id: 'sess-C', outcome: null, age: 10 },
        ];
        for (const ep of episodes) {
          const created = new Date(Date.now() - ep.age * 86400000).toISOString();
          await session.run(
            `CREATE (e:Episodic {
              id: $id, session_id: $sid, agent_id: 'test-agent',
              task: 'test task', content: 'Content for ' + $id,
              outcome: $outcome, created_at: $created
            })
            WITH e
            MATCH (ent:Entity {id: $entId})
            CREATE (e)-[:REFERENCES]->(ent)`,
            { id: ep.id, sid: ep.session_id, outcome: ep.outcome, created, entId: PROMO_ENTITY_ID }
          );
        }
      } finally {
        await session.close();
      }
    });

    afterAll(async () => {
      if (!neo4jAvailable) return;
      const session = driver.session();
      try {
        await session.run(`MATCH (n) WHERE n.id STARTS WITH 'promo-test-' DETACH DELETE n`);
        await session.run(`MATCH (n:Entity {id: $id}) DETACH DELETE n`, { id: PROMO_ENTITY_ID });
      } finally {
        await session.close();
      }
    });

    it('findClustersByEntity returns clusters with enough episodes', async () => {
      if (!neo4jAvailable) return;
      const clusters = await store.findClustersByEntity(3);
      const match = clusters.find(c => c.entityId === PROMO_ENTITY_ID);
      expect(match).toBeDefined();
      expect(match!.episodes.length).toBeGreaterThanOrEqual(3);
      expect(match!.entityName).toBe(PROMO_ENTITY_NAME);
    });

    it('findClustersByEntity respects minEpisodes threshold', async () => {
      if (!neo4jAvailable) return;
      const clusters = await store.findClustersByEntity(10);
      const match = clusters.find(c => c.entityId === PROMO_ENTITY_ID);
      expect(match).toBeUndefined();
    });

    it('findCrossSessionPatterns returns entities with multi-session approved episodes', async () => {
      if (!neo4jAvailable) return;
      const patterns = await store.findCrossSessionPatterns(2);
      const match = patterns.find(c => c.entityId === PROMO_ENTITY_ID);
      expect(match).toBeDefined();
      expect(match!.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('findOrphanedEntities returns entities with no semantic coverage', async () => {
      if (!neo4jAvailable) return;
      const orphans = await store.findOrphanedEntities();
      const match = orphans.find(o => o.entityId === PROMO_ENTITY_ID);
      expect(match).toBeDefined();
      expect(match!.episodes.length).toBeGreaterThanOrEqual(1);
      // Every returned episode must have approved outcome
      for (const ep of match!.episodes) {
        expect(ep.outcome).toBe('approved');
      }
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/projects/amp && npx vitest run packages/neo4j/src/__tests__/episodic.test.ts 2>&1 | tail -20`
Expected: FAIL — `store.findClustersByEntity is not a function`

- [ ] **Step 3: Implement the three query methods**

Add to the end of class `EpisodicStore` in `packages/neo4j/src/episodic.ts`, before the closing `}` of the class:

```typescript
  async findClustersByEntity(minEpisodes: number): Promise<EntityCluster[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
         WHERE NOT EXISTS { MATCH (s:Semantic)-[:PROMOTED_FROM]->(ep) }
         WITH e, collect({
           id: ep.id, session_id: ep.session_id, content: ep.content,
           outcome: ep.outcome, created_at: ep.created_at
         }) AS eps, collect(DISTINCT ep.session_id) AS sessions
         WHERE size(eps) >= $minEpisodes
         RETURN e.id AS entityId, e.name AS entityName, eps AS episodes, sessions`,
        { minEpisodes },
      );
      return result.records.map(r => ({
        entityId: r.get('entityId') as string,
        entityName: r.get('entityName') as string,
        episodes: r.get('episodes') as EpisodeClusterItem[],
        sessions: r.get('sessions') as string[],
      }));
    } finally {
      await session.close();
    }
  }

  async findCrossSessionPatterns(minSessions: number): Promise<SessionCluster[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
         WHERE NOT EXISTS { MATCH (s:Semantic)-[:PROMOTED_FROM]->(ep) }
         WITH e, collect({
           id: ep.id, session_id: ep.session_id, content: ep.content,
           outcome: ep.outcome, created_at: ep.created_at
         }) AS eps, collect(DISTINCT ep.session_id) AS sessions
         WHERE size(sessions) >= $minSessions
         AND any(ep IN eps WHERE ep.outcome = 'approved')
         RETURN e.id AS entityId, e.name AS entityName, eps AS episodes, sessions`,
        { minSessions },
      );
      return result.records.map(r => ({
        entityId: r.get('entityId') as string,
        entityName: r.get('entityName') as string,
        episodes: r.get('episodes') as EpisodeClusterItem[],
        sessions: r.get('sessions') as string[],
      }));
    } finally {
      await session.close();
    }
  }

  async findOrphanedEntities(): Promise<OrphanedEntityEpisode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
         WHERE ep.outcome = 'approved'
         AND NOT EXISTS { MATCH (:Semantic)-[:ABOUT]->(e) }
         AND NOT EXISTS { MATCH (s:Semantic)-[:PROMOTED_FROM]->(ep) }
         WITH e, collect({
           id: ep.id, session_id: ep.session_id, content: ep.content,
           outcome: ep.outcome, created_at: ep.created_at
         }) AS eps
         RETURN e.id AS entityId, e.name AS entityName, eps AS episodes`,
      );
      return result.records.map(r => ({
        entityId: r.get('entityId') as string,
        entityName: r.get('entityName') as string,
        episodes: r.get('episodes') as EpisodeClusterItem[],
      }));
    } finally {
      await session.close();
    }
  }
```

Also update the import at the top of `packages/neo4j/src/episodic.ts`:

```typescript
import type { EpisodicNode, Signal, EntityCluster, SessionCluster, OrphanedEntityEpisode, EpisodeClusterItem } from '@amp/core';
```

Replace the existing import line: `import type { EpisodicNode, Signal } from '@amp/core';`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/neo4j/src/__tests__/episodic.test.ts 2>&1 | tail -20`
Expected: All tests PASS including the new promotion queries.

- [ ] **Step 5: Commit**

```bash
git add packages/neo4j/src/episodic.ts packages/neo4j/src/__tests__/episodic.test.ts
git commit -m "feat(neo4j): add promotion query methods to EpisodicStore"
```

---

### Task 3: Add SemanticStore Methods for Decay Pass

**Files:**
- Modify: `packages/neo4j/src/semantic.ts` (add findStalePromoted, updateDecayClass)
- Test: `packages/neo4j/src/__tests__/semantic.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the end of `packages/neo4j/src/__tests__/semantic.test.ts`, inside the existing `describe('SemanticStore', ...)` block:

```typescript
  describe('promotion decay methods', () => {
    const STALE_SEM_ID = 'test-stale-sem-001';
    const STALE_EP_ID = 'test-stale-ep-001';

    beforeAll(async () => {
      if (!neo4jAvailable) return;
      const session = driver.session();
      try {
        await session.run(`MATCH (n) WHERE n.id IN [$s, $e] DETACH DELETE n`, { s: STALE_SEM_ID, e: STALE_EP_ID });

        // Create an episodic node
        await session.run(
          `CREATE (:Episodic {id: $id, session_id: 'test-sess', agent_id: 'test-agent',
            task: 'test', content: 'test content', created_at: $now})`,
          { id: STALE_EP_ID, now: new Date().toISOString() }
        );

        // Create a promoted semantic node (updated 10 days ago)
        const staleDate = new Date(Date.now() - 10 * 86400000).toISOString();
        await session.run(
          `CREATE (s:Semantic {id: $id, content: 'stale promoted knowledge',
            confidence: 0.3, signal_count: 0, created_at: $now,
            updated_at: $stale, decay_class: 'stable', tags: ['test']})
           WITH s
           MATCH (ep:Episodic {id: $epId})
           CREATE (s)-[:PROMOTED_FROM]->(ep)`,
          { id: STALE_SEM_ID, now: new Date().toISOString(), stale: staleDate, epId: STALE_EP_ID }
        );
      } finally {
        await session.close();
      }
    });

    afterAll(async () => {
      if (!neo4jAvailable) return;
      const session = driver.session();
      try {
        await session.run(`MATCH (n) WHERE n.id IN [$s, $e] DETACH DELETE n`, { s: STALE_SEM_ID, e: STALE_EP_ID });
      } finally {
        await session.close();
      }
    });

    it('findStalePromoted returns nodes older than cutoff', async () => {
      if (!neo4jAvailable) return;
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
      const stale = await store.findStalePromoted(cutoff);
      const match = stale.find(n => n.id === STALE_SEM_ID);
      expect(match).toBeDefined();
      expect(match!.confidence).toBe(0.3);
      expect(match!.decay_class).toBe('stable');
    });

    it('findStalePromoted excludes recent nodes', async () => {
      if (!neo4jAvailable) return;
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const stale = await store.findStalePromoted(cutoff);
      const match = stale.find(n => n.id === STALE_SEM_ID);
      expect(match).toBeUndefined();
    });

    it('updateDecayClass changes the decay_class field', async () => {
      if (!neo4jAvailable) return;
      await store.updateDecayClass(STALE_SEM_ID, 'volatile');
      const node = await store.getById(STALE_SEM_ID);
      expect(node).not.toBeNull();
      expect(node!.decay_class).toBe('volatile');
      // Reset for other tests
      await store.updateDecayClass(STALE_SEM_ID, 'stable');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/projects/amp && npx vitest run packages/neo4j/src/__tests__/semantic.test.ts 2>&1 | tail -20`
Expected: FAIL — `store.findStalePromoted is not a function`

- [ ] **Step 3: Implement the methods**

Add to `packages/neo4j/src/semantic.ts`, inside class `SemanticStore`, before the closing `}`:

```typescript
  async findStalePromoted(cutoffDate: string): Promise<StalePromotedNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)-[:PROMOTED_FROM]->(:Episodic)
         WHERE s.updated_at < $cutoff
         RETURN s.id AS id, s.confidence AS confidence, s.decay_class AS decay_class`,
        { cutoff: cutoffDate },
      );
      return result.records.map(r => ({
        id: r.get('id') as string,
        confidence: r.get('confidence') as number,
        decay_class: r.get('decay_class') as string,
      }));
    } finally {
      await session.close();
    }
  }

  async updateDecayClass(id: string, decayClass: string): Promise<void> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      await session.run(
        'MATCH (s:Semantic {id: $id}) SET s.decay_class = $decayClass, s.updated_at = $now',
        { id, decayClass, now },
      );
    } finally {
      await session.close();
    }
  }
```

Add the import at the top of `packages/neo4j/src/semantic.ts`:

```typescript
import type { SemanticNode, StalePromotedNode } from '@amp/core';
```

Replace the existing import: `import type { SemanticNode } from '@amp/core';`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/neo4j/src/__tests__/semantic.test.ts 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/neo4j/src/semantic.ts packages/neo4j/src/__tests__/semantic.test.ts
git commit -m "feat(neo4j): add findStalePromoted and updateDecayClass to SemanticStore"
```

---

### Task 4: Add `byEpisodicScope` to ScopedQuery

**Files:**
- Modify: `packages/neo4j/src/query.ts:163` (after byVector, add byEpisodicScope)
- Test: `packages/neo4j/src/__tests__/query.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/neo4j/src/__tests__/query.test.ts`, inside the existing `describe('ScopedQuery', ...)`:

```typescript
  describe('byEpisodicScope', () => {
    const EP_SCOPE_ENTITY = 'test-ep-scope-entity';
    const EP_SCOPE_ENTITY_NAME = 'EpScopeEntity';

    beforeAll(async () => {
      if (!neo4jAvailable) return;
      const session = driver.session();
      try {
        await session.run(`MATCH (n) WHERE n.id STARTS WITH 'ep-scope-test-' DETACH DELETE n`);
        await session.run(`MATCH (n:Entity {id: $id}) DETACH DELETE n`, { id: EP_SCOPE_ENTITY });

        await session.run(
          `CREATE (:Entity {id: $id, name: $name, type: 'Component', created_at: $now})`,
          { id: EP_SCOPE_ENTITY, name: EP_SCOPE_ENTITY_NAME, now: new Date().toISOString() }
        );

        // Create 3 episodes referencing the entity
        for (let i = 1; i <= 3; i++) {
          const created = new Date(Date.now() - i * 3600000).toISOString();
          await session.run(
            `CREATE (e:Episodic {
              id: 'ep-scope-test-' + $i, session_id: 'sess-' + $i, agent_id: 'agent',
              task: 'task ' + $i, content: 'Episodic content ' + $i,
              outcome: $outcome, created_at: $created
            })
            WITH e
            MATCH (ent:Entity {id: $entId})
            CREATE (e)-[:REFERENCES]->(ent)`,
            { i: String(i), outcome: i === 1 ? 'approved' : null, created, entId: EP_SCOPE_ENTITY }
          );
        }
      } finally {
        await session.close();
      }
    });

    afterAll(async () => {
      if (!neo4jAvailable) return;
      const session = driver.session();
      try {
        await session.run(`MATCH (n) WHERE n.id STARTS WITH 'ep-scope-test-' DETACH DELETE n`);
        await session.run(`MATCH (n:Entity {id: $id}) DETACH DELETE n`, { id: EP_SCOPE_ENTITY });
      } finally {
        await session.close();
      }
    });

    it('returns episodic records matching entity names', async () => {
      if (!neo4jAvailable) return;
      const results = await query.byEpisodicScope([EP_SCOPE_ENTITY_NAME], 10);
      expect(results.length).toBe(3);
      // Should be ordered by created_at DESC (most recent first)
      expect(results[0].id).toBe('ep-scope-test-1');
    });

    it('respects the limit parameter', async () => {
      if (!neo4jAvailable) return;
      const results = await query.byEpisodicScope([EP_SCOPE_ENTITY_NAME], 2);
      expect(results.length).toBe(2);
    });

    it('returns empty for unknown entities', async () => {
      if (!neo4jAvailable) return;
      const results = await query.byEpisodicScope(['NonExistentEntity'], 10);
      expect(results.length).toBe(0);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/amp && npx vitest run packages/neo4j/src/__tests__/query.test.ts 2>&1 | tail -20`
Expected: FAIL — `query.byEpisodicScope is not a function`

- [ ] **Step 3: Implement byEpisodicScope**

Add to `packages/neo4j/src/query.ts`, inside class `ScopedQuery`, after the `byVector` method:

```typescript
  async byEpisodicScope(
    entityNames: string[],
    limit: number,
  ): Promise<Array<{ id: string; content: string; task: string; session_id: string; outcome: string | null; created_at: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
         WHERE e.name IN $entities
         RETURN ep.id AS id, ep.content AS content, ep.task AS task,
                ep.session_id AS session_id, ep.outcome AS outcome,
                ep.created_at AS created_at
         ORDER BY ep.created_at DESC
         LIMIT $limit`,
        { entities: entityNames, limit },
      );
      return result.records.map(r => ({
        id: r.get('id') as string,
        content: r.get('content') as string,
        task: r.get('task') as string,
        session_id: r.get('session_id') as string,
        outcome: r.get('outcome') as string | null,
        created_at: r.get('created_at') as string,
      }));
    } finally {
      await session.close();
    }
  }
```

No new imports needed — the existing `query.ts` already imports from `neo4j-driver`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/neo4j/src/__tests__/query.test.ts 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/neo4j/src/query.ts packages/neo4j/src/__tests__/query.test.ts
git commit -m "feat(neo4j): add byEpisodicScope to ScopedQuery for load fallback"
```

---

### Task 5: Build the PromotionScanner

**Files:**
- Create: `packages/core/src/promotion.ts`
- Create: `packages/core/src/__tests__/promotion.test.ts`

- [ ] **Step 1: Write the test file with mocked dependencies**

Create `packages/core/src/__tests__/promotion.test.ts`:

```typescript
// packages/core/src/__tests__/promotion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromotionScanner } from '../promotion.js';
import type { PromotionRedisLayer, PromotionNeo4jLayer } from '../promotion.js';
import type {
  AMPConfig, EntityCluster, SessionCluster,
  OrphanedEntityEpisode, EpisodeClusterItem, StalePromotedNode,
} from '../types.js';

function makeConfig(): AMPConfig {
  return {
    redis: { url: 'redis://localhost:6379' },
    neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'password' },
    embedding: { provider: 'openai', apiKey: 'test-key' },
    cache: { defaultTTL: 300, contextTTL: 600, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath: '/tmp/amp-export',
    promotion: { enabled: true, intervalMs: 300_000, minEpisodes: 3, minSessions: 2, coldStartEnabled: true, scoreThreshold: 3 },
  };
}

function makeEpisode(id: string, sessionId: string, outcome: string | null = null, ageDays = 1): EpisodeClusterItem {
  return {
    id,
    session_id: sessionId,
    content: `Content for episode ${id}`,
    outcome,
    created_at: new Date(Date.now() - ageDays * 86400000).toISOString(),
  };
}

function makeRedis(): PromotionRedisLayer {
  return {
    lock: {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(true),
    },
    proposals: {
      save: vi.fn().mockResolvedValue(undefined),
    },
    cache: {
      invalidateByNodeId: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeNeo4j(): PromotionNeo4jLayer {
  return {
    episodic: {
      findClustersByEntity: vi.fn().mockResolvedValue([]),
      findCrossSessionPatterns: vi.fn().mockResolvedValue([]),
      findOrphanedEntities: vi.fn().mockResolvedValue([]),
    },
    semantic: {
      promoteFromEpisodic: vi.fn().mockResolvedValue('sem-new'),
      linkToEntity: vi.fn().mockResolvedValue(undefined),
      findStalePromoted: vi.fn().mockResolvedValue([]),
      updateConfidence: vi.fn().mockResolvedValue(undefined),
      updateDecayClass: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('PromotionScanner', () => {
  let redis: PromotionRedisLayer;
  let neo4j: PromotionNeo4jLayer;
  let scanner: PromotionScanner;

  beforeEach(() => {
    redis = makeRedis();
    neo4j = makeNeo4j();
    scanner = new PromotionScanner(redis, neo4j, makeConfig());
  });

  it('skips when lock is held', async () => {
    (redis.lock.acquire as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const result = await scanner.run('global');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('lock_held');
  });

  it('releases lock after run', async () => {
    const result = await scanner.run('global');
    expect(redis.lock.release).toHaveBeenCalled();
    expect(result.skipped).toBe(false);
  });

  it('generates promote proposal from entity cluster', async () => {
    const cluster: EntityCluster = {
      entityId: 'ent-1',
      entityName: 'AuthModule',
      episodes: [
        makeEpisode('ep-1', 'sess-A', 'approved', 1),
        makeEpisode('ep-2', 'sess-B', null, 2),
        makeEpisode('ep-3', 'sess-C', null, 3),
      ],
      sessions: ['sess-A', 'sess-B', 'sess-C'],
    };
    (neo4j.episodic.findClustersByEntity as ReturnType<typeof vi.fn>).mockResolvedValue([cluster]);

    const result = await scanner.run('global');
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0].type).toBe('promote');
    expect(result.proposals[0].affected_ids).toContain('ep-1');
    expect(redis.proposals.save).toHaveBeenCalledTimes(1);
  });

  it('generates promote proposal from cross-session pattern', async () => {
    const cluster: SessionCluster = {
      entityId: 'ent-2',
      entityName: 'DBLayer',
      episodes: [
        makeEpisode('ep-10', 'sess-X', 'approved', 1),
        makeEpisode('ep-11', 'sess-Y', 'approved', 2),
      ],
      sessions: ['sess-X', 'sess-Y'],
    };
    (neo4j.episodic.findCrossSessionPatterns as ReturnType<typeof vi.fn>).mockResolvedValue([cluster]);

    const result = await scanner.run('global');
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0].type).toBe('promote');
  });

  it('generates cold-start promote proposal from orphaned entity', async () => {
    const orphan: OrphanedEntityEpisode = {
      entityId: 'ent-3',
      entityName: 'NewService',
      episodes: [makeEpisode('ep-20', 'sess-Z', 'approved', 1)],
    };
    (neo4j.episodic.findOrphanedEntities as ReturnType<typeof vi.fn>).mockResolvedValue([orphan]);

    const result = await scanner.run('global');
    expect(result.proposals.length).toBe(1);
    const proposal = result.proposals[0];
    expect(proposal.type).toBe('promote');
    // Cold-start gets confidence 0.2
    expect((proposal.after as { confidence: number }).confidence).toBe(0.2);
  });

  it('skips cold-start when disabled', async () => {
    const config = makeConfig();
    config.promotion.coldStartEnabled = false;
    scanner = new PromotionScanner(redis, neo4j, config);

    const orphan: OrphanedEntityEpisode = {
      entityId: 'ent-3',
      entityName: 'NewService',
      episodes: [makeEpisode('ep-20', 'sess-Z', 'approved', 1)],
    };
    (neo4j.episodic.findOrphanedEntities as ReturnType<typeof vi.fn>).mockResolvedValue([orphan]);

    const result = await scanner.run('global');
    expect(result.proposals.length).toBe(0);
  });

  it('applies decay to stale promoted nodes', async () => {
    const stale: StalePromotedNode[] = [
      { id: 'sem-stale-1', confidence: 0.3, decay_class: 'stable' },
    ];
    (neo4j.semantic.findStalePromoted as ReturnType<typeof vi.fn>).mockResolvedValue(stale);

    const result = await scanner.run('global');
    expect(neo4j.semantic.updateConfidence).toHaveBeenCalledWith('sem-stale-1', 0.3 * 0.95);
    expect(result.decayed).toBe(1);
  });

  it('marks nodes volatile when confidence drops below 0.1', async () => {
    const stale: StalePromotedNode[] = [
      { id: 'sem-dying', confidence: 0.08, decay_class: 'stable' },
    ];
    (neo4j.semantic.findStalePromoted as ReturnType<typeof vi.fn>).mockResolvedValue(stale);

    await scanner.run('global');
    expect(neo4j.semantic.updateDecayClass).toHaveBeenCalledWith('sem-dying', 'volatile');
  });

  it('does not re-mark already volatile nodes', async () => {
    const stale: StalePromotedNode[] = [
      { id: 'sem-already-vol', confidence: 0.05, decay_class: 'volatile' },
    ];
    (neo4j.semantic.findStalePromoted as ReturnType<typeof vi.fn>).mockResolvedValue(stale);

    await scanner.run('global');
    expect(neo4j.semantic.updateConfidence).toHaveBeenCalled();
    expect(neo4j.semantic.updateDecayClass).not.toHaveBeenCalled();
  });

  it('deduplicates proposals across passes', async () => {
    // Same entity appears in both pass 1 and pass 2
    const cluster: EntityCluster = {
      entityId: 'ent-dup', entityName: 'DupEntity',
      episodes: [
        makeEpisode('ep-d1', 'sess-A', 'approved', 1),
        makeEpisode('ep-d2', 'sess-B', null, 2),
        makeEpisode('ep-d3', 'sess-C', null, 3),
      ],
      sessions: ['sess-A', 'sess-B', 'sess-C'],
    };
    const sessionCluster: SessionCluster = {
      entityId: 'ent-dup', entityName: 'DupEntity',
      episodes: [
        makeEpisode('ep-d1', 'sess-A', 'approved', 1),
        makeEpisode('ep-d2', 'sess-B', null, 2),
        makeEpisode('ep-d3', 'sess-C', null, 3),
      ],
      sessions: ['sess-A', 'sess-B', 'sess-C'],
    };
    (neo4j.episodic.findClustersByEntity as ReturnType<typeof vi.fn>).mockResolvedValue([cluster]);
    (neo4j.episodic.findCrossSessionPatterns as ReturnType<typeof vi.fn>).mockResolvedValue([sessionCluster]);

    const result = await scanner.run('global');
    // Should only produce 1 proposal, not 2
    expect(result.proposals.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/promotion.test.ts 2>&1 | tail -20`
Expected: FAIL — cannot resolve `../promotion.js`

- [ ] **Step 3: Implement PromotionScanner**

Create `packages/core/src/promotion.ts`:

```typescript
// packages/core/src/promotion.ts
import { nanoid } from 'nanoid';
import type {
  ConsolidationProposal,
  SemanticNode,
  AMPConfig,
  EntityCluster,
  SessionCluster,
  OrphanedEntityEpisode,
  EpisodeClusterItem,
  StalePromotedNode,
} from './types.js';
import { RECENCY_DECAY_DAYS } from './types.js';

// ─── Dependency interfaces ────────────────────────────────────────────────────

export interface PromotionRedisLayer {
  lock: {
    acquire(scope: string, holder: string, ttlSeconds?: number): Promise<boolean>;
    release(scope: string, holder: string): Promise<boolean>;
  };
  proposals: {
    save(proposal: ConsolidationProposal): Promise<void>;
  };
  cache: {
    invalidateByNodeId(nodeId: string): Promise<number>;
  };
}

export interface PromotionNeo4jLayer {
  episodic: {
    findClustersByEntity(minEpisodes: number): Promise<EntityCluster[]>;
    findCrossSessionPatterns(minSessions: number): Promise<SessionCluster[]>;
    findOrphanedEntities(): Promise<OrphanedEntityEpisode[]>;
  };
  semantic: {
    promoteFromEpisodic(episodicId: string, node: SemanticNode): Promise<string>;
    linkToEntity(semanticId: string, entityId: string): Promise<void>;
    findStalePromoted(cutoffDate: string): Promise<StalePromotedNode[]>;
    updateConfidence(id: string, confidence: number): Promise<void>;
    updateDecayClass(id: string, decayClass: string): Promise<void>;
  };
}

export interface PromotionRunResult {
  skipped: boolean;
  reason?: string;
  proposals: ConsolidationProposal[];
  decayed: number;
}

// ─── PromotionScanner ─────────────────────────────────────────────────────────

export class PromotionScanner {
  private readonly lockHolder: string;

  constructor(
    private redis: PromotionRedisLayer,
    private neo4j: PromotionNeo4jLayer,
    private config: AMPConfig,
  ) {
    this.lockHolder = `promotion-scanner-${nanoid(8)}`;
  }

  async run(scope: string): Promise<PromotionRunResult> {
    const acquired = await this.redis.lock.acquire(
      `promotion-${scope}`,
      this.lockHolder,
      120,
    );
    if (!acquired) {
      return { skipped: true, reason: 'lock_held', proposals: [], decayed: 0 };
    }

    try {
      const proposals: ConsolidationProposal[] = [];
      const promotedEntityIds = new Set<string>();

      // Pass 1: Entity clustering
      const entityClusters = await this.neo4j.episodic.findClustersByEntity(
        this.config.promotion.minEpisodes,
      );
      for (const cluster of entityClusters) {
        const proposal = this._buildPromoteProposal(cluster, scope, 0.3, 'stable');
        if (proposal && !promotedEntityIds.has(cluster.entityId)) {
          proposals.push(proposal);
          promotedEntityIds.add(cluster.entityId);
        }
      }

      // Pass 2: Cross-session convergence
      const sessionClusters = await this.neo4j.episodic.findCrossSessionPatterns(
        this.config.promotion.minSessions,
      );
      for (const cluster of sessionClusters) {
        if (promotedEntityIds.has(cluster.entityId)) continue;
        const proposal = this._buildPromoteProposal(cluster, scope, 0.3, 'stable');
        if (proposal) {
          proposals.push(proposal);
          promotedEntityIds.add(cluster.entityId);
        }
      }

      // Pass 3: Cold-start orphans
      if (this.config.promotion.coldStartEnabled) {
        const orphans = await this.neo4j.episodic.findOrphanedEntities();
        for (const orphan of orphans) {
          if (promotedEntityIds.has(orphan.entityId)) continue;
          const proposal = this._buildColdStartProposal(orphan, scope);
          if (proposal) {
            proposals.push(proposal);
            promotedEntityIds.add(orphan.entityId);
          }
        }
      }

      // Save proposals
      for (const proposal of proposals) {
        await this.redis.proposals.save(proposal);
      }

      // Pass 4: Neglect decay
      const decayed = await this._decayStaleNodes();

      return { skipped: false, proposals, decayed };
    } finally {
      await this.redis.lock.release(`promotion-${scope}`, this.lockHolder);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _buildPromoteProposal(
    cluster: EntityCluster | SessionCluster,
    scope: string,
    confidence: number,
    decayClass: SemanticNode['decay_class'],
  ): ConsolidationProposal | null {
    const score = this._scoreCluster(cluster.sessions, cluster.episodes);
    if (score < this.config.promotion.scoreThreshold) return null;

    const bestEpisode = this._selectBestEpisode(cluster.episodes);
    const tags = this._extractTags(bestEpisode.content);

    return {
      id: nanoid(),
      type: 'promote',
      scope,
      affected_ids: cluster.episodes.map(ep => ep.id),
      before: {
        entity_id: cluster.entityId,
        entity_name: cluster.entityName,
        episode_count: cluster.episodes.length,
        session_count: cluster.sessions.length,
        approved_count: cluster.episodes.filter(ep => ep.outcome === 'approved').length,
      },
      after: {
        id: nanoid(),
        content: bestEpisode.content,
        confidence,
        signal_count: 0,
        decay_class: decayClass,
        tags,
      },
      score,
      created_at: new Date().toISOString(),
    };
  }

  private _buildColdStartProposal(
    orphan: OrphanedEntityEpisode,
    scope: string,
  ): ConsolidationProposal | null {
    if (orphan.episodes.length === 0) return null;

    const bestEpisode = this._selectBestEpisode(orphan.episodes);
    const tags = this._extractTags(bestEpisode.content);

    return {
      id: nanoid(),
      type: 'promote',
      scope,
      affected_ids: orphan.episodes.map(ep => ep.id),
      before: {
        entity_id: orphan.entityId,
        entity_name: orphan.entityName,
        episode_count: orphan.episodes.length,
        session_count: 1,
        approved_count: orphan.episodes.filter(ep => ep.outcome === 'approved').length,
      },
      after: {
        id: nanoid(),
        content: bestEpisode.content,
        confidence: 0.2,
        signal_count: 0,
        decay_class: 'volatile' as const,
        tags,
      },
      score: 3, // Cold-start gets minimum passing score
      created_at: new Date().toISOString(),
    };
  }

  private _scoreCluster(sessions: string[], episodes: EpisodeClusterItem[]): number {
    const sessionCount = sessions.length;
    const approvedCount = episodes.filter(ep => ep.outcome === 'approved').length;

    let recencyBonus = 0;
    const now = Date.now();
    const sevenDaysMs = RECENCY_DECAY_DAYS * 86400000;
    const thirtyDaysMs = 30 * 86400000;
    for (const ep of episodes) {
      const ageMs = now - new Date(ep.created_at).getTime();
      if (ageMs < sevenDaysMs) { recencyBonus = 1.0; break; }
      if (ageMs < thirtyDaysMs && recencyBonus < 0.5) { recencyBonus = 0.5; }
    }

    return (sessionCount * 2) + (approvedCount * 3) + recencyBonus;
  }

  private _selectBestEpisode(episodes: EpisodeClusterItem[]): EpisodeClusterItem {
    // Most recent approved episode
    const approved = episodes
      .filter(ep => ep.outcome === 'approved')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (approved.length > 0) return approved[0];

    // Fall back to most recent overall
    const sorted = [...episodes].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return sorted[0];
  }

  private _extractTags(content: string): string[] {
    const tags: string[] = [];
    const projectTagPattern = /\[project:[^\]]+\]/g;
    const matches = content.match(projectTagPattern);
    if (matches) {
      for (const match of matches) {
        tags.push(match.slice(1, -1)); // Remove brackets
      }
    }
    return tags;
  }

  private async _decayStaleNodes(): Promise<number> {
    const cutoff = new Date(Date.now() - RECENCY_DECAY_DAYS * 86400000).toISOString();
    const staleNodes = await this.neo4j.semantic.findStalePromoted(cutoff);
    let decayed = 0;

    for (const node of staleNodes) {
      const newConfidence = node.confidence * 0.95;
      await this.neo4j.semantic.updateConfidence(node.id, newConfidence);
      decayed++;

      if (newConfidence < 0.1 && node.decay_class !== 'volatile') {
        await this.neo4j.semantic.updateDecayClass(node.id, 'volatile');
      }
    }

    return decayed;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/promotion.test.ts 2>&1 | tail -30`
Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/promotion.ts packages/core/src/__tests__/promotion.test.ts
git commit -m "feat(core): add PromotionScanner with entity clustering, cross-session, cold-start, and decay passes"
```

---

### Task 6: Add `promote` Case to ConsolidationEngine

**Files:**
- Modify: `packages/core/src/consolidation.ts:134-140` (expand interface), `packages/core/src/consolidation.ts:313-350` (add promote case)
- Modify: `packages/core/src/__tests__/consolidation.test.ts`

- [ ] **Step 1: Write failing test for promote proposal**

Add to `packages/core/src/__tests__/consolidation.test.ts`, inside the existing `describe('ConsolidationEngine', ...)`:

```typescript
  describe('promote proposal', () => {
    it('applies promote proposal by calling promoteFromEpisodic and linkToEntity', async () => {
      const config = makeConfig(true); // autoApply: true
      const redis = makeRedisLayer();
      const neo4j = makeNeo4jLayer();

      // Mock promoteFromEpisodic and linkToEntity on the neo4j layer
      (neo4j.semantic as Record<string, unknown>).promoteFromEpisodic = vi.fn().mockResolvedValue('sem-new');
      (neo4j.semantic as Record<string, unknown>).linkToEntity = vi.fn().mockResolvedValue(undefined);

      const engine = new ConsolidationEngine(redis, neo4j, config);

      // Feed a promote proposal through the signal/queue path
      // We need to set up signals that won't match existing semantic nodes,
      // so instead test _applyProposal indirectly by putting a proposal in the queue
      // Actually, promote proposals come from PromotionScanner, not from signals.
      // The engine just needs to handle them in _applyProposal.
      // We can test by storing a proposal and then reviewing it.

      const proposal: ConsolidationProposal = {
        id: 'test-promote-001',
        type: 'promote',
        scope: 'global',
        affected_ids: ['ep-1', 'ep-2'],
        before: {
          entity_id: 'ent-1',
          entity_name: 'TestEntity',
          episode_count: 2,
          session_count: 2,
          approved_count: 1,
        },
        after: {
          id: 'sem-promoted',
          content: 'Promoted knowledge from episodes',
          confidence: 0.3,
          signal_count: 0,
          decay_class: 'stable',
          tags: ['test'],
        },
        score: 5.0,
        created_at: new Date().toISOString(),
      };

      // Save and approve the proposal
      await (redis.proposals as { save: ReturnType<typeof vi.fn> }).save(proposal);
      (redis.proposals.get as ReturnType<typeof vi.fn>).mockResolvedValue(proposal);

      const result = await engine.apply('test-promote-001', 'approve');
      expect(result.applied).toBe(true);
      expect(neo4j.semantic.promoteFromEpisodic).toHaveBeenCalledWith(
        'ep-1',
        expect.objectContaining({
          content: 'Promoted knowledge from episodes',
          confidence: 0.3,
          decay_class: 'stable',
        }),
      );
      expect(neo4j.semantic.linkToEntity).toHaveBeenCalled();
    });
  });
```

Note: This test requires the existing mock factory `makeNeo4jLayer` to be updated. Check the existing test file — if `makeNeo4jLayer` exists, add `promoteFromEpisodic` and `linkToEntity` to its `semantic` property. If it uses a different name, adapt accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/consolidation.test.ts 2>&1 | tail -20`
Expected: FAIL — either the mock doesn't have the method or the engine doesn't handle 'promote'.

- [ ] **Step 3: Expand ConsolidationNeo4jLayer interface**

In `packages/core/src/consolidation.ts`, update the interface at line 134:

```typescript
export interface ConsolidationNeo4jLayer {
  semantic: {
    getById(id: string): Promise<SemanticNode | null>;
    updateConfidence(id: string, confidence: number): Promise<void>;
    supersede(oldId: string, newNode: SemanticNode): Promise<string>;
    promoteFromEpisodic(episodicId: string, newNode: SemanticNode): Promise<string>;
    linkToEntity(semanticId: string, entityId: string): Promise<void>;
  };
}
```

- [ ] **Step 4: Add promote case to _applyProposal**

In `packages/core/src/consolidation.ts`, in `_applyProposal` (line 313), add after the `decay` case and before the `return true;`:

```typescript
      } else if (proposal.type === 'promote') {
        const after = proposal.after as Record<string, unknown>;
        const primaryEpisodicId = proposal.affected_ids[0];
        const entityId = (proposal.before as Record<string, unknown>).entity_id as string | undefined;

        const newNode: SemanticNode = {
          id: (after.id as string) ?? nanoid(),
          content: (after.content as string) ?? '',
          confidence: (after.confidence as number) ?? 0.3,
          signal_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          decay_class: (after.decay_class as SemanticNode['decay_class']) ?? 'volatile',
          tags: (after.tags as string[]) ?? [],
        };

        if (primaryEpisodicId) {
          await this.neo4j.semantic.promoteFromEpisodic(primaryEpisodicId, newNode);
        }

        if (entityId) {
          await this.neo4j.semantic.linkToEntity(newNode.id, entityId);
        }

        await this.redis.cache.invalidateByNodeId(newNode.id);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/consolidation.test.ts 2>&1 | tail -20`
Expected: All tests PASS including the new promote test.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/consolidation.ts packages/core/src/__tests__/consolidation.test.ts
git commit -m "feat(core): add promote proposal handling to ConsolidationEngine"
```

---

### Task 7: Add Episodic Fallback to `amp_load`

**Files:**
- Modify: `packages/core/src/service.ts:42-56` (expand Neo4jLayer), `packages/core/src/service.ts:68-130` (load method), `packages/core/src/service.ts:250-276` (renderMarkdown)
- Modify: `packages/core/src/__tests__/service.test.ts`

- [ ] **Step 1: Write failing test for episodic fallback**

Add to `packages/core/src/__tests__/service.test.ts`, inside the existing describe block:

```typescript
  describe('load episodic fallback', () => {
    it('supplements with episodic records when semantic results are sparse', async () => {
      const redis = makeRedisLayer();
      const neo4j = makeNeo4jLayer();
      const embedding = makeEmbedding();
      const config = makeConfig();

      // Semantic returns empty
      (neo4j.query.byScope as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (neo4j.query.byVector as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Episodic returns records
      (neo4j.query as Record<string, unknown>).byEpisodicScope = vi.fn().mockResolvedValue([
        {
          id: 'ep-1', content: 'Episodic knowledge about auth',
          task: 'Fix auth bug', session_id: 'sess-1',
          outcome: 'approved', created_at: new Date().toISOString(),
        },
      ]);

      const service = new AMPService(redis, neo4j, embedding, config);
      const result = await service.load({
        task: 'test task',
        entities: ['AuthModule'],
        max_tokens: 4000,
      });

      expect(result.markdown).toContain('Recent Episodes');
      expect(result.markdown).toContain('Episodic knowledge about auth');
      expect(neo4j.query.byEpisodicScope).toHaveBeenCalledWith(['AuthModule'], 10);
    });

    it('skips episodic fallback when semantic results fill the budget', async () => {
      const redis = makeRedisLayer();
      const neo4j = makeNeo4jLayer();
      const embedding = makeEmbedding();
      const config = makeConfig();

      // Return enough semantic results to fill 25%+ of budget
      const bigNode = makeSemanticNode({
        content: 'A'.repeat(5000), // ~1250 tokens at 4 chars/token
      });
      (neo4j.query.byScope as ReturnType<typeof vi.fn>).mockResolvedValue([bigNode]);
      (neo4j.query.byVector as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (neo4j.query as Record<string, unknown>).byEpisodicScope = vi.fn();

      const service = new AMPService(redis, neo4j, embedding, config);
      await service.load({ task: 'test', max_tokens: 4000 });

      // Should NOT have called episodic fallback
      expect(neo4j.query.byEpisodicScope).not.toHaveBeenCalled();
    });

    it('skips episodic fallback when no entities provided', async () => {
      const redis = makeRedisLayer();
      const neo4j = makeNeo4jLayer();
      const embedding = makeEmbedding();
      const config = makeConfig();

      (neo4j.query.byScope as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (neo4j.query.byVector as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (neo4j.query as Record<string, unknown>).byEpisodicScope = vi.fn();

      const service = new AMPService(redis, neo4j, embedding, config);
      await service.load({ task: 'test', max_tokens: 4000 });

      // No entities to query against
      expect(neo4j.query.byEpisodicScope).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/service.test.ts 2>&1 | tail -20`
Expected: FAIL — `neo4j.query.byEpisodicScope` not called / markdown doesn't contain "Recent Episodes"

- [ ] **Step 3: Expand Neo4jLayer interface**

In `packages/core/src/service.ts`, update the `Neo4jLayer` interface (line 42) to add the episodic query:

```typescript
export interface Neo4jLayer {
  episodic: {
    create(node: EpisodicNode): Promise<string>;
    linkToAgent(episodicId: string, agentId: string): Promise<void>;
    linkToEntity(episodicId: string, entityId: string): Promise<void>;
    linkToModel(episodicId: string, modelId: string): Promise<void>;
    linkSignal(episodicId: string, signal: Signal): Promise<void>;
  };
  query: {
    byScope(scope: { entities?: string[]; tags?: string[]; limit: number }): Promise<SemanticNode[]>;
    byVector(embedding: number[], limit: number): Promise<Array<SemanticNode & { score: number }>>;
    byEpisodicScope(entityNames: string[], limit: number): Promise<Array<{
      id: string; content: string; task: string; session_id: string;
      outcome: string | null; created_at: string;
    }>>;
  };
}
```

- [ ] **Step 4: Add episodic fallback to load()**

In `packages/core/src/service.ts`, in the `load()` method, after the budgeting step (around line 110) and before the `renderMarkdown` call (line 113), add the fallback logic. Replace the section from `// 5. Render markdown` through `const sources`:

```typescript
    // 5. Episodic fallback when semantic results are sparse
    const semanticTokens = budgeted.reduce((sum, m) => sum + m.tokens, 0);
    let episodicSupplement: Array<{
      id: string; content: string; task: string;
      session_id: string; outcome: string | null; created_at: string;
    }> = [];

    if (semanticTokens < maxTokens * 0.25 && scope.entities && scope.entities.length > 0) {
      episodicSupplement = await this.neo4j.query.byEpisodicScope(scope.entities, 10);
      // Budget episodic entries within remaining tokens
      const remainingTokens = maxTokens - semanticTokens;
      const budgetedEpisodic: typeof episodicSupplement = [];
      let usedTokens = 0;
      for (const ep of episodicSupplement) {
        const epTokens = estimateTokens(ep.content);
        if (usedTokens + epTokens > remainingTokens) break;
        budgetedEpisodic.push(ep);
        usedTokens += epTokens;
      }
      episodicSupplement = budgetedEpisodic;
    }

    // 6. Render markdown
    const markdown = renderMarkdown(scope.task, budgeted, episodicSupplement);
    const totalTokens = semanticTokens + episodicSupplement.reduce(
      (sum, ep) => sum + estimateTokens(ep.content), 0,
    );
    const sources = [
      ...budgeted.map((m) => m.id),
      ...episodicSupplement.map((ep) => ep.id),
    ];
```

- [ ] **Step 5: Update renderMarkdown to include episodic section**

Replace the `renderMarkdown` function at line 250 of `packages/core/src/service.ts`:

```typescript
function renderMarkdown(
  task: string,
  memories: Array<SemanticNode & { score: number }>,
  episodic: Array<{
    id: string; content: string; task: string;
    session_id: string; outcome: string | null; created_at: string;
  }> = [],
): string {
  if (memories.length === 0 && episodic.length === 0) {
    return `# Memory Context\n\n_No relevant memories found for task: ${task}_\n`;
  }

  const lines: string[] = [
    `# Memory Context`,
    ``,
    `**Task:** ${task}`,
    ``,
  ];

  for (const m of memories) {
    lines.push(`## [${m.id}] (confidence: ${m.confidence.toFixed(2)}, score: ${m.score.toFixed(3)})`);
    if (m.tags.length > 0) {
      lines.push(`**Tags:** ${m.tags.join(', ')}`);
    }
    lines.push(``);
    lines.push(m.content);
    lines.push(``);
  }

  if (episodic.length > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Recent Episodes (supplementary)`);
    lines.push(``);
    for (const ep of episodic) {
      const outcomeStr = ep.outcome ? `, outcome: ${ep.outcome}` : '';
      lines.push(`### [${ep.id}] (session: ${ep.session_id}${outcomeStr})`);
      lines.push(`**Task:** ${ep.task}`);
      lines.push(``);
      lines.push(ep.content);
      lines.push(``);
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/service.test.ts 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/service.ts packages/core/src/__tests__/service.test.ts
git commit -m "feat(core): add episodic fallback to amp_load when semantic results are sparse"
```

---

### Task 8: Fix Queue Weight in `amp_store`

**Files:**
- Modify: `packages/core/src/service.ts:206`
- Modify: `packages/core/src/__tests__/service.test.ts`

- [ ] **Step 1: Write test for correct signal weighting**

Add to `packages/core/src/__tests__/service.test.ts`:

```typescript
  describe('store signal weighting', () => {
    it('uses SIGNAL_WEIGHTS for queue increment instead of flat 1', async () => {
      const redis = makeRedisLayer();
      const neo4j = makeNeo4jLayer();
      const embedding = makeEmbedding();
      const config = makeConfig();

      const service = new AMPService(redis, neo4j, embedding, config);
      await service.store({
        session_id: 'sess-1',
        agent_id: 'agent-1',
        task: 'test',
        content: 'Signal weight test content',
        signals: [
          { type: 'correction', target_id: 'sem-1', detail: 'Fixed something' },
        ],
      });

      // correction weight = 5.0, not 1
      expect(redis.queue.incrementScore).toHaveBeenCalledWith('sem-1', 5);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/service.test.ts 2>&1 | tail -20`
Expected: FAIL — `incrementScore` called with `1` instead of `5`.

- [ ] **Step 3: Fix the increment**

In `packages/core/src/service.ts`, line 206, change:

```typescript
        await this.redis.queue.incrementScore(signal.target_id, 1);
```

to:

```typescript
        await this.redis.queue.incrementScore(signal.target_id, SIGNAL_WEIGHTS[signal.type] ?? 1);
```

Add the import at the top of `service.ts` if not already present:

```typescript
import { SIGNAL_WEIGHTS } from './types.js';
```

Verify: the existing imports at line 4-14 should already have `Signal` imported but may not have `SIGNAL_WEIGHTS`. Check and add to the import block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/projects/amp && npx vitest run packages/core/src/__tests__/service.test.ts 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/service.ts packages/core/src/__tests__/service.test.ts
git commit -m "fix(core): use SIGNAL_WEIGHTS for consolidation queue increment instead of flat 1"
```

---

### Task 9: Update Barrel Exports

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/neo4j/src/index.ts`

- [ ] **Step 1: Add PromotionScanner exports to core index**

In `packages/core/src/index.ts`, add after line 8 (the ConsolidationEngine exports):

```typescript
export { PromotionScanner } from './promotion.js';
export type { PromotionRedisLayer, PromotionNeo4jLayer, PromotionRunResult } from './promotion.js';
```

- [ ] **Step 2: Verify neo4j/src/index.ts needs no changes**

The `EpisodicStore` and `SemanticStore` are already exported. The new methods are instance methods on those classes, so no new exports needed. The new types (`EntityCluster`, `SessionCluster`, etc.) are exported from `@amp/core` via the `export * from './types.js'` line.

- [ ] **Step 3: Run full test suite to verify nothing is broken**

Run: `cd ~/projects/amp && npx vitest run 2>&1 | tail -30`
Expected: All tests across all packages PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export PromotionScanner from barrel"
```

---

### Task 10: Wire Everything in bootstrap.ts

**Files:**
- Modify: `packages/mcp/src/bootstrap.ts`

- [ ] **Step 1: Add PromotionScanner import**

In `packages/mcp/src/bootstrap.ts`, update the `@amp/core` import (around line 3) to include `PromotionScanner`:

```typescript
import { AMPService, ConsolidationEngine, OpenAIEmbedding, BootstrapGraphService, PromotionScanner } from '@amp/core';
```

- [ ] **Step 2: Add promotion config to the config object**

In `packages/mcp/src/bootstrap.ts`, in the config block (around line 109), add the promotion field:

```typescript
  const config: AMPConfig = {
    redis: { url: redisUrl },
    neo4j: { uri: neo4jUri, user: neo4jUser, password: neo4jPassword },
    embedding: { provider: 'openai', apiKey: openaiKey },
    cache: { defaultTTL: 300, contextTTL: 300, embeddingTTL: 86400 },
    consolidation: { autoApply: false, signalThreshold: 3 },
    exportPath,
    promotion: {
      enabled: true,
      intervalMs: 300_000,
      minEpisodes: 3,
      minSessions: 2,
      coldStartEnabled: true,
      scoreThreshold: 3,
    },
  };
```

- [ ] **Step 3: Expand the consolidation engine wiring to include new semantic methods**

Find the `consolidationEngine` constructor call. The current neo4j layer passed is `{ semantic }`. Update it to include the new methods:

```typescript
  const consolidationEngine = new ConsolidationEngine(
    { lock, signals, queue, cache, proposals },
    { semantic: {
        getById: (id: string) => semantic.getById(id),
        updateConfidence: (id: string, conf: number) => semantic.updateConfidence(id, conf),
        supersede: (oldId: string, newNode) => semantic.supersede(oldId, newNode),
        promoteFromEpisodic: (epId: string, newNode) => semantic.promoteFromEpisodic(epId, newNode),
        linkToEntity: (semId: string, entId: string) => semantic.linkToEntity(semId, entId),
      },
    },
    config,
  );
```

- [ ] **Step 4: Wire the PromotionScanner and scheduler**

Add after the consolidation engine wiring, before the retrieval services section:

```typescript
  // ─── Promotion scanner ─────────────────────────────────────────────────────
  let promotionTimer: ReturnType<typeof setInterval> | null = null;

  if (config.promotion.enabled) {
    const promotionScanner = new PromotionScanner(
      { lock, proposals, cache },
      {
        episodic: {
          findClustersByEntity: (min: number) => episodic.findClustersByEntity(min),
          findCrossSessionPatterns: (min: number) => episodic.findCrossSessionPatterns(min),
          findOrphanedEntities: () => episodic.findOrphanedEntities(),
        },
        semantic: {
          promoteFromEpisodic: (epId: string, node) => semantic.promoteFromEpisodic(epId, node),
          linkToEntity: (semId: string, entId: string) => semantic.linkToEntity(semId, entId),
          findStalePromoted: (cutoff: string) => semantic.findStalePromoted(cutoff),
          updateConfidence: (id: string, conf: number) => semantic.updateConfidence(id, conf),
          updateDecayClass: (id: string, dc: string) => semantic.updateDecayClass(id, dc),
        },
      },
      config,
    );

    promotionTimer = setInterval(() => {
      promotionScanner.run('global').catch(err =>
        console.error('[amp-mcp] Promotion scan failed:', err),
      );
    }, config.promotion.intervalMs);

    console.error(`[amp-mcp] Promotion scanner started (interval: ${config.promotion.intervalMs}ms)`);
  }
```

- [ ] **Step 5: Update AMPService wiring to pass byEpisodicScope**

Find the `ampService` constructor call. The current neo4j layer is `{ episodic, query: scopedQuery }`. Update the query layer:

```typescript
  const ampService = new AMPService(
    { cache, embeddings, dedup, signals, queue },
    {
      episodic,
      query: {
        byScope: (scope) => scopedQuery.byScope(scope),
        byVector: (emb, limit) => scopedQuery.byVector(emb, limit),
        byEpisodicScope: (names, limit) => scopedQuery.byEpisodicScope(names, limit),
      },
    },
    embedding,
    config,
  );
```

- [ ] **Step 6: Update shutdown handler**

Update the return block:

```typescript
  return {
    async shutdown() {
      if (promotionTimer) clearInterval(promotionTimer);
      try { await redis.quit(); } catch { /* already closed */ }
      try { await driver.close(); } catch { /* already closed */ }
    },
  };
```

- [ ] **Step 7: Build and verify**

Run: `cd ~/projects/amp && npx tsc -b tsconfig.build.json --noEmit 2>&1 | tail -20`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/src/bootstrap.ts
git commit -m "feat(mcp): wire PromotionScanner with scheduler and episodic fallback in bootstrap"
```

---

### Task 11: Deploy and Verify on Cerebro

**Files:** None (operational verification)

- [ ] **Step 1: Restart the AMP service**

```bash
sudo systemctl restart amp-mcp
sudo journalctl -u amp-mcp --no-pager -n 20
```

Expected output should include:
- `[amp-mcp] All services initialized — fully operational`
- `[amp-mcp] Promotion scanner started (interval: 300000ms)`

- [ ] **Step 2: Manually trigger a promotion scan**

Use the MCP tool: `amp_consolidate(action: "run")` or call directly:

```bash
curl -X POST http://localhost:3101/... # (via MCP SSE)
```

Or trigger from Claude Code by calling `amp_consolidate({ action: "run" })`.

- [ ] **Step 3: Check the graph for new semantic nodes**

```cypher
MATCH (s:Semantic)-[:PROMOTED_FROM]->(ep:Episodic) RETURN s.id, s.content, s.confidence, ep.id LIMIT 20
```

- [ ] **Step 4: Verify amp_load now returns episodic fallback**

Call `amp_load({ task: "test", entities: ["some-entity"], max_tokens: 4000 })` and verify the markdown includes a "Recent Episodes" section if semantic results are sparse.

- [ ] **Step 5: Check consolidation status**

Call `amp_consolidate({ action: "status" })` and verify any pending promotion proposals show up.

- [ ] **Step 6: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: deployment adjustments for promotion engine"
```
