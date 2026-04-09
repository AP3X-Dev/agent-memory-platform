# AMP Roadmap: Temporal Facts + Memory Tiers

> **Source:** Competitive gap analysis against Zep/Graphiti (temporal truth) and Letta (agent ergonomics), April 2026.

## Problem Statement

AMP is strong as a substrate but has two product gaps:

1. **Temporal memory depth** — No single temporal truth model. Episodic + semantic accumulate but don't answer "what is true now?" vs "what was true then?" vs "what changed?" Zep/Graphiti exploit this with explicit fact validity windows and time-aware retrieval.

2. **Agent-facing ergonomics** — No clear memory hierarchy visible to agents. Letta wins here with always-visible core memory, searchable archive, and explicit edit tools. AMP feels like a powerful graph, not a usable memory interface.

## Competitive Reference

| System | Temporal Edge | Ergonomic Edge |
|--------|--------------|----------------|
| **Zep/Graphiti** | Facts on edges with valid_at/invalid_at, time-stamped episodes, automatic invalidation | Weaker — graph-first, not agent-first |
| **Letta/MemGPT** | Weaker — block-based, no temporal graph | Core memory (always visible, editable) + archival (searchable). Agent has explicit memory tools. |
| **AMP (current)** | Provenance, signals, decay, promotion — ingredients exist but no unified temporal model | 29 tools, powerful but opaque. No "what does the agent see?" story. |

## Phase 1: High ROI (2-4 weeks)

### 1A. Temporal Fact Layer

Add a `Fact` node type to the graph with explicit temporal validity:

```typescript
interface Fact {
  id: string;
  subject: string;           // entity name
  predicate: string;         // "prefers", "uses", "depends_on", "located_at"
  object: string;            // value or entity
  source_episode_ids: string[];
  valid_at: string;          // ISO timestamp — when this became true
  invalid_at: string | null; // ISO timestamp — when this stopped being true (null = active)
  confidence: number;
  status: 'active' | 'invalidated' | 'disputed' | 'tentative';
  supersedes_fact_id: string | null;
  scope: 'user' | 'project' | 'repo' | 'agent' | 'session';
  created_at: string;
  updated_at: string;
}
```

**Graph relationships:**
- `FACT_ABOUT` — Fact → Entity
- `SOURCED_FROM` — Fact → Episodic
- `SUPERSEDES` — Fact → Fact
- `PROMOTED_TO_FACT` — Semantic → Fact (when consolidation produces structured claims)

**Contradiction → state transition:**
When a new episode contradicts an existing active fact:
1. Mark old fact: `status = 'invalidated'`, `invalid_at = new_fact.valid_at`
2. Create new fact: `supersedes_fact_id = old_fact.id`
3. Link via `SUPERSEDES` edge
4. Preserve both for auditability

**Consolidation integration:**
- PromotionScanner gains a `factExtraction` pass
- When a promoted semantic node is structured (subject-predicate-object extractable), also create a Fact
- Existing semantic layer stays — facts are a parallel retrieval surface, not a replacement

### 1B. Time-Aware Retrieval

Add temporal parameters to retrieval tools:

```typescript
interface TemporalOptions {
  time_mode: 'current' | 'historical' | 'interval' | 'evolution';
  as_of?: string;        // ISO timestamp
  from?: string;         // interval start
  to?: string;           // interval end
  include_invalidated?: boolean;  // default false
}
```

**New tools:**
- `amp_timeline(entity)` — chronological fact/episode history for an entity
- `amp_fact_diff(entity, from, to)` — what changed between two timestamps

**Modified tools:**
- `amp_load(..., as_of?, time_mode?)` — filter by temporal validity
- `amp_context(..., as_of?, time_mode?)` — same

**Default behavior:** `time_mode: 'current'` returns only active facts. Existing behavior preserved when temporal params omitted.

### 1C. Memory Tiers

Expose AMP's internals as three agent-facing tiers:

| Tier | Visibility | Mutability | Content |
|------|-----------|------------|---------|
| **Core Memory** | Always included in context | Agent-editable via tools | User profile, current task, active hypotheses, commitments |
| **Working Memory** | Session-scoped, included by default | Agent-editable | Subgoals, open questions, active files, current plan |
| **Archive Memory** | Searchable on demand | Append-only (store, not edit) | Episodes, semantics, facts, docs, experiments, code symbols |

**Implementation:**
- Core Memory = named blocks stored as special Entity nodes with `tier: 'core'`
- Working Memory = session-scoped blocks, Redis-backed for speed, promoted to archive on session end
- Archive Memory = existing episodic/semantic/fact graph

**Default blocks:**
- `persona` — agent identity and capabilities
- `user` — user profile, preferences, role
- `current_objective` — what the agent is working on
- `working_state` — scratchpad, partial results, current branch
- `project_state` — project conventions, active decisions
- `open_questions` — unresolved items needing attention

### 1D. Memory Edit Tools

```
amp_memory_read(block)                    — read a core/working memory block
amp_memory_insert(block, text)            — append to a block
amp_memory_replace(block, old, new)       — find-and-replace within a block
amp_memory_rewrite(block, content)        — overwrite a block entirely
amp_memory_promote(item, from, to)        — move between tiers
amp_memory_archive(item_id)              — move to archive
```

These give agents deterministic handles and give developers transparent inspection.

## Phase 2: Usability (4-8 weeks)

- Memory cockpit / inspect view (what does the agent believe?)
- Timeline and fact-diff visualization
- Agent templates (research_agent, coding_agent, assistant_agent)
- Active fact summaries in retrieval responses
- Archive/core promotion rules
- Temporal compaction job (merge duplicate facts, surface disputes)

## Phase 3: Defensibility (8-12 weeks)

- Temporal benchmark suite (current-state recall, historical recall, contradiction handling)
- Public eval harness
- Demo scenarios (preference changes, architectural evolution, conflicting evidence)
- One-page memory tier + truth state documentation

## If You Only Do Three Things

1. **Add active/inactive/disputed temporal facts** with `valid_at` / `invalid_at`
2. **Expose memory as core, working, and archive** with editable blocks
3. **Ship one inspectable "current truth vs history" demo and benchmark**

## Design Decisions Still Open

- Should facts be nodes or edges? Nodes are more queryable; edges are more natural for subject-predicate-object triples. Recommendation: nodes, with FACT_ABOUT edges to entities.
- Should core memory blocks be stored in Neo4j or Redis? Neo4j for durability and graph connections; Redis for session-scoped working memory.
- How does fact extraction interact with existing auto-extraction? Extend the existing GPT-4o-mini extractor to also produce structured facts when the content supports it.
- Should `amp_load` default to `time_mode: 'current'` or maintain backward compatibility? Default to current, add `include_all: true` for backward compat.
