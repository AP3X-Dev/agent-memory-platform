---
name: amp
description: "Agent Memory Protocol — persistent memory with progressive tool disclosure, temporal facts, memory tiers, architectural understanding, code intelligence, and unified retrieval via MCP tools."
---

# AMP — Agent Memory Protocol

Persistent memory for AI agents. Progressive disclosure: 7 always-visible tools + 8 on-demand domains.

## 5 Rules

1. Load before working — `amp_context` or `amp_load`
2. Store after deciding — `amp_store`
3. Scope with project tags — `project:<name>`
4. Link to entities — include entity names in stores
5. Be silent — don't narrate, just use

## Always-Visible Tools (Tier 1)

`amp_load`, `amp_store`, `amp_memory_read`, `amp_memory_insert`, `amp_grep`, `amp_context`, `amp_tools`

## On-Demand Domains (enable via `amp_tools`)

Call `amp_tools(action: "enable", domain: "<name>")` before using:

- `memory` (4) — `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive`
- `temporal` (2) — `amp_timeline`, `amp_fact_diff`
- `admin` (6) — `amp_query`, `amp_consolidate`, `amp_bootstrap`, `amp_resolve`, `amp_ingest_codebase`, `amp_provenance`
- `research` (6) — `amp_research_init/log/context/tree/contradictions/consolidate`
- `code` (7) — `amp_code_index/search/ast_grep/symbols/deps/context/watch`
- `arch` (6) — `amp_arch_register/relate/aspect`, `amp_impact`, `amp_arch_drift/context`
- `wiki` (3) — `amp_compile`, `amp_ingest`, `amp_lint`
- `retrieval` (1) — `amp_feedback`

## Decision Tree

- General context → `amp_context` (always visible)
- Memory load → `amp_load` (always visible)
- Memory store → `amp_store` (always visible)
- Read memory blocks → `amp_memory_read` (always visible)
- Update memory during session → `amp_memory_insert` (always visible)
- Enable a tool domain → `amp_tools` (always visible)
- Graph query → `amp_query` (enable `admin`)
- Knowledge provenance → `amp_provenance` (enable `admin`)
- Fact history for entity → `amp_timeline` (enable `temporal`)
- What changed between dates → `amp_fact_diff` (enable `temporal`)
- Update core preferences → `amp_memory_replace` (enable `memory`)
- Rewrite a memory block → `amp_memory_rewrite` (enable `memory`)
- Move block between tiers → `amp_memory_promote` (enable `memory`)
- Archive old blocks → `amp_memory_archive` (enable `memory`)
- Code search → `amp_code_search` (enable `code`)
- Code symbols → `amp_code_symbols` (enable `code`)
- Code deps → `amp_code_deps` (enable `code`)
- Architecture → `amp_arch_context` (enable `arch`)
- Blast radius → `amp_impact` (enable `arch`)
- Drift check → `amp_arch_drift` (enable `arch`)
- Build wiki → `amp_compile` (enable `wiki`)
- Ingest sources → `amp_ingest` (enable `wiki`)
- Health checks → `amp_lint` (enable `wiki`)

## Autonomous Behavior

Load memory at session start using Tier 1 tools only — no domain enablement needed. `amp_context`/`amp_load` automatically include the core blocks, so no separate read step is needed (use `amp_memory_read(block: "<name>")` only to re-read one specific block). Store decisions, preferences, bug fixes, and conventions automatically (`amp_store`). Update working memory during sessions (`amp_memory_insert`).

Before modifying code: enable `code` or `arch` domain via `amp_tools`, then load module context. Before planning: enable `arch` domain for architecture decisions and blast radius analysis.

At session end: enable `memory` domain, then promote valuable working memory (`amp_memory_promote`) and archive session blocks (`amp_memory_archive`). Enable `admin` domain to check consolidation. When user states preferences: enable `memory` domain, then `amp_memory_replace`. For temporal fact tracing: enable `temporal` domain, then `amp_timeline`.

When facts are contradicted, they get invalidated (not just overwritten).

For full documentation: see `skills/amp/SKILL.md` in the AMP repository root.
