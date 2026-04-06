# AMP Promotion Engine — Design Spec

**Date:** 2026-04-05
**Status:** Approved
**Approach:** Deterministic rule-based (Approach B — Separate Scanner + Load Fallback)

---

## Problem

AMP has 157 episodic records and only 2 semantic nodes. The consolidation engine only operates on existing semantic nodes — it can supersede and decay them, but never promotes episodic records into new semantic knowledge. The ProposalType includes `promote` and `promoteFromEpisodic()` exists in SemanticStore, but neither is wired into any code path. Additionally, `amp_load` only queries Semantic nodes, making all episodic records invisible to agents.

## Solution

Two components:

1. **PromotionScanner** — A new class that periodically scans episodic records, identifies clusters worth promoting, and generates `promote` proposals.
2. **Episodic fallback in amp_load** — When semantic results are sparse, supplement with recent episodic records so agents are not blind while the semantic layer is thin.

---

## Component 1: PromotionScanner

### Location

`packages/core/src/promotion.ts`

### Scanning Strategy

Three passes per run, executed sequentially:

#### Pass 1: Entity Clustering

Query episodic nodes grouped by the entities they REFERENCES. When 3+ episodes from different sessions reference the same entity, flag that cluster for promotion.

Cypher pattern:

    MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
    WITH e, collect(ep) AS episodes, collect(DISTINCT ep.session_id) AS sessions
    WHERE size(episodes) >= $minEpisodes
    RETURN e.id AS entityId, e.name AS entityName, episodes, sessions

#### Pass 2: Cross-Session Convergence

Find entities referenced by episodes from 2+ distinct sessions where at least one episode has an `approved` outcome.

Cypher pattern:

    MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
    WITH e, collect(ep) AS episodes, collect(DISTINCT ep.session_id) AS sessions
    WHERE size(sessions) >= $minSessions
    AND any(ep IN episodes WHERE ep.outcome = 'approved')
    RETURN e.id AS entityId, e.name AS entityName, episodes, sessions

#### Pass 3: Cold-Start Orphans

Find entities that have REFERENCES relationships from episodes but zero ABOUT relationships from semantic nodes. Even a single approved episode qualifies.

Cypher pattern:

    MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
    WHERE ep.outcome = 'approved'
    AND NOT EXISTS { MATCH (:Semantic)-[:ABOUT]->(e) }
    RETURN e.id AS entityId, e.name AS entityName, collect(ep) AS episodes

### Deduplication

Before generating a proposal, check whether a Semantic node already has a PROMOTED_FROM relationship to any episode in the cluster. Skip clusters that have already been promoted.

### Promotion Scoring

    score = (session_count * 2) + (approved_count * 3) + recency_bonus

- `session_count`: distinct sessions contributing to the cluster
- `approved_count`: episodes with outcome = 'approved'
- `recency_bonus`: 1.0 if any episode < 7 days old, 0.5 if < 30 days, 0.0 otherwise

Clusters scoring at or above `scoreThreshold` (default: 3) generate a promote proposal.

### Semantic Node Synthesis

Deterministic, no LLM:

- **content**: Content of the highest-scored episode in the cluster (by recency + outcome). Preserves original prose rather than attempting lossy summarization.
- **tags**: Union of project tags extracted from episode content (any `[project:*]` prefixes) plus entity-derived tags.
- **confidence**: 0.5 for multi-session clusters, 0.3 for cold-start singles.
- **decay_class**: `stable` for multi-session, `volatile` for cold-start singles.
- **signal_count**: 0 (fresh node, no signals yet).

### Proposal Structure

    {
      id: nanoid(),
      type: 'promote',
      scope: 'global',
      affected_ids: [episodicId1, episodicId2, ...],  // source episodes
      before: {
        entity_id: '...',
        entity_name: '...',
        episode_count: 5,
        session_count: 3,
        approved_count: 2,
      },
      after: {
        id: nanoid(),
        content: '...',
        confidence: 0.5,
        signal_count: 0,
        decay_class: 'stable',
        tags: ['project:oni-core', 'auth'],
      },
      score: 11.0,
      created_at: new Date().toISOString(),
    }

### Dependencies

    interface PromotionRedisLayer {
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

    interface PromotionNeo4jLayer {
      episodic: {
        findClustersByEntity(minEpisodes: number): Promise<EntityCluster[]>;
        findCrossSessionPatterns(minSessions: number): Promise<SessionCluster[]>;
        findOrphanedEntities(): Promise<OrphanedEntityEpisode[]>;
      };
      semantic: {
        promoteFromEpisodic(episodicId: string, node: SemanticNode): Promise<string>;
        linkToEntity(semanticId: string, entityId: string): Promise<void>;
      };
    }

### Locking

Uses the existing DistributedLock with scope `promotion-scanner` to prevent concurrent runs. Lock TTL: 120 seconds (same as consolidation).

---

## Component 2: Episodic Fallback in amp_load

### Location

`packages/core/src/service.ts` (modify `AMPService.load()`)
`packages/neo4j/src/query.ts` (add `byEpisodicScope()` to `ScopedQuery`)

### Trigger Condition

After semantic ranking and budgeting, if the total budgeted tokens are less than 25% of `max_tokens`, query episodic records to fill remaining budget.

### Episodic Query

New method `ScopedQuery.byEpisodicScope()`:

    MATCH (ep:Episodic)-[:REFERENCES]->(e:Entity)
    WHERE e.name IN $entities
    RETURN ep.id AS id, ep.content AS content, ep.task AS task,
           ep.session_id AS session_id, ep.outcome AS outcome,
           ep.created_at AS created_at
    ORDER BY ep.created_at DESC
    LIMIT 10

When no entities are specified but tags are present, fall back to fulltext search on episodic content for tag keywords.

### Scoring

Episodic records get a base relevance score of 0.3, ensuring they always rank below semantic nodes. Within episodic results, rank by recency.

### Rendering

Episodic records render in a clearly labeled section after semantic results:

    # Memory Context

    **Task:** ...

    ## [sem-abc] (confidence: 0.85, score: 0.912)
    **Tags:** project:oni-core, auth
    Semantic content here...

    ---

    ## Recent Episodes (supplementary)

    ### [ep-xyz] (session: oni-code-phase2, outcome: approved)
    **Task:** Refactored auth middleware...
    Episodic content here...

### Budget

Episodic supplement is capped at `remaining_tokens = max_tokens - semantic_tokens`. If semantic results already fill the budget, no episodic query runs.

---

## Component 3: Engine Wiring

### ConsolidationEngine Changes

Add a `promote` case to `_applyProposal()` in `packages/core/src/consolidation.ts`. The promote case:

1. Extracts the new SemanticNode from `proposal.after`
2. Gets the primary episodic ID from `proposal.affected_ids[0]`
3. Gets the entity ID from `proposal.before.entity_id`
4. Calls `semantic.promoteFromEpisodic()` to create the node with PROMOTED_FROM relationship
5. Calls `semantic.linkToEntity()` to create the ABOUT relationship
6. Invalidates affected caches

### ConsolidationNeo4jLayer Interface Expansion

Add `promoteFromEpisodic` and `linkToEntity` to the semantic sub-interface so the engine can execute promote proposals.

### Config Additions

Added to AMPConfig:

    promotion: {
      enabled: boolean;          // default: true
      intervalMs: number;        // default: 300_000 (5 min)
      minEpisodes: number;       // default: 3
      minSessions: number;       // default: 2
      coldStartEnabled: boolean; // default: true
      scoreThreshold: number;    // default: 3
    }

### Scheduler in bootstrap.ts

Create the PromotionScanner after all services are built. Start a setInterval that calls `promotionScanner.run('global')` every `config.promotion.intervalMs` milliseconds. Add cleanup to the shutdown handler.

### Queue Weight Fix (Bonus)

In `AMPService.store()`, change the flat `incrementScore(target_id, 1)` to use `SIGNAL_WEIGHTS[signal.type]` (correction: 5, contradiction: 3, reinforcement: 1) so the consolidation queue accurately reflects signal importance.

---

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `packages/core/src/promotion.ts` | New | PromotionScanner class |
| `packages/core/src/types.ts` | Modify | Add promotion config, cluster types |
| `packages/core/src/consolidation.ts` | Modify | Add promote case, expand interface |
| `packages/core/src/service.ts` | Modify | Episodic fallback in load(), fix queue weight |
| `packages/core/src/index.ts` | Modify | Export PromotionScanner |
| `packages/neo4j/src/episodic.ts` | Modify | Add promotion query methods |
| `packages/neo4j/src/query.ts` | Modify | Add byEpisodicScope() |
| `packages/neo4j/src/index.ts` | Modify | Export new methods |
| `packages/mcp/src/bootstrap.ts` | Modify | Wire scanner, interval, shutdown, pass semantic to consolidation |

---

## Future Enhancement: LLM-Powered Synthesis

Not in this implementation. When added later, it would replace the highest-scored episode content synthesis with an LLM call that reads all episodes in a cluster and generates a distilled semantic claim. The scanner infrastructure stays the same — only the content generation step changes.

---

## Testing Strategy

1. **Unit tests for PromotionScanner** — Mock Neo4j/Redis layers, verify correct proposal generation for each pass (entity clustering, cross-session, cold-start).
2. **Integration test** — Seed Neo4j with episodic records across multiple sessions/entities, run the scanner, verify semantic nodes are created with correct relationships.
3. **Load fallback test** — Verify that amp_load returns episodic records when semantic results are sparse, and stops returning them when semantic coverage is sufficient.
4. **Scheduler test** — Verify the interval fires and the lock prevents concurrent runs.
