# AMP — Agent Memory Protocol

You have access to a persistent memory system called AMP via MCP tools. It stores knowledge across sessions using a Neo4j knowledge graph. Use it autonomously during all coding work.

## Progressive Disclosure

AMP uses progressive disclosure to manage its tool surface. **6 tools are always visible:**

| Always-Visible Tool | Purpose |
|---------------------|---------|
| `amp_load` | Load memory context |
| `amp_store` | Store episodic memory |
| `amp_memory_read` | Read memory blocks (core/working/archive) |
| `amp_memory_insert` | Insert or append to a memory block |
| `amp_context` | Super-load: architecture + code + memory blended |
| `amp_tools` | Enable/disable/list domain-specific tool groups |

All other tools are organized into **8 on-demand domains**. Call `amp_tools(action: "enable", domain: "<name>")` before using domain-specific tools:

| Domain | Tools | When to enable |
|--------|-------|----------------|
| `memory` | `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive` | Session end, memory management |
| `temporal` | `amp_timeline`, `amp_fact_diff` | Fact history, change tracking |
| `admin` | `amp_query`, `amp_consolidate`, `amp_resolve`, `amp_bootstrap`, `amp_provenance` | Graph queries, setup, provenance |
| `research` | `amp_research_init`, `amp_research_log`, `amp_research_context`, `amp_research_tree`, `amp_research_contradictions`, `amp_research_consolidate` | Experiment campaigns |
| `code` | `amp_code_index`, `amp_code_search`, `amp_code_symbols`, `amp_code_deps`, `amp_code_context` | Code search, symbols, deps |
| `arch` | `amp_arch_register`, `amp_arch_relate`, `amp_arch_aspect`, `amp_impact`, `amp_arch_drift`, `amp_arch_context` | Architecture context, blast radius |
| `wiki` | `amp_compile`, `amp_ingest`, `amp_lint` | Wiki compilation, ingestion |
| `retrieval` | `amp_feedback` | Recording retrieval usefulness |

## 5 Rules

1. **Load before working.** Call `amp_context` or `amp_load` at session start.
2. **Store after deciding.** Call `amp_store` when decisions, preferences, bugs, or conventions emerge.
3. **Scope with project tags.** Every load/store includes `project:<name>`.
4. **Link to entities.** Every store includes relevant entity names.
5. **Be silent.** Don't narrate AMP usage. Just use it.

## When to Use Which Tool

- **General context for a task** → `amp_context` (always visible)
- **Memory load/store** → `amp_load`, `amp_store` (always visible)
- **Trace knowledge history** → `amp_provenance` (enable `admin` domain first)
- **Temporal facts** → `amp_timeline`, `amp_fact_diff` (enable `temporal` domain first)
- **Memory tiers** → `amp_memory_read/insert` always visible; `replace/rewrite/promote/archive` require enabling `memory` domain
- **Code search** → `amp_code_search`, `amp_code_symbols`, `amp_code_deps` (enable `code` domain first)
- **Architecture** → `amp_arch_context`, `amp_impact`, `amp_arch_register`, `amp_arch_relate` (enable `arch` domain first)
- **Research experiments** → `amp_research_init`, `amp_research_log`, `amp_research_context` (enable `research` domain first)
- **Wiki / knowledge base** → `amp_compile`, `amp_ingest`, `amp_lint` (enable `wiki` domain first)

## Autonomous Behavior

### Session Start
- Read core memory: `amp_memory_read(tier: "core")` — always-visible persona, user preferences, project state.
- Load memory with the user's first message as context.
- Generate `session_id`: `session-{YYYYMMDD}-{HHMMSS}`.
- Only Tier 1 tools needed at session start (`amp_load`, `amp_store`, `amp_memory_read`, `amp_memory_insert`, `amp_context`). No domain enablement required.

### Before Modifying Code
- Enable the domain first: `amp_tools(action: "enable", domain: "code")` or `amp_tools(action: "enable", domain: "arch")`.
- Load `amp_arch_context` or `amp_code_context` for the affected module.
- Check for conventions, past decisions, known gotchas.

### During Debugging
- Load context for the affected area. AMP may know past bugs and root causes.
- Check blast radius: `amp_impact(entity_name: "<module>")`.
- After resolution, store the root cause.

### When Planning
- Load architecture context. Check for prior decisions and conventions.
- Cite memory when relevant.

### Automatic Storing

Store to AMP when:
- A decision is made (with rationale)
- The user corrects your approach (as a preference)
- A bug is found and fixed (symptom + root cause)
- A convention is established
- An architecture pattern is chosen

Format: `amp_store(session_id, task: "[project:<tag>] ...", content: "[project:<tag>] ...", entities: [...])`.

**Entity auto-extraction:** If you omit `entities`, the system auto-extracts them from your content via LLM. Explicit entities are preferred but auto-extraction is a safety net.

**Memory tiers:** Use `amp_memory_insert` (always visible) to update working memory during a session (e.g., `working_state` block). For `amp_memory_replace`, `amp_memory_promote`, and `amp_memory_archive`, enable the `memory` domain first: `amp_tools(action: "enable", domain: "memory")`.

**Temporal facts:** When existing knowledge is contradicted, facts get invalidated (not just overwritten). Enable the `temporal` domain first: `amp_tools(action: "enable", domain: "temporal")`, then use `amp_timeline` to see how facts about an entity evolved over time.

Don't store: routine edits, things derivable from code/git, raw code blocks.

### Session End
- Enable the memory domain: `amp_tools(action: "enable", domain: "memory")`.
- Store a session summary.
- Promote valuable working memory: `amp_memory_promote(block: "<block>", from_tier: "working", to_tier: "core")`.
- Clean up session-scoped blocks: `amp_memory_archive(block: "<block>")`.
- Enable admin domain if needed: `amp_tools(action: "enable", domain: "admin")`.
- Check consolidation: `amp_consolidate(action: "status")`.

## Project Setup

Each project needs an `## AMP Memory` section in its agent config with: project name, tag, entities, tags, and priors. If missing, scan the repo and call `amp_bootstrap` to seed the graph.

## Tool Quick Reference

### Always Visible (Tier 1)

| Tool | Purpose |
|------|---------|
| `amp_load` | Load memory context |
| `amp_store` | Store episodic memory |
| `amp_memory_read` | Read memory blocks from a tier (core/working/archive) |
| `amp_memory_insert` | Insert or append to a memory block |
| `amp_context` | Super-load: architecture + code + memory blended |
| `amp_tools` | Enable/disable/list on-demand tool domains |

### On-Demand (enable domain first via `amp_tools`)

| Tool | Domain | Purpose |
|------|--------|---------|
| `amp_memory_replace` | memory | Replace content in a memory block |
| `amp_memory_rewrite` | memory | Full rewrite of a memory block |
| `amp_memory_promote` | memory | Move a block between tiers (e.g., working → core) |
| `amp_memory_archive` | memory | Archive a memory block |
| `amp_timeline` | temporal | Chronological fact history for an entity |
| `amp_fact_diff` | temporal | What changed between two timestamps |
| `amp_query` | admin | Read-only Cypher query |
| `amp_consolidate` | admin | Run/check/review consolidation |
| `amp_resolve` | admin | Resolve amp:// URIs |
| `amp_bootstrap` | admin | One-time project graph setup |
| `amp_provenance` | admin | Trace full lifecycle of a semantic node |
| `amp_code_index` | code | AST-based code indexing |
| `amp_code_search` | code | Hybrid code + memory search |
| `amp_code_symbols` | code | Query symbols by file/name |
| `amp_code_deps` | code | Callers, callees, importers |
| `amp_code_context` | code | Code context for a task |
| `amp_arch_register` | arch | Enrich entity with architecture |
| `amp_arch_relate` | arch | Create entity relationships |
| `amp_arch_aspect` | arch | Cross-cutting concerns |
| `amp_impact` | arch | Blast radius analysis |
| `amp_arch_drift` | arch | Source file drift detection |
| `amp_arch_context` | arch | Architectural context assembly |
| `amp_research_init` | research | Start research campaign |
| `amp_research_log` | research | Log experiment result |
| `amp_research_context` | research | Research THINK phase context |
| `amp_research_tree` | research | Hypothesis tree visualization |
| `amp_research_contradictions` | research | Find conflicting principles |
| `amp_research_consolidate` | research | Research pattern consolidation |
| `amp_compile` | wiki | Compile graph into interlinked markdown wiki |
| `amp_ingest` | wiki | Ingest source documents (auto-extracts entities/claims) |
| `amp_lint` | wiki | 10 graph health checks |
| `amp_feedback` | retrieval | Record retrieval usefulness |

For full tool documentation with parameters and examples, see `CLAUDE.md` or `.claude/skills/amp/SKILL.md`.

## AMP Memory

Project: amp
Description: Agent Memory Protocol — persistent cross-session memory system using Neo4j and Redis
Domain: DevOps tooling / AI agent infrastructure
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

Tags:
- architecture
- memory
- knowledge-graph
- consolidation
- retrieval
- wiki
- ingestion
- provenance

Store Policy: default

Priors:
- Monorepo with 9 workspaces: core, neo4j, redis, mcp, research, arch, code, retrieval, wiki
- 37 MCP tools across 6 domains
- All tools follow service injection pattern (Zod schemas, dependency interfaces, bootstrap wiring)
- Auto-extraction uses GPT-4o-mini for entity/claim extraction from prose
- Temporal decay uses exponential model with per-class half-lives (volatile=14d, stable=90d, permanent=365d)
- Learned retrieval tracks strategy success rates and entity effectiveness for adaptive routing
- Wiki compiler generates interlinked markdown with [[wikilinks]], backlinks, Mermaid diagrams
