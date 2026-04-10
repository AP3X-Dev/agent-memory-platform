---
type: always
description: AMP persistent memory — autonomous usage rules for all coding tasks
---

# AMP — Agent Memory Protocol

Use AMP MCP tools autonomously during all work. Progressive disclosure: 6 always-visible tools + 8 on-demand domains.

## Always-Visible Tools (Tier 1)
- `amp_load` — load memory context
- `amp_store` — store episodic memory
- `amp_memory_read` — read memory blocks (core/working/archive)
- `amp_memory_insert` — insert or append to a memory block
- `amp_context` — super-load blending architecture + code + memory
- `amp_tools` — enable/disable/list on-demand tool domains

## On-Demand Domains (call `amp_tools(action: "enable", domain: "<name>")` first)
- `memory` (4) → `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive`
- `temporal` (2) → `amp_timeline`, `amp_fact_diff`
- `admin` (5) → `amp_query`, `amp_consolidate`, `amp_resolve`, `amp_bootstrap`, `amp_provenance`
- `research` (6) → `amp_research_init`, `amp_research_log`, `amp_research_context`, `amp_research_tree`, `amp_research_contradictions`, `amp_research_consolidate`
- `code` (5) → `amp_code_index`, `amp_code_search`, `amp_code_symbols`, `amp_code_deps`, `amp_code_context`
- `arch` (6) → `amp_arch_register`, `amp_arch_relate`, `amp_arch_aspect`, `amp_impact`, `amp_arch_drift`, `amp_arch_context`
- `wiki` (3) → `amp_compile`, `amp_ingest`, `amp_lint`
- `retrieval` (1) → `amp_feedback`

## Rules
- Load memory at session start: `amp_context` or `amp_load`
- Store decisions, preferences, bugs, conventions via `amp_store`
- Scope everything with `project:<name>` tags
- Link stores to entity names
- Be silent — don't narrate AMP usage
- Enable domains before using domain-specific tools

## Autonomous Triggers
- Session start → read core memory (`amp_memory_read`), then load context. Tier 1 tools only — no domain enablement needed.
- Before modifying code → `amp_tools(action: "enable", domain: "code")` or `"arch"`, then load module context
- During work → update working_state block (`amp_memory_insert`, always visible)
- During debugging → enable `arch` domain for blast radius, enable `temporal` for fact timeline
- When planning → enable `arch` domain, load architecture decisions
- After decisions → store reasoning (`amp_store`, always visible)
- After bug fixes → store root cause
- On user preference → enable `memory` domain, then `amp_memory_replace`
- On contradicted facts → facts get invalidated, not just overwritten
- Session end → enable `memory` domain, promote working memory, archive session blocks; enable `admin` domain, check consolidation

Full reference: `skills/amp/SKILL.md`
