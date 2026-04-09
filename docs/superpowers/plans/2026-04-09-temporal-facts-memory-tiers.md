# Phase 1 Implementation Plan: Temporal Facts + Memory Tiers

> **Spec:** `docs/superpowers/specs/2026-04-09-temporal-facts-memory-tiers.md`
> **Goal:** Add temporal fact layer with validity windows + three-tier memory model with agent-editable blocks.

**Architecture:** Two parallel workstreams that converge at the retrieval layer.

- **Workstream A (Temporal Facts):** Fact node type → FactStore → fact extraction in consolidation → time-aware queries → new MCP tools
- **Workstream B (Memory Tiers):** MemoryBlock type → BlockStore (Redis + Neo4j) → tier-aware load → memory edit MCP tools

**Tech Stack:** TypeScript, Neo4j (Cypher), Redis, Zod, vitest, nanoid

---

## Workstream A: Temporal Facts

### Task 1: Add Fact types to `@amp/core`

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add Fact interfaces**

Add after the SemanticNode interface in `packages/core/src/types.ts`:

```typescript
// === Temporal Facts ===

export type FactStatus = 'active' | 'invalidated' | 'disputed' | 'tentative';
export type FactScope = 'user' | 'project' | 'repo' | 'agent' | 'session';

export interface FactNode {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  source_episode_ids: string[];
  valid_at: string;           // ISO timestamp
  invalid_at: string | null;  // null = currently active
  confidence: number;
  status: FactStatus;
  supersedes_fact_id: string | null;
  scope: FactScope;
  embedding?: number[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FactInput {
  subject: string;
  predicate: string;
  object: string;
  source_episode_ids: string[];
  valid_at?: string;           // defaults to now
  confidence?: number;         // defaults to 0.5
  scope?: FactScope;           // defaults to 'project'
  tags?: string[];
}

export interface TemporalOptions {
  time_mode?: 'current' | 'historical' | 'interval' | 'evolution';
  as_of?: string;              // ISO timestamp
  from?: string;               // interval start
  to?: string;                 // interval end
  include_invalidated?: boolean; // default false
}

export interface FactDiff {
  entity: string;
  from: string;
  to: string;
  added: FactNode[];
  invalidated: FactNode[];
  changed: Array<{ before: FactNode; after: FactNode }>;
}

export interface FactTimeline {
  entity: string;
  facts: Array<FactNode & { event: 'created' | 'invalidated' | 'disputed' | 'superseded'; at: string }>;
}
```

- [ ] **Step 2: Export from barrel**

In `packages/core/src/index.ts`, add exports for all new types.

**Test:** `npm run build` succeeds. Existing tests unaffected.

---

### Task 2: Add Fact schema and FactStore to `@amp/neo4j`

**Files:**
- Modify: `packages/neo4j/src/schema.ts`
- Create: `packages/neo4j/src/fact.ts`
- Modify: `packages/neo4j/src/index.ts`

- [ ] **Step 1: Add Fact node schema**

In `packages/neo4j/src/schema.ts`, add to `initSchema()`:

```typescript
// Fact node
await session.run('CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.id IS UNIQUE');
await session.run('CREATE INDEX fact_status_valid IF NOT EXISTS FOR (f:Fact) ON (f.status, f.valid_at)');
await session.run('CREATE INDEX fact_subject IF NOT EXISTS FOR (f:Fact) ON (f.subject)');
await session.run('CREATE INDEX fact_scope IF NOT EXISTS FOR (f:Fact) ON (f.scope)');
await session.run(`CREATE FULLTEXT INDEX fact_content IF NOT EXISTS FOR (f:Fact) ON EACH [f.subject, f.predicate, f.object]`);
```

Add vector index for Fact embeddings (same pattern as Semantic/Episodic).

- [ ] **Step 2: Implement FactStore**

Create `packages/neo4j/src/fact.ts`:

```typescript
export class FactStore {
  constructor(private driver: Driver) {}

  async create(fact: FactNode): Promise<string>
  // CREATE (f:Fact {id, subject, predicate, object, ...})
  // Link SOURCED_FROM → Episodic for each source_episode_id
  // Link FACT_ABOUT → Entity (MERGE on subject name)

  async getById(id: string): Promise<FactNode | null>

  async getActive(entityName: string, options?: TemporalOptions): Promise<FactNode[]>
  // WHERE f.status = 'active' AND (f.invalid_at IS NULL OR f.invalid_at > $now)
  // If as_of: WHERE f.valid_at <= $as_of AND (f.invalid_at IS NULL OR f.invalid_at > $as_of)

  async invalidate(id: string, invalidAt: string, supersededById?: string): Promise<void>
  // SET f.status = 'invalidated', f.invalid_at = $invalidAt, f.updated_at = $now
  // If supersededById: CREATE (new)-[:SUPERSEDES_FACT]->(old)

  async dispute(id: string): Promise<void>
  // SET f.status = 'disputed', f.updated_at = $now

  async timeline(entityName: string): Promise<FactTimeline>
  // MATCH (f:Fact)-[:FACT_ABOUT]->(e:Entity {name: $name})
  // RETURN f ORDER BY f.valid_at ASC
  // Map each fact to timeline event based on status transitions

  async diff(entityName: string, from: string, to: string): Promise<FactDiff>
  // Query facts active at $from vs facts active at $to
  // Compute added/invalidated/changed sets

  async findBySubjectPredicate(subject: string, predicate: string): Promise<FactNode[]>
  // For dedup: find existing facts with same subject+predicate that are active

  async setEmbedding(id: string, embedding: number[]): Promise<void>
  // Same pattern as SemanticStore
}
```

- [ ] **Step 3: Export from barrel**

Add to `packages/neo4j/src/index.ts`.

**Test:** Unit tests in `packages/neo4j/src/__tests__/fact.test.ts` — mock driver, verify Cypher queries and parameter mapping. Test: create, getActive with temporal options, invalidate with supersession, timeline ordering, diff computation.

---

### Task 3: Add temporal queries to ScopedQuery

**Files:**
- Modify: `packages/neo4j/src/query.ts`

- [ ] **Step 1: Add fact-aware query methods**

```typescript
async byFacts(entityName: string, options?: TemporalOptions): Promise<FactNode[]>
// Default (current): status = 'active' AND invalid_at IS NULL
// historical: valid_at <= as_of AND (invalid_at IS NULL OR invalid_at > as_of)
// interval: valid_at <= to AND (invalid_at IS NULL OR invalid_at > from)
// evolution: all facts ordered by valid_at, include invalidated

async byEntityWithFacts(entityName: string, options?: TemporalOptions): Promise<{
  semantics: SemanticNode[];
  facts: FactNode[];
  episodes: EpisodicNode[];
}>
// Combined query for full entity context including temporal facts
```

- [ ] **Step 2: Add TemporalOptions to byScope**

Extend `byScope()` to accept optional `TemporalOptions`. When present, filter semantic results by temporal validity of linked facts.

**Test:** Unit tests verifying correct Cypher generation for each time_mode.

---

### Task 4: Fact extraction in consolidation pipeline

**Files:**
- Modify: `packages/core/src/consolidation.ts`
- Modify: `packages/core/src/extract.ts`

- [ ] **Step 1: Add fact extraction to extract.ts**

Add a new function alongside the existing entity/claim extractors:

```typescript
export async function extractFacts(
  content: string,
  apiKey: string
): Promise<FactInput[]>
```

Uses the existing OpenAI integration pattern. Prompt asks GPT-4o-mini to extract structured subject-predicate-object triples from prose. Return empty array on parse failure (same defensive pattern as existing extractors).

Add Zod schema for the LLM response shape.

- [ ] **Step 2: Add fact promotion to ConsolidationEngine**

When a `promote` proposal is applied and the semantic content is structured enough:
1. Call `extractFacts()` on the promoted semantic's content
2. For each extracted fact:
   - Check if an active fact with same subject+predicate exists
   - If yes and content differs: invalidate old fact, create new with `supersedes_fact_id`
   - If yes and content matches: reinforce (update confidence)
   - If no: create new fact with `status: 'tentative'`
3. Link new facts `SOURCED_FROM` the source episodic nodes

This plugs into the existing `_applyProposal()` method's `promote` case.

- [ ] **Step 3: Add contradiction → invalidation transition**

When a `contradiction` signal is processed in `_generateProposals()`:
1. Find active facts linked to the target semantic
2. Mark them as `disputed` (not immediately invalidated — let consolidation decide)
3. When the superseding semantic is promoted, the old facts get properly invalidated

**Test:** Unit tests for fact extraction (mock OpenAI), contradiction-to-invalidation flow, dedup logic.

---

### Task 5: Integrate facts into AMPService.load()

**Files:**
- Modify: `packages/core/src/service.ts`
- Modify: `packages/core/src/ranking.ts`

- [ ] **Step 1: Add TemporalOptions to LoadScope**

```typescript
export interface LoadScope {
  task: string;
  entities?: string[];
  tags?: string[];
  max_tokens?: number;
  temporal?: TemporalOptions;  // NEW
}
```

- [ ] **Step 2: Query facts in load()**

After the existing semantic + episodic queries, add a fact query:
```typescript
const facts = await this.neo4j.fact.getActive(entityName, scope.temporal);
```

- [ ] **Step 3: Render facts in context markdown**

Add a "Current Facts" section to the rendered markdown, before semantic knowledge:

```markdown
## Current Facts
- **[subject]** [predicate] **[object]** (confidence: 0.85, since: 2026-03-15)
- **[subject]** [predicate] **[object]** (confidence: 0.72, since: 2026-04-01)
```

For `time_mode: 'evolution'`, render as timeline instead.

- [ ] **Step 4: Extend ranking to include facts**

In `packages/core/src/ranking.ts`, add fact scoring:
- Active facts get a base score boost (they represent consolidated truth)
- Temporal recency uses `valid_at` instead of `created_at`
- Disputed facts get a penalty multiplier

**Test:** Integration test: store episodes → run consolidation → verify facts appear in load() output. Test temporal filtering modes.

---

### Task 6: Add temporal MCP tools

**Files:**
- Modify: `packages/mcp/src/tools.ts`
- Modify: `packages/mcp/src/bootstrap.ts`

- [ ] **Step 1: Add TemporalOptions to amp_load schema**

Extend the existing `amp_load` Zod schema:

```typescript
temporal: z.object({
  time_mode: z.enum(['current', 'historical', 'interval', 'evolution']).optional(),
  as_of: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  include_invalidated: z.boolean().optional(),
}).optional(),
```

- [ ] **Step 2: Add amp_timeline tool**

```typescript
// amp_timeline — Chronological fact/episode history for an entity
args: {
  entity: z.string().max(200),
  include_episodes: z.boolean().optional(), // default false
  limit: z.number().max(100).optional(),
}
returns: FactTimeline as rendered markdown
```

- [ ] **Step 3: Add amp_fact_diff tool**

```typescript
// amp_fact_diff — What changed about an entity between two timestamps
args: {
  entity: z.string().max(200),
  from: z.string(), // ISO timestamp
  to: z.string(),   // ISO timestamp
}
returns: FactDiff as rendered markdown
```

- [ ] **Step 4: Wire FactStore in bootstrap.ts**

```typescript
const factStore = new FactStore(driver);
// Pass to AMPService, ConsolidationEngine, and tool handlers
```

- [ ] **Step 5: Add TemporalOptions to amp_context**

Extend the `amp_context` tool in the retrieval package to accept and forward temporal options.

**Test:** Tool schema validation tests. End-to-end test: store → consolidate → query timeline.

---

## Workstream B: Memory Tiers

### Task 7: Add MemoryBlock types to `@amp/core`

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add memory tier types**

```typescript
// === Memory Tiers ===

export type MemoryTier = 'core' | 'working' | 'archive';

export interface MemoryBlock {
  id: string;
  name: string;              // 'persona', 'user', 'current_objective', etc.
  tier: MemoryTier;
  content: string;
  scope: string;             // project tag or 'global'
  agent_id?: string;         // which agent owns this block (for working memory)
  session_id?: string;       // session scope (for working memory)
  max_tokens?: number;       // soft limit for the block
  created_at: string;
  updated_at: string;
}

export interface MemoryBlockInput {
  name: string;
  tier: MemoryTier;
  content: string;
  scope: string;
  agent_id?: string;
  session_id?: string;
  max_tokens?: number;
}

export const DEFAULT_BLOCKS: Array<{ name: string; tier: MemoryTier; description: string }> = [
  { name: 'persona', tier: 'core', description: 'Agent identity and capabilities' },
  { name: 'user', tier: 'core', description: 'User profile, preferences, role' },
  { name: 'current_objective', tier: 'core', description: 'What the agent is working on' },
  { name: 'working_state', tier: 'working', description: 'Scratchpad, partial results, current branch' },
  { name: 'project_state', tier: 'core', description: 'Project conventions, active decisions' },
  { name: 'open_questions', tier: 'working', description: 'Unresolved items needing attention' },
];
```

- [ ] **Step 2: Export from barrel**

**Test:** Build succeeds, existing tests unaffected.

---

### Task 8: Add BlockStore to `@amp/redis` and `@amp/neo4j`

**Files:**
- Create: `packages/redis/src/blocks.ts`
- Create: `packages/neo4j/src/blocks.ts`
- Modify: `packages/redis/src/index.ts`
- Modify: `packages/neo4j/src/index.ts`
- Modify: `packages/neo4j/src/schema.ts`

- [ ] **Step 1: Redis BlockStore (hot tier — core + working)**

```typescript
// packages/redis/src/blocks.ts
export class BlockStore {
  constructor(private redis: Redis) {}

  // Key: amp:block:{scope}:{name}
  // Working memory key: amp:block:{scope}:{session_id}:{name}

  async get(scope: string, name: string, sessionId?: string): Promise<MemoryBlock | null>
  async set(block: MemoryBlock): Promise<void>
  // Pipeline: SET key JSON, SET TTL (working = 24h, core = no TTL)

  async list(scope: string, tier?: MemoryTier, sessionId?: string): Promise<MemoryBlock[]>
  // SCAN amp:block:{scope}:* with optional tier filter

  async delete(scope: string, name: string, sessionId?: string): Promise<void>

  async replaceContent(scope: string, name: string, oldText: string, newText: string): Promise<MemoryBlock>
  // GET → string replace → SET (atomic via WATCH/MULTI if needed)
}
```

- [ ] **Step 2: Neo4j BlockStore (durable persistence for core blocks)**

```typescript
// packages/neo4j/src/blocks.ts
export class BlockStore {
  constructor(private driver: Driver) {}

  async save(block: MemoryBlock): Promise<void>
  // MERGE (b:MemoryBlock {scope: $scope, name: $name})
  // SET b.content = $content, b.tier = $tier, ...

  async get(scope: string, name: string): Promise<MemoryBlock | null>
  async list(scope: string, tier?: MemoryTier): Promise<MemoryBlock[]>
  async delete(scope: string, name: string): Promise<void>
}
```

- [ ] **Step 3: Add MemoryBlock schema**

In `packages/neo4j/src/schema.ts`:

```typescript
await session.run('CREATE CONSTRAINT memblock_scope_name IF NOT EXISTS FOR (b:MemoryBlock) REQUIRE (b.scope, b.name) IS UNIQUE');
```

**Test:** Unit tests for both stores. Test Redis TTL behavior for working vs core. Test Neo4j MERGE upsert behavior.

---

### Task 9: Add MemoryBlockService to `@amp/core`

**Files:**
- Create: `packages/core/src/blocks.ts`

- [ ] **Step 1: Implement MemoryBlockService**

```typescript
export class MemoryBlockService {
  constructor(
    private redisBlocks: RedisBlockStore,
    private neo4jBlocks: Neo4jBlockStore,
  ) {}

  async read(scope: string, name: string, sessionId?: string): Promise<MemoryBlock | null>
  // Try Redis first (hot), fall back to Neo4j (durable)

  async insert(scope: string, name: string, text: string, sessionId?: string): Promise<MemoryBlock>
  // Append text to existing block content. Create block if it doesn't exist.
  // Write to Redis always. Write to Neo4j if tier = 'core'.

  async replace(scope: string, name: string, oldText: string, newText: string, sessionId?: string): Promise<MemoryBlock>
  // Find-and-replace within block content.
  // Throws if oldText not found.

  async rewrite(scope: string, name: string, content: string, sessionId?: string): Promise<MemoryBlock>
  // Overwrite entire block content.

  async promote(scope: string, name: string, fromTier: MemoryTier, toTier: MemoryTier): Promise<MemoryBlock>
  // Change tier. If promoting to archive, also store as episodic via AMPService.store().
  // If promoting from working to core, persist to Neo4j.

  async archive(scope: string, name: string, sessionId?: string): Promise<string>
  // Convert block content to an episodic memory, delete the block.
  // Returns the episode ID.

  async listBlocks(scope: string, tier?: MemoryTier, sessionId?: string): Promise<MemoryBlock[]>
  // Combined list from Redis + Neo4j, deduplicated by name (Redis wins for freshness).

  async initDefaults(scope: string): Promise<void>
  // Create DEFAULT_BLOCKS if they don't exist for this scope.
}
```

- [ ] **Step 2: Export from barrel**

**Test:** Unit tests with mocked Redis/Neo4j stores. Test read-through behavior, promotion logic, archive-to-episodic conversion.

---

### Task 10: Integrate memory tiers into AMPService.load()

**Files:**
- Modify: `packages/core/src/service.ts`

- [ ] **Step 1: Include core memory blocks in load() output**

After assembling semantic + episodic + fact context, prepend core memory blocks:

```typescript
const coreBlocks = await this.blocks.listBlocks(projectTag, 'core');
const workingBlocks = await this.blocks.listBlocks(projectTag, 'working', sessionId);
```

Render as the first section of the context markdown:

```markdown
## Core Memory
### persona
<block content>

### user
<block content>

### current_objective
<block content>

## Working Memory
### working_state
<block content>

## Current Facts
...

## Semantic Knowledge
...
```

Core + working memory blocks are always included (not subject to token budgeting — they are the "always visible" tier). Archive is budgeted as before.

- [ ] **Step 2: Add session_id to LoadScope**

```typescript
export interface LoadScope {
  task: string;
  entities?: string[];
  tags?: string[];
  max_tokens?: number;
  temporal?: TemporalOptions;
  session_id?: string;         // NEW — for working memory scope
}
```

**Test:** Verify core blocks appear first in load() output. Verify working blocks scoped to session. Verify archive budgeting unchanged.

---

### Task 11: Add memory edit MCP tools

**Files:**
- Modify: `packages/mcp/src/tools.ts`
- Modify: `packages/mcp/src/bootstrap.ts`

- [ ] **Step 1: Add amp_memory_read tool**

```typescript
args: {
  block: z.string().max(100),
  scope: z.string().max(200).optional(), // defaults to project tag
  session_id: z.string().max(200).optional(),
}
returns: block content as markdown, or "Block not found"
```

- [ ] **Step 2: Add amp_memory_insert tool**

```typescript
args: {
  block: z.string().max(100),
  text: z.string().max(5000),
  scope: z.string().max(200).optional(),
  session_id: z.string().max(200).optional(),
}
returns: updated block content
```

- [ ] **Step 3: Add amp_memory_replace tool**

```typescript
args: {
  block: z.string().max(100),
  old_text: z.string().max(5000),
  new_text: z.string().max(5000),
  scope: z.string().max(200).optional(),
  session_id: z.string().max(200).optional(),
}
returns: updated block content, or error if old_text not found
```

- [ ] **Step 4: Add amp_memory_rewrite tool**

```typescript
args: {
  block: z.string().max(100),
  content: z.string().max(10000),
  scope: z.string().max(200).optional(),
  session_id: z.string().max(200).optional(),
}
returns: updated block content
```

- [ ] **Step 5: Add amp_memory_promote tool**

```typescript
args: {
  block: z.string().max(100),
  from_tier: z.enum(['working', 'core', 'archive']),
  to_tier: z.enum(['working', 'core', 'archive']),
  scope: z.string().max(200).optional(),
  session_id: z.string().max(200).optional(),
}
returns: confirmation with new tier
```

- [ ] **Step 6: Add amp_memory_archive tool**

```typescript
args: {
  block: z.string().max(100),
  scope: z.string().max(200).optional(),
  session_id: z.string().max(200).optional(),
}
returns: episode ID of the archived content
```

- [ ] **Step 7: Wire MemoryBlockService in bootstrap.ts**

```typescript
const redisBlockStore = new RedisBlockStore(redis);
const neo4jBlockStore = new Neo4jBlockStore(driver);
const blockService = new MemoryBlockService(redisBlockStore, neo4jBlockStore);
// Pass to tool handlers
```

**Test:** Tool schema validation. End-to-end: create block → read → insert → replace → promote → archive → verify episodic created.

---

## Integration & Testing

### Task 12: Integration tests

**Files:**
- Create: `packages/core/src/__tests__/facts.test.ts`
- Create: `packages/core/src/__tests__/blocks.test.ts`

- [ ] **Step 1: Fact lifecycle integration test**

Test the full flow with mocked stores:
1. Store 3 episodes about entity "auth-module" mentioning "JWT"
2. Run consolidation → verify promote proposal
3. Apply promote → verify fact extracted with subject="auth-module", predicate="uses", object="JWT"
4. Store episode contradicting JWT → "switched to OAuth2"
5. Run consolidation → verify contradiction signal
6. Apply → verify old fact invalidated, new fact created with supersedes_fact_id
7. Call load() with time_mode='current' → only OAuth2 fact
8. Call load() with time_mode='historical', as_of=before_change → JWT fact
9. Call timeline() → shows both facts with transitions

- [ ] **Step 2: Memory block lifecycle test**

Test the full flow:
1. Init default blocks for project scope
2. Read 'persona' block → verify default content
3. Insert text into 'user' block
4. Replace text in 'user' block
5. Rewrite 'current_objective' block
6. Create 'working_state' block in working tier with session_id
7. Call load() → verify core blocks in output, working blocks scoped to session
8. Promote 'working_state' from working to core
9. Archive old 'current_objective' → verify episodic created
10. List blocks → verify correct tier assignments

- [ ] **Step 3: Update existing tests**

Any test that calls `makeConfig()` or constructs AMPService may need updating if constructor signatures change. Use the same pattern as Task 1 from the original optimizer plan — add the new dependencies as optional or with defaults.

**Test:** `npm test` — full suite passes.

---

### Task 13: Update CLAUDE.md and tool documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Fact and MemoryBlock tools to the quick reference table**

| Need | Tool |
|------|------|
| **Read/edit memory blocks** | `amp_memory_read`, `amp_memory_insert`, `amp_memory_replace`, `amp_memory_rewrite` |
| **Promote/archive memory** | `amp_memory_promote`, `amp_memory_archive` |
| **Entity fact timeline** | `amp_timeline` |
| **Fact changes over time** | `amp_fact_diff` |
| **Time-scoped retrieval** | `amp_load(..., temporal: { time_mode, as_of })` |

- [ ] **Step 2: Update tool count and schema docs**

Update "29 tools" references to reflect the new count. Add temporal and memory block sections to the autonomous behavior instructions.

- [ ] **Step 3: Add memory tier guidance to autonomous behavior**

```
### Session Start
4. (NEW) Read core memory blocks — they contain always-visible state
5. (NEW) Initialize working memory for this session

### During Work
- (NEW) Update working_state block as context changes
- (NEW) When user states a preference, update the 'user' core memory block

### Session End
- (NEW) Promote valuable working memory to core or archive
- (NEW) Clean up session-scoped working blocks
```

---

## Dependency Order

```
Task 1 (types)
  ├── Task 2 (FactStore) ──── Task 3 (temporal queries)
  │                                    │
  │                           Task 4 (fact extraction)
  │                                    │
  │                           Task 5 (load integration) ─── Task 6 (MCP tools)
  │
  ├── Task 7 (block types)
  │     │
  │     Task 8 (BlockStore) ─── Task 9 (BlockService)
  │                                    │
  │                            Task 10 (load integration) ── Task 11 (MCP tools)
  │
  └── Task 12 (integration tests) ─── Task 13 (docs)
```

**Parallelism:** Tasks 2-6 (facts) and Tasks 7-11 (blocks) can be developed in parallel after Task 1. Task 12 depends on both workstreams. Task 13 can start once tool schemas are defined.

## Estimated Scope

- **New files:** 6 (fact.ts × 2, blocks.ts × 3, blocks service)
- **Modified files:** ~10 (types, schema, service, consolidation, extract, ranking, tools, bootstrap, query, CLAUDE.md)
- **New tests:** ~4 test files
- **New MCP tools:** 8 (timeline, fact_diff, memory_read/insert/replace/rewrite/promote/archive)
- **Modified MCP tools:** 2 (amp_load, amp_context gain temporal params)
