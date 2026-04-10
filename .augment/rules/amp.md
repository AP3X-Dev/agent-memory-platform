---
type: always
description: AMP persistent memory — autonomous usage rules for all coding tasks
---

# AMP — Agent Memory Protocol

Use AMP MCP tools autonomously during all work. 37 tools across 6 domains.

## Rules
- Load memory at session start: `amp_context` or `amp_load`
- Store decisions, preferences, bugs, conventions via `amp_store`
- Scope everything with `project:<name>` tags
- Link stores to entity names
- Be silent — don't narrate AMP usage

## Tool Selection
- General context → `amp_context`
- Memory → `amp_load`, `amp_store`, `amp_query`, `amp_consolidate`, `amp_provenance`
- Temporal facts → `amp_timeline`, `amp_fact_diff`
- Memory tiers → `amp_memory_read`, `amp_memory_insert`, `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive`
- Code search → `amp_code_search`, `amp_code_symbols`, `amp_code_deps`, `amp_code_context`
- Architecture → `amp_arch_context`, `amp_impact`, `amp_arch_register`, `amp_arch_relate`, `amp_arch_aspect`, `amp_arch_drift`
- Research → `amp_research_init`, `amp_research_log`, `amp_research_context`, `amp_research_tree`
- Wiki → `amp_compile`, `amp_ingest`, `amp_lint`

## Autonomous Triggers
- Session start → read core memory (`amp_memory_read`), then load context
- Before modifying code → load module context
- During work → update working_state block (`amp_memory_insert`)
- During debugging → check past bugs, blast radius, fact timeline
- When planning → load architecture decisions
- After decisions → store reasoning
- After bug fixes → store root cause
- On user preference → update user core block (`amp_memory_replace`)
- On contradicted facts → facts get invalidated, not just overwritten
- Session end → promote valuable working memory, archive session blocks, store summary, check consolidation

Full reference: `skills/amp/SKILL.md`
