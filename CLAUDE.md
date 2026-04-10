# AMP — Agent Memory Protocol

You have access to a persistent memory system called AMP via MCP tools. It stores knowledge across sessions and agents using a Neo4j knowledge graph with Redis caching. **37 tools** across **6 domains**.

---

## Quick Reference — When to Use Which Tool

| Need | Tool |
|------|------|
| **General context for a task** | `amp_context` — super-load blending architecture + code + memory |
| **Load memory** | `amp_load` — scoped by entities/tags, token-budgeted, time-aware |
| **Store a decision/observation** | `amp_store` — auto-extracts entities if you don't provide them |
| **Raw graph query** | `amp_query` — read-only Cypher |
| **Trace how knowledge evolved** | `amp_provenance` — full lifecycle of any semantic node |
| **Consolidation** | `amp_consolidate` — promote episodic patterns to semantic knowledge |
| **Entity timeline** | `amp_timeline` — chronological fact/episode history for an entity |
| **Fact diff** | `amp_fact_diff` — what changed about an entity between two timestamps |
| **Read memory block** | `amp_memory_read` — read a structured memory block (core/working/archive) |
| **Edit memory block** | `amp_memory_insert`, `amp_memory_replace`, `amp_memory_rewrite` — modify blocks |
| **Promote/archive block** | `amp_memory_promote`, `amp_memory_archive` — move blocks between tiers |
| **Code search** | `amp_code_search` — hybrid fulltext + vector + RRF fusion |
| **Code symbols** | `amp_code_symbols`, `amp_code_deps` — symbol lookup and dependency queries |
| **Architecture context** | `amp_arch_context` — deterministic, same graph = same output |
| **Impact analysis** | `amp_impact` — blast radius of changing an entity |
| **Drift detection** | `amp_arch_drift` — detect changed source files |
| **Research experiments** | `amp_research_init`, `amp_research_log`, `amp_research_context` |
| **Compile wiki** | `amp_compile` — generate interlinked markdown wiki from the graph |
| **Ingest sources** | `amp_ingest` — feed articles/papers/notes into the graph |
| **Lint the graph** | `amp_lint` — health checks: orphans, contradictions, gaps |
| **Bootstrap a project** | `amp_bootstrap` — seed entities, agents, and priors |
| **Resolve AMP URIs** | `amp_resolve` — load `amp://entity/X` or `amp://tag/Y` |
| **Record retrieval feedback** | `amp_feedback` — improves future ranking |

---

## 5 Rules

1. **Load before working.** Call `amp_context` or `amp_load` at session start.
2. **Store after deciding.** Call `amp_store` when decisions, preferences, bugs, or conventions emerge.
3. **Scope with project tags.** Every load/store includes `project:<name>` in tags.
4. **Signal when applicable.** If your work confirms or contradicts existing knowledge, include signals.
5. **Be silent.** Don't narrate AMP usage. Just use it. Only mention it when memory changes your approach.

---

## The 6 Domains

### Core (15 tools) — memory foundation

| Tool | Purpose |
|------|---------|
| `amp_load` | Load token-budgeted context for a task. Params: `task`, `entities?`, `tags?`, `max_tokens?`, `temporal?` |
| `amp_store` | Store an episodic memory. **Auto-extracts entities** if you don't provide them. Params: `session_id`, `task`, `content`, `outcome?`, `signals?`, `entities?` |
| `amp_query` | Read-only Cypher query. Params: `query`, `limit?` |
| `amp_consolidate` | Run/review/status consolidation. Params: `action`, `scope?`, `proposal_id?`, `decision?` |
| `amp_resolve` | Resolve `amp://` URIs to context. Params: `uri`, `max_tokens?`, `stage_context?` |
| `amp_bootstrap` | Seed the graph for a project. Idempotent. Params: `project_name`, `project_tag`, `description`, `domain`, `entities`, `semantic_seeds?`, `agents?` |
| `amp_provenance` | Trace full lifecycle of a semantic node: origin, signals, supersessions, sources, timeline. Params: `semantic_id` |
| `amp_timeline` | Chronological fact/episode history for an entity. Params: `entity`, `include_episodes?`, `limit?` |
| `amp_fact_diff` | What changed about an entity between two timestamps. Params: `entity`, `from`, `to` |
| `amp_memory_read` | Read a memory block. Params: `block`, `scope?`, `session_id?` |
| `amp_memory_insert` | Append text to a memory block. Params: `block`, `text`, `scope?`, `session_id?` |
| `amp_memory_replace` | Find-and-replace in a memory block. Params: `block`, `old_text`, `new_text`, `scope?`, `session_id?` |
| `amp_memory_rewrite` | Overwrite entire memory block. Params: `block`, `content`, `scope?`, `session_id?` |
| `amp_memory_promote` | Change block tier. Params: `block`, `from_tier`, `to_tier`, `scope?`, `session_id?` |
| `amp_memory_archive` | Archive block to episodic memory. Params: `block`, `scope?`, `session_id?` |

**Key concepts:**
- **Episodic** = what happened (session snapshots). Created by `amp_store`.
- **Semantic** = what we know (consolidated principles with confidence scores). Promoted from episodic via consolidation.
- **Signals** = reinforcement, correction, contradiction. Drive confidence up/down.
- **Auto-extraction** = when `entities` is not provided in `amp_store`, the system uses GPT-4o-mini to extract entity names from your content and link them automatically.
- **Temporal decay** = confidence decays exponentially based on time since last signal. Half-lives: volatile=14 days, stable=90 days, permanent=365 days.
- **Temporal facts** = subject/predicate/object triples (Fact nodes) with `valid_at`, `invalid_at`, `status` (active/invalidated/disputed/tentative). Extracted automatically during consolidation promotion. Contradiction signals trigger fact invalidation: old fact becomes invalidated, new fact supersedes it via `supersedes_fact_id`.
- **Memory tiers** = three-tier structured memory. **Core** (always visible, editable, persisted in Neo4j) — persona, user, current_objective, project_state. **Working** (session-scoped, 24h TTL in Redis) — working_state, open_questions. **Archive** (existing episodic/semantic/fact graph). Token budgets in `amp_load`: core 15%, working 10%, facts 15%, archive 60%.
- **Entity resolution** = EntityResolver matches by exact name, then case-insensitive, then alias. Prevents fragmentation across "AMP", "amp", "Agent Memory Protocol". All Fact nodes carry a canonical `entity_id`.

### Architecture (6 tools) — structural blueprint

| Tool | Purpose |
|------|---------|
| `amp_arch_register` | Enrich an entity with architectural properties (responsibility, interface, internals, file_paths) |
| `amp_arch_relate` | Create typed relationships: USES, CALLS, EXTENDS, IMPLEMENTS, EMITS, LISTENS |
| `amp_arch_aspect` | Manage cross-cutting concerns (create, apply, remove, list, get) |
| `amp_impact` | Blast radius analysis — what breaks if this entity changes |
| `amp_arch_drift` | Detect when tracked source files have changed (SHA-256 comparison) |
| `amp_arch_context` | Deterministic context assembly — same graph state always produces same output |

### Code (5 tools) — implementation intelligence

| Tool | Purpose |
|------|---------|
| `amp_code_index` | Parse project with tree-sitter, create Symbol nodes + call/import/inherit edges |
| `amp_code_search` | Hybrid search: fulltext + vector + RRF fusion across symbols and semantics |
| `amp_code_symbols` | Query symbols by file path or name |
| `amp_code_deps` | Symbol-level dependency queries (callers, callees, importers, inheritance) |
| `amp_code_context` | Build code-aware context for a task (symbols + semantic memories) |

### Research (6 tools) — experiment tracking

| Tool | Purpose |
|------|---------|
| `amp_research_init` | Initialize a research campaign with objective, metric, commands |
| `amp_research_log` | Log an experiment result with lineage, metrics, hypothesis, insight |
| `amp_research_context` | Build THINK-phase context: campaign state, wins, dead ends, contradictions |
| `amp_research_tree` | Visualize experiment lineage as a tree |
| `amp_research_contradictions` | Find conflicting principles in a campaign |
| `amp_research_consolidate` | Detect patterns across experiments |

### Retrieval (2 tools) — unified super-load

| Tool | Purpose |
|------|---------|
| `amp_context` | Unified context assembly. Strategies: `auto` (classify intent -> route), `ranked` (hybrid search + RRF + learned weights), `deterministic` (same graph -> same output) |
| `amp_feedback` | Record whether a retrieval result was useful. Improves future rankings via learned weights. |

**Learned retrieval:** The system tracks which strategies, entities, and source types produce useful results. Over time, it auto-routes queries to the strategy that works best for each intent type, and boosts/penalizes entities based on their historical usefulness.

### Wiki (3 tools) — knowledge externalization

| Tool | Purpose |
|------|---------|
| `amp_compile` | Compile the graph into a navigable wiki. Each entity becomes a markdown article with `[[wikilinks]]`, backlinks, hierarchy, see-also, source citations. Params: `project_tag`, `output_dir`, `format?`, `emit_graph?`, `entities?` |
| `amp_ingest` | Ingest raw source documents (articles, papers, notes, repos). **Auto-extracts entities and claims** if you don't provide them. Creates Source nodes + Semantic nodes with CITES/ABOUT edges. Params: `source_path`, `source_type`, `project_tag`, `title?`, `entities?`, `claims?`, `tags?` |
| `amp_lint` | 10 graph health checks: orphan_pages, broken_links, missing_links, redirect_candidates, link_density, hub_detection, contradictions, low_confidence, stale_sources, coverage_gaps. Params: `project_tag`, `checks?`, `thresholds?` |

**Wiki workflow:**
1. Ingest raw sources -> `amp_ingest` extracts entities + claims into the graph
2. Compile the graph -> `amp_compile` generates interlinked markdown wiki
3. Lint for quality -> `amp_lint` finds issues and suggests fixes
4. Browse the wiki -> use the built-in viewer or read the markdown directly

---

## Autonomous Behavior

### Session Start

1. Generate `session_id`: `session-{YYYYMMDD}-{HHMMSS}`. Reuse for all stores.
2. Call `amp_load` or `amp_context` with the user's first message.
3. Read core memory blocks: `amp_memory_read(block: "persona")`, `amp_memory_read(block: "user")`, `amp_memory_read(block: "current_objective")`.
4. Initialize working memory: `amp_memory_rewrite(block: "working_state", content: "<session goal>")`.
5. Let memory silently inform your work.

### Before Modifying Code

- Load context for the module: `amp_arch_context` or `amp_code_context`
- Check for: conventions, past decisions, known gotchas
- Apply silently. Only mention when it changes your approach.

### During Work

- Update `working_state` as context evolves — current focus, blockers, decisions pending.
- When the user states a preference, write it to the `user` core block via `amp_memory_insert`.
- Use `amp_memory_replace` to correct stale information in core blocks.

### Session End

- Promote valuable working memory to core tier if it should persist: `amp_memory_promote(block: "open_questions", from_tier: "working", to_tier: "core")`.
- Archive session-specific working blocks: `amp_memory_archive(block: "working_state")`.
- Store a session summary via `amp_store` as usual.

### Memory Tiers

| Tier | Scope | Storage | Use for |
|------|-------|---------|---------|
| **Core** | Permanent, always loaded | Neo4j | Identity, user prefs, project state, current objectives |
| **Working** | Session-scoped, 24h TTL | Redis | Scratchpad, open questions, intermediate state |
| **Archive** | Permanent, loaded by relevance | Neo4j graph | Episodic sessions, semantic knowledge, temporal facts |

- Core blocks are loaded automatically by `amp_load` (15% token budget). Keep them concise.
- Working blocks are ephemeral. Use them freely for session state without worrying about clutter.
- Archive is the existing graph. Don't duplicate archive content in core blocks.

### Temporal Facts

Facts are subject/predicate/object triples with time bounds. They capture structured knowledge that changes over time.

- **Extraction:** Facts are extracted automatically during consolidation promotion. No manual creation needed.
- **Invalidation:** When a contradiction signal fires, the old fact's status becomes `invalidated` and the new fact gets `supersedes_fact_id` pointing to it.
- **Time-aware loading:** Use `amp_load` with `temporal` param to query historical state:
  ```
  amp_load(task: "...", temporal: { time_mode: "current" })                          // active facts only (default)
  amp_load(task: "...", temporal: { time_mode: "historical", as_of: "2025-06-01" })  // facts valid at a point in time
  amp_load(task: "...", temporal: { time_mode: "interval", from: "2025-01-01", to: "2025-06-01" })  // facts valid during a range
  amp_load(task: "...", temporal: { time_mode: "evolution", include_invalidated: true })             // full fact history including superseded
  ```
- **Timeline:** Use `amp_timeline(entity: "X")` to see chronological history. Use `amp_fact_diff(entity: "X", from: "...", to: "...")` to see what changed.

### Automatic Storing Triggers

Store to AMP whenever these happen — don't ask:

| Trigger | What to store |
|---------|--------------|
| Decision made | Decision, rationale, alternatives considered |
| User corrected your approach | The correction as a preference/convention |
| User stated a preference | The preference with context |
| Bug found and fixed | Symptom, root cause, fix |
| Convention established | The rule, scope, and why |
| Architecture pattern chosen | The pattern, tradeoffs, constraints |

**Don't store:** routine edits, things derivable from code/git, raw code blocks.


### Wiki Auto-Compile

The wiki recompiles automatically every 6 hours via systemd timer (`amp-wiki-compile.timer`).
The viewer runs persistently on **port 3200** (`amp-wiki.service`).

In addition, agents should trigger a recompile when significant knowledge changes occur:

| Trigger | Action |
|---------|--------|
| Session stored 3+ times | Call `amp_compile` at session end |
| Source ingested via `amp_ingest` | Call `amp_compile` after ingestion |
| Consolidation ran with promotions | Call `amp_compile` after consolidation |

To recompile manually:

```
amp_compile(project_tag: "project:<tag>", output_dir: "/home/cerebro/projects/amp/wiki", emit_graph: true)
```

The wiki viewer is always available at: **http://192.168.0.25:3200**


### Entity Linking

When storing, you can either:
- **Provide entities explicitly** — `entities: ["auth-module", "jwt"]`
- **Let auto-extraction handle it** — omit `entities` and the system extracts them from your content via LLM

Auto-extraction is a safety net, not a replacement for intentional linking. When you know the entities, pass them.

### Signal Generation

When your work confirms or contradicts existing AMP knowledge:
- **Reinforcement** — existing knowledge held true
- **Correction** — existing knowledge is partially outdated
- **Contradiction** — existing knowledge is fundamentally wrong. Triggers fact invalidation if facts exist.

Only signal against semantic entries from your `amp_load` results. Never fabricate target IDs.

### Provenance

When you or the user wants to understand why a piece of knowledge exists or how confident to be in it:
```
amp_provenance(semantic_id: "amp-sem-xyz")
```
Returns: origin episodic, all signals with attribution, supersession chain, source citations, chronological timeline.

### Wiki Compilation

When the user wants a browsable view of the knowledge base:
```
amp_compile(project_tag: "project:my-project", output_dir: "./wiki", emit_graph: true)
```
Then either serve via the built-in viewer or read the markdown files directly.

### Source Ingestion

When the user provides research material (articles, papers, notes):
```
amp_ingest(source_path: "./raw/paper.md", source_type: "paper", project_tag: "project:my-project")
```
Auto-extracts entities and claims. No manual extraction needed.

---

## Graph Schema

**14 node types:** Episodic, Semantic, Entity, Agent, Model, Aspect, Symbol, Component, Campaign, Experiment, Source, Procedural, Fact, MemoryBlock

**Key relationships:**
- `ABOUT` — Semantic -> Entity (knowledge attribution)
- `CONTAINS` — Entity -> Entity (hierarchy)
- `USES/CALLS/EXTENDS/IMPLEMENTS/EMITS/LISTENS` — Entity -> Entity (structural)
- `REINFORCES/CORRECTS/CONTRADICTS` — Episodic -> Semantic (signals)
- `PROMOTED_FROM` — Semantic -> Episodic (provenance)
- `SUPERSEDES` — Semantic -> Semantic (evolution)
- `CITES` — Semantic -> Source (provenance from ingested sources)
- `APPLIES_TO` — Aspect -> Entity (cross-cutting concerns)
- `SYMBOL_CALLS/IMPORTS/INHERITS/CONTAINS` — Symbol -> Symbol (code dependencies)
- `DEFINED_IN` — Symbol -> Component (code grounding)
- `FACT_ABOUT` — Fact -> Entity (structured knowledge attribution)
- `SOURCED_FROM` — Fact -> Episodic/Semantic (fact provenance)
- `SUPERSEDES_FACT` — Fact -> Fact (fact evolution on contradiction)

---

## Project Setup

If the project doesn't have an `## AMP Memory` section in its CLAUDE.md, set it up:

1. Analyze the repo (package.json, source tree, git log)
2. Identify entities, domain tags, seed priors
3. Write `## AMP Memory` config section
4. Call `amp_bootstrap` to scaffold the graph

See the `/amp-setup` skill or the CLAUDE.md instructions in the user's global config.

---

## AMP Memory

Project: amp
Description: Agent Memory Protocol — persistent cross-session knowledge graph for AI agents
Domain: AI agent infrastructure / knowledge management
Project Tag: project:amp

Entities:
- amp
- core
- neo4j
- redis
- mcp
- research
- arch
- code
- retrieval
- wiki
- temporal-facts
- memory-tiers
- entity-resolver

Tags:
- architecture
- memory
- knowledge-graph
- consolidation
- retrieval
- wiki
- ingestion
- provenance
- temporal
- memory-tiers
- entity-resolution

Store Policy:
- default

Priors:
- AMP uses Neo4j for persistent graph storage and Redis for caching/streams
- 6 domain packages: core, research, arch, code, retrieval, wiki
- All tools follow service injection pattern with Zod schemas
- Consolidation promotes episodic -> semantic via signal-weighted clustering
- Temporal decay uses exponential model with per-class half-lives
- Auto-extraction uses GPT-4o-mini for entity/claim extraction from prose
- Temporal facts are subject/predicate/object triples extracted during consolidation, with time bounds and invalidation on contradiction
- Memory tiers (core/working/archive) provide structured blocks with per-tier token budgets in amp_load
- EntityResolver canonicalizes entity references via exact -> case-insensitive -> alias matching
