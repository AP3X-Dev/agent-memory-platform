# AMP — Agent Memory Protocol

You have access to a persistent memory system called AMP via MCP tools. It stores knowledge across sessions using a Neo4j knowledge graph. Use it autonomously during all coding work.

## 5 Rules

1. **Load before working.** Call `amp_context` or `amp_load` at session start.
2. **Store after deciding.** Call `amp_store` when decisions, preferences, bugs, or conventions emerge.
3. **Scope with project tags.** Every load/store includes `project:<name>`.
4. **Link to entities.** Every store includes relevant entity names.
5. **Be silent.** Don't narrate AMP usage. Just use it.

## When to Use Which Tool

- **General context for a task** → `amp_context` (super-load, blends architecture + code + memory)
- **Memory load/store** → `amp_load`, `amp_store`, `amp_query`
- **Trace knowledge history** → `amp_provenance` (full lifecycle of any semantic node)
- **Temporal facts** → `amp_timeline` (chronological fact history), `amp_fact_diff` (what changed between timestamps)
- **Memory tiers** → `amp_memory_read/insert/replace/rewrite/promote/archive` (core/working/archive memory blocks)
- **Code search** → `amp_code_search`, `amp_code_symbols`, `amp_code_deps`
- **Architecture** → `amp_arch_context`, `amp_impact`, `amp_arch_register`, `amp_arch_relate`
- **Research experiments** → `amp_research_init`, `amp_research_log`, `amp_research_context`
- **Wiki / knowledge base** → `amp_compile` (build wiki), `amp_ingest` (ingest sources), `amp_lint` (health checks)

## Autonomous Behavior

### Session Start
- Read core memory: `amp_memory_read(tier: "core")` — always-visible persona, user preferences, project state.
- Load memory with the user's first message as context.
- Generate `session_id`: `session-{YYYYMMDD}-{HHMMSS}`.

### Before Modifying Code
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

**Memory tiers:** Use `amp_memory_insert` to update working memory during a session (e.g., `working_state` block). Use `amp_memory_replace` to update core memory when user states a preference. At session end, promote valuable working memory with `amp_memory_promote`.

**Temporal facts:** When existing knowledge is contradicted, facts get invalidated (not just overwritten). Use `amp_timeline` to see how facts about an entity evolved over time.

Don't store: routine edits, things derivable from code/git, raw code blocks.

### Session End
- Store a session summary.
- Promote valuable working memory: `amp_memory_promote(block: "<block>", from_tier: "working", to_tier: "core")`.
- Clean up session-scoped blocks: `amp_memory_archive(block: "<block>")`.
- Check consolidation: `amp_consolidate(action: "status")`.

## Project Setup

Each project needs an `## AMP Memory` section in its agent config with: project name, tag, entities, tags, and priors. If missing, scan the repo and call `amp_bootstrap` to seed the graph.

## Tool Quick Reference

| Tool | Purpose |
|------|---------|
| `amp_context` | Super-load: architecture + code + memory blended |
| `amp_load` | Load memory context |
| `amp_store` | Store episodic memory |
| `amp_query` | Read-only Cypher query |
| `amp_consolidate` | Run/check/review consolidation |
| `amp_resolve` | Resolve amp:// URIs |
| `amp_bootstrap` | One-time project graph setup |
| `amp_code_index` | AST-based code indexing |
| `amp_code_search` | Hybrid code + memory search |
| `amp_code_symbols` | Query symbols by file/name |
| `amp_code_deps` | Callers, callees, importers |
| `amp_code_context` | Code context for a task |
| `amp_arch_register` | Enrich entity with architecture |
| `amp_arch_relate` | Create entity relationships |
| `amp_arch_aspect` | Cross-cutting concerns |
| `amp_impact` | Blast radius analysis |
| `amp_arch_drift` | Source file drift detection |
| `amp_arch_context` | Architectural context assembly |
| `amp_feedback` | Record retrieval usefulness |
| `amp_research_init` | Start research campaign |
| `amp_research_log` | Log experiment result |
| `amp_research_context` | Research THINK phase context |
| `amp_research_tree` | Hypothesis tree visualization |
| `amp_research_contradictions` | Find conflicting principles |
| `amp_research_consolidate` | Research pattern consolidation |
| `amp_provenance` | Trace full lifecycle of a semantic node |
| `amp_timeline` | Chronological fact history for an entity |
| `amp_fact_diff` | What changed between two timestamps |
| `amp_memory_read` | Read memory blocks from a tier (core/working/archive) |
| `amp_memory_insert` | Insert or append to a memory block |
| `amp_memory_replace` | Replace content in a memory block |
| `amp_memory_rewrite` | Full rewrite of a memory block |
| `amp_memory_promote` | Move a block between tiers (e.g., working → core) |
| `amp_memory_archive` | Archive a memory block |
| `amp_compile` | Compile graph into interlinked markdown wiki |
| `amp_ingest` | Ingest source documents (auto-extracts entities/claims) |
| `amp_lint` | 10 graph health checks |

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
