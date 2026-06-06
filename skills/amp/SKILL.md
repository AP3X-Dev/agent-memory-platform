---
name: amp
description: "Agent Memory Protocol — persistent memory with progressive tool disclosure, temporal facts, memory tiers, architectural understanding, code intelligence, and unified retrieval via a Neo4j knowledge graph. 7 always-visible tools + 9 on-demand domains. Use autonomously during all coding work: load memory at session start, recall context before modifying code, store decisions and learnings, use architectural context when planning."
---

# AMP — Agent Memory Protocol

Persistent memory system for AI agents. Knowledge compounds across sessions — the agent on day 10 starts with everything it learned on days 1-9.

## Progressive Disclosure

AMP uses progressive disclosure to avoid overwhelming agents with 48 tools at once. **7 tools are always visible** (Tier 1). All other tools are grouped into **9 on-demand domains** that must be enabled before use.

### Always-Visible Tools (Tier 1)

| Tool | Purpose |
|------|---------|
| `amp_load` | Load memory context (accepts temporal param for time-aware retrieval) |
| `amp_store` | Store episodic memory with signals |
| `amp_memory_read` | Read memory blocks from a tier (core/working/archive) |
| `amp_memory_insert` | Insert or append to a memory block |
| `amp_grep` | Search memory by text pattern (exact or regex) across all node types |
| `amp_context` | Super-load: blends architecture + code + memory |
| `amp_tools` | Enable/disable/list on-demand tool domains |

These 7 tools cover session start, storing decisions, searching memory, and reading/writing blocks — the most common operations.

### On-Demand Domains

Call `amp_tools(action: "enable", domain: "<name>")` to activate a domain's tools. Call `amp_tools(action: "list")` to see what is currently enabled.

| Domain | Tools (count) | When to enable |
|--------|---------------|----------------|
| `memory` | `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive` (4) | Session end — promoting/archiving memory blocks |
| `temporal` | `amp_timeline`, `amp_fact_diff` (2) | Investigating fact history or change tracking |
| `admin` | `amp_query`, `amp_consolidate`, `amp_bootstrap`, `amp_resolve`, `amp_ingest_codebase`, `amp_provenance` (6) | Graph queries, project setup, codebase ingestion, provenance tracing |
| `research` | `amp_research_init`, `amp_research_log`, `amp_research_context`, `amp_research_tree`, `amp_research_contradictions`, `amp_research_consolidate` (6) | Experiment campaigns |
| `code` | `amp_code_index`, `amp_code_search`, `amp_code_ast_grep`, `amp_code_symbols`, `amp_code_deps`, `amp_code_context`, `amp_code_watch` (7) | Code search, structural AST search, symbol lookup, dependency analysis, auto-reindex |
| `arch` | `amp_arch_register`, `amp_arch_relate`, `amp_arch_aspect`, `amp_impact`, `amp_arch_drift`, `amp_arch_context` (6) | Architecture context, blast radius, drift detection |
| `wiki` | `amp_compile`, `amp_ingest`, `amp_lint`, `amp_braindump`, `amp_wiki_sync` (5) | Wiki compilation, source/document ingestion, health checks, human brain dumps, editable round-trip |
| `retrieval` | `amp_feedback` (1) | Recording retrieval usefulness for ranking improvement |
| `graph` | `amp_graph_report`, `amp_graph_export`, `amp_pr_impact`, `amp_pr_conflicts` (4) | Deterministic graph audits, portable/interactive graph export, GitHub PR blast-radius and conflict analysis |

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
├─ General context for a task ──────────── amp_context [always visible]
│
├─ Enable a tool domain ────────────────── amp_tools [always visible]
│
├─ Memory specifically
│  ├─ Load relevant memories ────────────── amp_load [always visible]
│  ├─ Search by text/regex ──────────────── amp_grep [always visible]
│  ├─ Store a decision/learning ─────────── amp_store [always visible]
│  ├─ Ad-hoc graph query ────────────────── amp_query [enable: admin]
│  ├─ Resolve amp:// URI ────────────────── amp_resolve [enable: admin]
│  ├─ Consolidation ─────────────────────── amp_consolidate [enable: admin]
│  └─ Trace knowledge lifecycle ─────────── amp_provenance [enable: admin]
│
├─ Temporal facts
│  ├─ Fact history for an entity ────────── amp_timeline [enable: temporal]
│  └─ What changed between dates ────────── amp_fact_diff [enable: temporal]
│
├─ Memory tiers (core / working / archive)
│  ├─ Read blocks from a tier ───────────── amp_memory_read [always visible]
│  ├─ Insert/append to a block ──────────── amp_memory_insert [always visible]
│  ├─ Replace content in a block ────────── amp_memory_replace [enable: memory]
│  ├─ Full rewrite of a block ──────────── amp_memory_rewrite [enable: memory]
│  ├─ Move block between tiers ──────────── amp_memory_promote [enable: memory]
│  └─ Archive a block ──────────────────── amp_memory_archive [enable: memory]
│
├─ Code search / symbols
│  ├─ Find implementations ──────────────── amp_code_search [enable: code]
│  ├─ Structural AST pattern search ─────── amp_code_ast_grep [enable: code]
│  ├─ List symbols in a file ────────────── amp_code_symbols [enable: code]
│  ├─ Who calls / imports X? ────────────── amp_code_deps [enable: code]
│  ├─ Code context for a task ───────────── amp_code_context [enable: code]
│  ├─ Index a project ──────────────────── amp_code_index [enable: code]
│  └─ Auto-reindex on file change ───────── amp_code_watch [enable: code]
│
├─ Architecture
│  ├─ Context for an entity ─────────────── amp_arch_context [enable: arch]
│  ├─ What breaks if X changes? ─────────── amp_impact [enable: arch]
│  ├─ Register entity details ───────────── amp_arch_register [enable: arch]
│  ├─ Create entity relationships ───────── amp_arch_relate [enable: arch]
│  ├─ Cross-cutting concerns ────────────── amp_arch_aspect [enable: arch]
│  └─ Drift detection ──────────────────── amp_arch_drift [enable: arch]
│
├─ Research experiments
│  ├─ Start a campaign ──────────────────── amp_research_init [enable: research]
│  ├─ Log an experiment ─────────────────── amp_research_log [enable: research]
│  ├─ Research context (THINK phase) ────── amp_research_context [enable: research]
│  ├─ Hypothesis tree ───────────────────── amp_research_tree [enable: research]
│  ├─ Find contradictions ───────────────── amp_research_contradictions [enable: research]
│  └─ Consolidate patterns ──────────────── amp_research_consolidate [enable: research]
│
├─ Wiki / knowledge base
│  ├─ Compile graph into wiki ───────────── amp_compile [enable: wiki]
│  ├─ Ingest source documents ──────────── amp_ingest [enable: wiki]
│  ├─ Capture a human brain dump ────────── amp_braindump [enable: wiki]
│  ├─ Reconcile edited wiki page ────────── amp_wiki_sync [enable: wiki]
│  └─ Graph health checks ──────────────── amp_lint [enable: wiki]
│
└─ Graph analytics
   ├─ Deterministic graph audit ─────────── amp_graph_report [enable: graph]
   ├─ Export JSON / interactive HTML map ── amp_graph_export [enable: graph]
   ├─ Blast radius of a GitHub PR ───────── amp_pr_impact [enable: graph]
   └─ Find PR pairs that conflict ───────── amp_pr_conflicts [enable: graph]
```

---

## Autonomous Workflows

These are not slash commands. Follow these rules automatically during normal work.

### Session Start

1. Check for `## AMP Memory` config in the project's agent config file (CLAUDE.md, .cursorrules, AGENTS.md, etc.). If missing, enable the `admin` domain (`amp_tools(action: "enable", domain: "admin")`), then bootstrap — scan the repo and call `amp_bootstrap`.
2. Generate `session_id`: `session-{YYYYMMDD}-{HHMMSS}`. Reuse for all stores this session.
3. Load task-specific memory — this **automatically includes the core blocks** (persona, user, project_state), so no separate read step is needed:
   ```
   amp_context(task: "<user's request>", project_name: "<project>", max_tokens: 8000)
   ```
   Or if `amp_context` is unavailable:
   ```
   amp_load(task: "<user's request>", tags: ["project:<tag>"], max_tokens: 4000)
   ```
4. To re-read one specific block later, name it explicitly (there is no "read whole tier" call):
   ```
   amp_memory_read(block: "user", scope: "project:<tag>")
   ```
5. Let loaded memory silently inform your work.

**No domain enablement needed at session start.** All tools used here (`amp_context`, `amp_load`, `amp_memory_read`) are Tier 1 (always visible).

### Before Modifying Code

When changing code in a module you haven't touched this session:
- Enable the needed domain first:
  ```
  amp_tools(action: "enable", domain: "arch")   // for architecture context
  amp_tools(action: "enable", domain: "code")   // for code symbols/search
  ```
- Load context: `amp_arch_context(entity_name: "<module>")` for architecture, or `amp_code_context(task: "modifying <module>")` for relevant symbols.
- Check for: conventions, past decisions, known gotchas, architectural constraints.
- Apply silently. Only surface memory when it changes your approach.

### During Debugging

- Load context for the affected area before diving in.
- AMP may know: past bugs with similar symptoms, root causes, fragile components.
- Enable arch domain for blast radius: `amp_tools(action: "enable", domain: "arch")`, then `amp_impact(entity_name: "<affected module>")`.
- After resolution, store the root cause (`amp_store` — always visible).

### When Planning / Making Decisions

- Enable arch domain: `amp_tools(action: "enable", domain: "arch")`.
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

### Memory Tier Management

During a session, use the memory tier tools to maintain structured state. Note that `amp_memory_read` and `amp_memory_insert` are always visible, but `amp_memory_replace`, `amp_memory_promote`, and `amp_memory_archive` require enabling the `memory` domain first.

Every memory-block call takes a `block` name and an optional `scope` (the project tag). Working-tier blocks also take `session_id`. There is no `tier` parameter — a block's tier is fixed by the block, and `amp_memory_promote` is what moves it between tiers.

| When | Action | Domain |
|------|--------|--------|
| Session start | Core blocks arrive automatically in `amp_load`/`amp_context`; to re-read one: `amp_memory_read(block: "user", scope: "project:<tag>")` | always visible |
| During work | `amp_memory_insert(block: "working_state", text: "...", scope: "project:<tag>", session_id: "<id>")` — append session context | always visible |
| User states preference | Enable `memory` domain, then `amp_memory_replace(block: "user", old_text: "...", new_text: "...", scope: "project:<tag>")` | memory |
| Session end | Enable `memory` domain, then `amp_memory_promote(block: "...", from_tier: "working", to_tier: "core", scope: "project:<tag>", session_id: "<id>")` | memory |
| Session end | `amp_memory_archive(block: "working_state", scope: "project:<tag>", session_id: "<id>")` — clean up session-scoped blocks | memory |

Three tiers:
- **Core** (always visible, ~15% token budget) — persona, user preferences, project state
- **Working** (session-scoped, ~10% token budget) — current objective, active state, open questions
- **Archive** (searchable on demand, ~60% token budget) — historical sessions, past decisions

Default blocks: `persona`, `user`, `current_objective`, `working_state`, `project_state`, `open_questions`.

### Temporal Facts

Facts are subject-predicate-object triples with `valid_at`/`invalid_at`/`status` fields. Canonical entity resolution prevents fragmentation across name variants.

- When existing knowledge is contradicted, facts get **invalidated** (not just overwritten) — the old fact is marked with `invalid_at` and a new fact is created.
- Enable the `temporal` domain first: `amp_tools(action: "enable", domain: "temporal")`.
- Use `amp_timeline(entity: "<name>")` to see how facts about an entity evolved chronologically.
- Use `amp_fact_diff(entity: "<name>", from: "<timestamp>", to: "<timestamp>")` to see what changed between two points in time.
- `amp_load` (always visible) accepts a `temporal` param for time-aware retrieval: `current` (default), `historical`, `interval`, `evolution`.

### Session End / Handoff

- Store a session summary: what was accomplished, key decisions, open items (`amp_store` — always visible).
- Enable the `memory` domain: `amp_tools(action: "enable", domain: "memory")`.
- Promote valuable working memory to core: `amp_memory_promote(block: "<block>", from_tier: "working", to_tier: "core")`.
- Clean up session-scoped blocks: `amp_memory_archive(block: "working_state")`.
- If spawning sub-agents, include relevant AMP context in their prompts.
- Enable the `admin` domain: `amp_tools(action: "enable", domain: "admin")`.
- Check consolidation: `amp_consolidate(action: "status")`. If 10+ unprocessed episodes, run it.

---

## Tool Reference — Always Visible (7 tools)

### amp_tools

Gateway to on-demand tool domains. Enable, disable, or list available domains.

```json
{ "action": "enable", "domain": "code" }
{ "action": "disable", "domain": "code" }
{ "action": "list" }
```

Domains: `memory`, `temporal`, `admin`, `research`, `code`, `arch`, `wiki`, `retrieval`, `graph`.

---

## Tool Reference — Core Memory (15 tools)

> **Note:** `amp_load`, `amp_store`, `amp_memory_read`, and `amp_memory_insert` are always visible. All other tools in this section require enabling their respective domain first (`admin` for query/consolidate/bootstrap/resolve/ingest_codebase/provenance, `temporal` for timeline/fact_diff, `memory` for replace/rewrite/promote/archive).

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

### amp_provenance

Trace the full lifecycle of a semantic node: origin episodic, all signals with attribution, supersession chain, source citations, chronological timeline.

```json
{ "semantic_id": "amp-sem-xyz" }
```

### amp_timeline

Chronological fact history for an entity. Returns subject-predicate-object triples with valid_at/invalid_at timestamps showing how knowledge evolved.

```json
{ "entity": "auth-module" }
{ "entity": "auth-module", "include_episodes": true, "limit": 50 }
```

### amp_fact_diff

What changed between two timestamps. Returns added, removed, and modified facts.

```json
{
  "entity": "auth-module",
  "from": "2026-01-01T00:00:00Z",
  "to": "2026-03-28T00:00:00Z"
}
```

### amp_memory_read

Read one named memory block. Returns its content, tier, and metadata (or `{found:false}`). There is no `tier` argument and no bulk read — name the block. Core blocks are already included automatically in `amp_load`/`amp_context` output.

```json
{ "block": "persona", "scope": "project:my-api" }
{ "block": "working_state", "scope": "project:my-api", "session_id": "session-20260328-140000" }
```

Params: `block` (required), `scope` (project tag), `session_id` (for working-tier blocks).
Default blocks: `persona`, `user`, `current_objective`, `working_state`, `project_state`, `open_questions`.

### amp_memory_insert

Append text to a memory block. Creates the block if it doesn't exist. The parameter is `text` (not `content`).

```json
{
  "block": "working_state",
  "text": "Currently refactoring auth module. Halfway through JWT migration.",
  "scope": "project:my-api",
  "session_id": "session-20260328-140000"
}
```

### amp_memory_replace

Find and replace exact text within a memory block. Throws if `old_text` is not found. Params are `old_text`/`new_text` (not `old`/`new`).

```json
{
  "block": "user",
  "old_text": "Prefers tabs",
  "new_text": "Prefers 2-space indentation (changed 2026-03)",
  "scope": "project:my-api"
}
```

### amp_memory_rewrite

Full rewrite of a memory block (overwrites entire content). Use when incremental replace is insufficient.

```json
{
  "block": "current_objective",
  "content": "Implementing temporal facts for AMP core. Need to add timeline queries and fact diffing.",
  "scope": "project:my-api"
}
```

### amp_memory_promote

Move a block between tiers. Typically used to promote working memory to core at session end.

```json
{
  "block": "auth-conventions",
  "from_tier": "working",
  "to_tier": "core"
}
```

### amp_memory_archive

Archive a memory block. Moves it to the archive tier for future searchability.

```json
{ "block": "working_state" }
```

---

## Tool Reference — Unified Retrieval (2 tools)

> **Note:** `amp_context` is always visible. `amp_feedback` requires enabling the `retrieval` domain.

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

## Tool Reference — Code Intelligence (7 tools)

> **Requires:** `amp_tools(action: "enable", domain: "code")`

### amp_code_index

AST-based indexing. Creates Symbol nodes and relationship edges. Run once per project or after significant changes.

```json
{
  "path": "/absolute/path/to/project",
  "mode": "project",
  "exclude": ["node_modules", "dist"]
}
```

Supports: TypeScript, JavaScript, Python, Go, Rust. Also does structural extraction for SQL (tables/views/functions), Terraform/HCL (resources/modules/variables/outputs), and MCP config files (servers; env-safe — never persists env/arg values).

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

### amp_code_ast_grep

Structural code search via ast-grep — matches AST patterns instead of raw text, returning file/range hits plus captured meta-variables. Use when you need to find a syntactic shape (e.g. all calls of a function, all awaits) rather than a string. Supports JavaScript, TypeScript, and TSX/JSX.

```json
{ "pattern": "await $EXPR", "path": "src", "language": "typescript", "limit": 50 }
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

### amp_code_watch

Start, stop, or check the background file watcher that auto-reindexes source files when they change — keeps the symbol graph fresh without manual `amp_code_index` re-runs.

```json
{ "action": "start", "path": "/absolute/path/to/project" }
{ "action": "status" }
{ "action": "stop" }
```

---

## Tool Reference — Architecture (6 tools)

> **Requires:** `amp_tools(action: "enable", domain: "arch")`

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

> **Requires:** `amp_tools(action: "enable", domain: "research")`

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

## Tool Reference — Wiki (5 tools)

> **Requires:** `amp_tools(action: "enable", domain: "wiki")`

### amp_compile

Compile the knowledge graph into a navigable interlinked markdown wiki. Each entity becomes a markdown article with `[[wikilinks]]`, backlinks, hierarchy, see-also, and source citations.

```json
{
  "project_tag": "project:my-api",
  "output_dir": "./wiki",
  "format": "markdown",
  "emit_graph": true,
  "entities": ["auth-module"]
}
```

### amp_ingest

Ingest raw source documents (articles, papers, notes, repos). Auto-extracts entities and claims. Creates Source nodes + Semantic nodes with CITES/ABOUT edges. In addition to text/markdown, converts documents (PDF, Word/.docx, Excel/.xlsx, HTML, RTF) to text via optional system tools (no new dependencies required).

```json
{
  "source_path": "./raw/paper.md",
  "source_type": "paper",
  "project_tag": "project:my-api",
  "title": "OAuth2 Best Practices",
  "tags": ["auth", "security"]
}
```

Source types: `article`, `paper`, `note`, `repo`, `transcript`.

### amp_lint

10 graph health checks: orphan_pages, broken_links, missing_links, redirect_candidates, link_density, hub_detection, contradictions, low_confidence, stale_sources, coverage_gaps.

```json
{
  "project_tag": "project:my-api",
  "checks": ["orphan_pages", "contradictions", "low_confidence"],
  "thresholds": { "low_confidence": 0.3 }
}
```

### amp_braindump

Capture a human brain dump as durable, human-authored memory under a custom scope (e.g. `project:user-personal`). Extracts entities/claims into the graph while keeping the verbatim text as a Source; creates the scope if new. Use when the user says "remember this about me".

```json
{
  "content": "I prefer concise PRs, hate force-pushes to shared branches, and always squash-merge.",
  "scope": "project:user-personal",
  "title": "Working preferences",
  "tags": ["preferences"],
  "compile": true
}
```

Accepts `content` or `source_path`. Optional: `confidence`, `entities`, `claims`, `compile`.

### amp_wiki_sync

Reconcile a human-edited wiki markdown file back into the graph using the hidden per-claim anchors: changed claims become corrections (supersede), new lines become new human-authored memories, removals are de-emphasised (confidence penalty), never deleted. The agent/CLI complement to the viewer's Edit button.

```json
{ "path": "./wiki/auth-module.md", "project_tag": "project:my-api" }
```

---

## Tool Reference — Graph Analytics (4 tools)

> **Requires:** `amp_tools(action: "enable", domain: "graph")`
>
> Disabled by default, read-only, project-scoped, secret-safe. General-purpose — works for ANY memory graph (code, people, orgs, topics), not just code.

### amp_graph_report

Deterministic graph audit: corpus summary, node/relation counts, memory-confidence summary, high-centrality "Core Abstractions" (weighted degree), "Knowledge Areas" (themes/clustering), dependency cycles, low-confidence knowledge, and knowledge gaps.

```json
{ "project_tag": "project:my-api" }
```

### amp_graph_export

Export the graph as portable JSON, or as a self-contained offline interactive HTML graph map (pan/zoom/drag, click a node to inspect, color by type or knowledge area). Secret-safe + XSS-escaped. Optionally writes a file under `amp-graph-out/`.

```json
{ "project_tag": "project:my-api", "format": "html" }
{ "project_tag": "project:my-api", "format": "json" }
```

### amp_pr_impact

Blast radius of a GitHub PR over the code graph — changed files → symbols → dependent files, plus the knowledge areas and high-centrality nodes touched. Requires the `gh` CLI.

```json
{ "project_tag": "project:my-api", "pr": 123 }
```

### amp_pr_conflicts

Find PR pairs whose impact overlaps (likely merge/review conflicts). Requires the `gh` CLI.

```json
{ "project_tag": "project:my-api" }
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

1. **Enable domains before using their tools.** Call `amp_tools(action: "enable", domain: "<name>")` first. The 7 Tier 1 tools need no enablement.
2. **Prefer `amp_context` over `amp_load`** when you need code + architecture + memory blended together.
3. **Use `amp_arch_context` for planning** — enable `arch` domain, then get the full structural picture.
4. **Use `amp_code_search` over grep** when you need semantic understanding, not just text matching. Enable `code` domain first.
5. **Run `amp_code_index` once** when first working with a project, then re-index after significant changes.
6. **Check `amp_arch_drift` periodically** to know if your architectural model is stale.
7. **Use `amp_impact` before risky changes** to understand the blast radius.
8. **Store what would be lost** if someone only read the commit. The decision, the tradeoff, the context.
9. **Write prose, not code.** AMP stores reasoning and decisions, not implementations.
10. **Project tags are mandatory.** Every load/store includes `project:<name>`.
11. **Entity linking is mandatory.** Every store includes entity names. Without them, episodes are orphaned.
12. **Read core memory at session start.** Core blocks (persona, user, project_state) provide always-visible context.
13. **Update working memory during sessions.** Use `amp_memory_insert` (always visible) to maintain `working_state` so handoffs are smooth.
14. **Promote, don't lose.** At session end, enable `memory` domain, promote valuable working memory to core before archiving.
15. **Invalidate, don't overwrite.** When facts are contradicted, they get invalidated with timestamps — preserving history.
16. **Use `amp_timeline` for fact archaeology.** Enable `temporal` domain when you need to understand how knowledge about an entity evolved over time.
