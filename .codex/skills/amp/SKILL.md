---
name: amp
description: "Agent Memory Protocol — persistent memory with temporal facts, memory tiers, architectural understanding, code intelligence, and unified retrieval via MCP tools."
---

# AMP — Agent Memory Protocol

Persistent memory for AI agents. 37 MCP tools. Use autonomously during all coding work.

## 5 Rules

1. Load before working — `amp_context` or `amp_load`
2. Store after deciding — `amp_store`
3. Scope with project tags — `project:<name>`
4. Link to entities — include entity names in stores
5. Be silent — don't narrate, just use

## Decision Tree

- General context → `amp_context`
- Memory load → `amp_load`
- Memory store → `amp_store`
- Graph query → `amp_query`
- Knowledge provenance → `amp_provenance`
- Fact history for entity → `amp_timeline`
- What changed between dates → `amp_fact_diff`
- Read memory blocks → `amp_memory_read`
- Update memory during session → `amp_memory_insert`
- Update core preferences → `amp_memory_replace`
- Rewrite a memory block → `amp_memory_rewrite`
- Move block between tiers → `amp_memory_promote`
- Archive old blocks → `amp_memory_archive`
- Code search → `amp_code_search`
- Code symbols → `amp_code_symbols`
- Code deps → `amp_code_deps`
- Architecture → `amp_arch_context`
- Blast radius → `amp_impact`
- Drift check → `amp_arch_drift`
- Build wiki → `amp_compile`
- Ingest sources → `amp_ingest`
- Health checks → `amp_lint`

## Autonomous Behavior

Load memory at session start. Read core memory (`amp_memory_read`) for always-visible context. Store decisions, preferences, bug fixes, and conventions automatically. Update working memory during sessions (`amp_memory_insert`). Update core memory when user states preferences (`amp_memory_replace`). At session end, promote valuable working memory (`amp_memory_promote`) and archive session blocks (`amp_memory_archive`). Check architecture context before planning. Use blast radius analysis before risky changes. Use `amp_timeline` to trace how facts about an entity evolved. When facts are contradicted, they get invalidated (not just overwritten).

For full documentation: see `skills/amp/SKILL.md` in the AMP repository root.
