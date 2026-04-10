---
type: always
description: AMP persistent memory — autonomous usage rules for all coding tasks
---

# AMP — Agent Memory Protocol

Use AMP MCP tools autonomously during all work. 25 tools across 5 domains.

## Rules
- Load memory at session start: `amp_context` or `amp_load`
- Store decisions, preferences, bugs, conventions via `amp_store`
- Scope everything with `project:<name>` tags
- Link stores to entity names
- Be silent — don't narrate AMP usage

## Tool Selection
- General context → `amp_context`
- Memory → `amp_load`, `amp_store`, `amp_query`, `amp_consolidate`
- Code search → `amp_code_search`, `amp_code_symbols`, `amp_code_deps`, `amp_code_context`
- Architecture → `amp_arch_context`, `amp_impact`, `amp_arch_register`, `amp_arch_relate`, `amp_arch_aspect`, `amp_arch_drift`
- Research → `amp_research_init`, `amp_research_log`, `amp_research_context`, `amp_research_tree`

## Autonomous Triggers
- Session start → load memory
- Before modifying code → load module context
- During debugging → check past bugs, blast radius
- When planning → load architecture decisions
- After decisions → store reasoning
- After bug fixes → store root cause
- Session end → store summary, check consolidation

Full reference: `skills/amp/SKILL.md`
