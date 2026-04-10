---
name: amp
description: "Agent Memory Protocol — persistent memory, architectural understanding, code intelligence, and unified retrieval via a Neo4j knowledge graph. 25 MCP tools across 5 domains. Use autonomously during all coding work: load memory at session start, recall context before modifying code, store decisions and learnings, use architectural context when planning."
---

# AMP — Agent Memory Protocol

Persistent memory system for AI agents. 25 MCP tools across 5 domains: Core Memory, Architecture, Code Intelligence, Research, and Unified Retrieval. Knowledge compounds across sessions — the agent on day 10 starts with everything it learned on days 1-9.

## Quickstart — 5 Rules

1. **Load before working.** Call `amp_load` or `amp_context` at session start.
2. **Store after deciding.** Call `amp_store` when decisions, preferences, bugs, or conventions emerge.
3. **Scope with project tags.** Every load/store includes `project:<name>` in tags/content.
4. **Link to entities.** Every store includes relevant entity names so episodes connect to the graph.
5. **Be silent.** Don't narrate AMP usage. Just use it. Only mention memory when it changes your recommendation.

---

## Decision Tree — Which Tool?

```
What do you need?
│
├─ General context for a task ──────────── amp_context (super-load, blends all sources)
│
├─ Memory specifically
│  ├─ Load relevant memories ────────────── amp_load
│  ├─ Store a decision/learning ─────────── amp_store
│  ├─ Ad-hoc graph query ────────────────── amp_query
│  ├─ Resolve amp:// URI ────────────────── amp_resolve
│  └─ Consolidation ─────────────────────── amp_consolidate
│
├─ Code search / symbols
│  ├─ Find implementations ──────────────── amp_code_search
│  ├─ List symbols in a file ────────────── amp_code_symbols
│  ├─ Who calls / imports X? ────────────── amp_code_deps
│  ├─ Code context for a task ───────────── amp_code_context
│  └─ Index a project ──────────────────── amp_code_index
│
├─ Architecture
│  ├─ Context for an entity ─────────────── amp_arch_context
│  ├─ What breaks if X changes? ─────────── amp_impact
│  ├─ Register entity details ───────────── amp_arch_register
│  ├─ Create entity relationships ───────── amp_arch_relate
│  ├─ Cross-cutting concerns ────────────── amp_arch_aspect
│  └─ Drift detection ──────────────────── amp_arch_drift
│
└─ Research experiments
   ├─ Start a campaign ──────────────────── amp_research_init
   ├─ Log an experiment ─────────────────── amp_research_log
   ├─ Research context (THINK phase) ────── amp_research_context
   ├─ Hypothesis tree ───────────────────── amp_research_tree
   ├─ Find contradictions ───────────────── amp_research_contradictions
   └─ Consolidate patterns ──────────────── amp_research_consolidate
```

---

## Autonomous Workflows

These are not slash commands. Follow these rules automatically during normal work.

### Session Start

1. Check for `## AMP Memory` config in the project's agent config file (CLAUDE.md, .cursorrules, AGENTS.md, etc.). If missing, bootstrap it — scan the repo and call `amp_bootstrap`.
2. Generate `session_id`: `session-{YYYYMMDD}-{HHMMSS}`. Reuse for all stores this session.
3. Load memory:
   ```
   amp_context(task: "<user's request>", project_name: "<project>", max_tokens: 8000)
   ```
   Or if `amp_context` is unavailable:
   ```
   amp_load(task: "<user's request>", tags: ["project:<tag>"], max_tokens: 4000)
   ```
4. Let loaded memory silently inform your work.

### Before Modifying Code

When changing code in a module you haven't touched this session:
- Load context: `amp_arch_context(entity_name: "<module>")` for architecture, or `amp_code_context(task: "modifying <module>")` for relevant symbols.
- Check for: conventions, past decisions, known gotchas, architectural constraints.
- Apply silently. Only surface memory when it changes your approach.

### During Debugging

- Load context for the affected area before diving in.
- AMP may know: past bugs with similar symptoms, root causes, fragile components.
- Check blast radius: `amp_impact(entity_name: "<affected module>")`.
- After resolution, store the root cause.

### When Planning / Making Decisions

- Load architecture context: `amp_arch_context(entity_name: "<module>")`.
- Check for prior decisions, stated preferences, conventions, past attempts.
- Cite memory when relevant: "The project uses X pattern for this kind of thing."

### During Code Review

- Load conventions and past decisions for touched modules.
- Check changes against established patterns.
- Flag violations with context.

### Automatic Storing

Store to AMP whenever any of these happen — don't ask, just store:

| Trigger | What to store |
|---------|--------------|
| Decision made | Decision, rationale, alternatives considered |
| User corrected approach | The correction as a preference/convention |
| User stated preference | The preference with context |
| Bug found and fixed | Symptom, root cause, fix, insight |
| Convention established | The rule, scope, and why |
| Architecture pattern chosen | The pattern, tradeoffs, constraints |

```
amp_store(
  session_id: "<id>",
  task: "[project:<tag>] <category>: <brief>",
  content: "[project:<tag>] <prose — the why, not the what>",
  outcome: "approved",
  entities: ["<project>", "<affected modules>"],
  signals: [<if confirming/correcting existing knowledge>]
)
```

Don't store: routine edits, things derivable from code/git, raw code blocks, ephemeral debug state.

### Session End / Handoff

- Store a session summary: what was accomplished, key decisions, open items.
- If spawning sub-agents, include relevant AMP context in their prompts.
- Check consolidation: `amp_consolidate(action: "status")`. If 10+ unprocessed episodes, run it.

---

## Tool Reference — Core Memory (6 tools)

### amp_load

Load assembled memory context. Returns ranked markdown: semantic knowledge + episodic records.

```json
{
  "task": "implementing auth middleware",
  "entities": ["auth-module", "middleware"],
  "tags": ["project:my-api", "auth"],
  "max_tokens": 4000
}
```

### amp_store

Store an episodic memory. Returns episode ID.

```json
{
  "session_id": "session-20260328-140000",
  "task": "[project:my-api] decision: chose JWT over sessions",
  "content": "[project:my-api] Decided to use JWT for auth. Rationale: stateless for horizontal scaling. Sessions would require sticky routing or shared store.",
  "outcome": "approved",
  "entities": ["my-api", "auth-module"],
  "signals": [
    { "type": "reinforcement", "target_id": "amp-sem-xyz", "detail": "JWT pattern confirmed" }
  ]
}
```

**Signal types:** `reinforcement` (confirmed), `correction` (partially outdated), `contradiction` (fundamentally wrong).
**Outcome values:** `approved`, `revised`, `rejected`, `abandoned`.

### amp_query

Read-only Cypher against Neo4j. Write operations are blocked.

```json
{
  "query": "MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: 'auth-module'}) RETURN s.content, s.confidence ORDER BY s.confidence DESC",
  "limit": 10
}
```

### amp_consolidate

Manage memory consolidation — promotes recurring patterns to semantic knowledge.

```json
{ "action": "status" }
{ "action": "run", "scope": "project:my-api" }
{ "action": "review", "proposal_id": "prop-xyz", "decision": "approve" }
```

### amp_resolve

Resolve `amp://` URIs to rendered markdown. For MWP workspace integration.

```json
{ "uri": "amp://entity/ClientX", "stage_context": "writing brand copy", "max_tokens": 2000 }
```

### amp_bootstrap

One-time project setup. Creates Entity nodes, Agent nodes, seed Semantic nodes, and relationships. Idempotent.

```json
{
  "project_name": "my-api",
  "project_tag": "project:my-api",
  "description": "REST API for the storefront",
  "domain": "e-commerce",
  "entities": [
    { "name": "my-api", "type": "project", "description": "Main API service" },
    { "name": "auth-module", "type": "module", "description": "JWT auth", "parent": "my-api" },
    { "name": "orders", "type": "module", "description": "Order processing", "parent": "my-api" }
  ],
  "semantic_seeds": [
    { "claim": "API uses Express with TypeScript", "domain": "architecture", "confidence": 0.3, "about": ["my-api"] }
  ],
  "agents": [{ "id": "mcp", "name": "Claude Code", "type": "assistant" }]
}
```

---

## Tool Reference — Unified Retrieval (2 tools)

### amp_context

The "super-load" — blends architecture + code + memory into one response. Use this as your default context loader.

```json
{
  "task": "refactoring the order pipeline",
  "strategy": "auto",
  "include_code": true,
  "include_arch": true,
  "include_memory": true,
  "max_tokens": 8000,
  "entity_scope": ["orders"],
  "tag_scope": ["project:my-api"],
  "project_name": "my-api"
}
```

Strategies: `auto` (default — classifies intent and routes), `ranked` (hybrid search with RRF fusion), `deterministic` (5-step assembly).

### amp_feedback

Record whether retrieval results were useful. Improves future rankings.

```json
{
  "result_id": "sem-abc123",
  "was_useful": true,
  "session_id": "session-20260328-140000",
  "query": "auth middleware implementation",
  "source_type": "semantic"
}
```

---

## Tool Reference — Code Intelligence (5 tools)

### amp_code_index

AST-based indexing. Creates Symbol nodes and relationship edges. Run once per project or after significant changes.

```json
{
  "path": "/absolute/path/to/project",
  "mode": "project",
  "exclude": ["node_modules", "dist"]
}
```

Supports: TypeScript, JavaScript, Python, Go, Rust.

### amp_code_search

Hybrid search across code symbols and semantic memories. Combines fulltext + vector + RRF fusion.

```json
{
  "query": "authentication middleware",
  "language": "typescript",
  "kind": "function",
  "limit": 20,
  "include_semantics": true
}
```

### amp_code_symbols

Query specific symbols by file path or name.

```json
{ "file_path": "src/auth/middleware.ts" }
{ "name": "validateToken", "kind": "function" }
```

### amp_code_deps

Symbol-level dependency queries — callers, callees, importers, inheritance.

```json
{ "symbol_name": "validateToken", "direction": "callers" }
{ "symbol_name": "BaseController", "direction": "inheritance" }
```

### amp_code_context

Build code-aware context for a task. Returns relevant symbols + semantic memories, ranked and token-budgeted.

```json
{ "task": "add rate limiting to the auth endpoint", "max_tokens": 6000 }
```

---

## Tool Reference — Architecture (6 tools)

### amp_arch_register

Enrich an entity with architectural properties. Idempotent.

```json
{
  "entity_name": "auth-module",
  "category": "module",
  "depth": 2,
  "responsibility": "Handles JWT authentication and authorization",
  "interface_desc": "verifyToken(req) -> User | throws 401. authorize(roles) -> middleware",
  "internals": "Uses jose library for JWT verification. Tokens cached in Redis for 5min.",
  "file_paths": ["src/auth/middleware.ts", "src/auth/jwt.ts"]
}
```

### amp_arch_relate

Create typed structural relationships between entities.

```json
{ "from_entity": "api-routes", "to_entity": "auth-module", "type": "USES" }
{ "from_entity": "auth-module", "to_entity": "redis-cache", "type": "CALLS" }
```

Types: `USES`, `CALLS`, `EXTENDS`, `IMPLEMENTS`, `EMITS`, `LISTENS`.

### amp_arch_aspect

Manage cross-cutting concerns (rate-limiting, audit-logging, HIPAA, etc.).

```json
{ "action": "create", "name": "rate-limiting", "description": "All public endpoints must enforce rate limits", "stability_tier": "protocol" }
{ "action": "apply", "name": "rate-limiting", "entity_name": "api-routes" }
{ "action": "list" }
```

Stability tiers: `schema` (never changes), `protocol` (rarely changes), `implementation` (changes freely).

### amp_impact

Blast radius analysis — what breaks if this entity changes?

```json
{ "entity_name": "auth-module" }
```

Returns: direct dependents, transitive dependents, co-aspect entities, affected aspects, risk assessment.

### amp_arch_drift

SHA-256 drift detection — has code changed since last indexing?

```json
{ "action": "check", "entity_name": "auth-module" }
{ "action": "check_all", "project_name": "my-api" }
{ "action": "list_stale" }
{ "action": "mark_fresh", "entity_name": "auth-module" }
```

### amp_arch_context

Deterministic architectural context assembly for an entity.

```json
{ "entity_name": "auth-module", "max_tokens": 6000, "include_children": true }
```

Returns: responsibility, interface, internals, hierarchy, children, dependencies with interfaces, dependents, aspects.

---

## Tool Reference — Research (6 tools)

For autonomous experiment campaigns. See the amp-researcher skill for the full protocol.

### amp_research_init

Initialize a campaign. Returns `campaign_id` used by all subsequent calls.

```json
{
  "campaign_name": "reduce-p99-latency",
  "objective": "Reduce API p99 latency below 100ms",
  "metric_name": "p99_ms",
  "metric_direction": "lower",
  "run_command": "npm run bench",
  "measure_command": "cat bench.json | jq '.p99'"
}
```

### amp_research_log

Log an experiment result with full provenance.

```json
{
  "campaign_id": "20260328-reduce-p99-latency",
  "session_id": "session-abc",
  "experiment_number": 5,
  "branch": "research/reduce-p99",
  "parent_id": "exp-abc123",
  "commit": "a1b2c3d",
  "metric_value": 87.3,
  "status": "keep",
  "duration_s": 45,
  "hypothesis": "Connection pooling reduces cold connection overhead",
  "description": "Added pg-pool with max 20 connections",
  "insight": "p99 dropped 13ms — cold connections were significant"
}
```

Status: `keep`, `discard`, `crash`, `thought`, `keep*`, `interesting`, `timeout`.

### amp_research_context

Dynamic context for the THINK phase. Returns campaign state, semantic principles, wins, dead ends, contradictions.

```json
{ "campaign_id": "20260328-reduce-p99-latency", "max_tokens": 4000 }
```

### amp_research_tree

Visualize the hypothesis tree.

```json
{ "campaign_id": "20260328-reduce-p99-latency" }
{ "campaign_id": "20260328-reduce-p99-latency", "status": "keep" }
```

### amp_research_contradictions

Find conflicting semantic principles.

```json
{ "campaign_id": "20260328-reduce-p99-latency", "include_uncertain": true }
```

### amp_research_consolidate

Detect patterns across experiments and promote to semantic knowledge.

```json
{ "campaign_id": "20260328-reduce-p99-latency" }
```

---

## Project Setup

Every project needs an `## AMP Memory` section in its agent config. If missing, bootstrap it:

1. Scan the repo — package.json, README, source tree, git log
2. Call `amp_bootstrap` with discovered entities
3. Write the config section:

```markdown
## AMP Memory

Project: <name>
Description: <one-line>
Domain: <domain>
Project Tag: project:<kebab-case-name>

Entities:
- <entity-1>
- <entity-2>

Tags:
- <tag-1>
- <tag-2>

Priors:
- <foundational observation>
```

---

## Memory Signals

When your work confirms or contradicts existing knowledge, include signals in your store:

- **Reinforcement** — existing knowledge held true. `{ "type": "reinforcement", "target_id": "<id>", "detail": "..." }`
- **Correction** — knowledge is partially outdated. `{ "type": "correction", "target_id": "<id>", "detail": "..." }`
- **Contradiction** — knowledge is fundamentally wrong. `{ "type": "contradiction", "target_id": "<id>", "detail": "..." }`

Only signal against entries you received from `amp_load`. Never fabricate target IDs. No matching entry? Store without signals.

---

## Common Cypher Patterns

```cypher
-- All entities in a project
MATCH (p:Entity {type: 'project', name: 'my-api'})-[:CONTAINS*]->(e) RETURN e.name, e.type

-- High-confidence knowledge
MATCH (s:Semantic) WHERE s.confidence >= 0.7 RETURN s.content, s.confidence ORDER BY s.confidence DESC

-- What do we know about X?
MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: 'auth-module'}) RETURN s.content, s.confidence

-- Recent sessions
MATCH (ep:Episodic) RETURN ep.task, ep.content, ep.timestamp ORDER BY ep.timestamp DESC LIMIT 10

-- Find contradictions
MATCH (s1:Semantic)-[:CONTRADICTS]->(s2:Semantic) RETURN s1.content, s2.content

-- Entity dependencies
MATCH (e:Entity {name: 'auth-module'})-[r]->(dep:Entity) RETURN type(r), dep.name, dep.type
```

---

## Best Practices

1. **Prefer `amp_context` over `amp_load`** when you need code + architecture + memory blended together.
2. **Use `amp_arch_context` for planning** — it gives you the full structural picture of a module.
3. **Use `amp_code_search` over grep** when you need semantic understanding, not just text matching.
4. **Run `amp_code_index` once** when first working with a project, then re-index after significant changes.
5. **Check `amp_arch_drift` periodically** to know if your architectural model is stale.
6. **Use `amp_impact` before risky changes** to understand the blast radius.
7. **Store what would be lost** if someone only read the commit. The decision, the tradeoff, the context.
8. **Write prose, not code.** AMP stores reasoning and decisions, not implementations.
9. **Project tags are mandatory.** Every load/store includes `project:<name>`.
10. **Entity linking is mandatory.** Every store includes entity names. Without them, episodes are orphaned.
