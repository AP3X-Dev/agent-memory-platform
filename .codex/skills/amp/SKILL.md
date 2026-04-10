---
name: amp
description: "Agent Memory Protocol — persistent memory, architectural understanding, code intelligence, and unified retrieval via MCP tools."
---

# AMP — Agent Memory Protocol

Persistent memory for AI agents. 25 MCP tools. Use autonomously during all coding work.

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
- Code search → `amp_code_search`
- Code symbols → `amp_code_symbols`
- Code deps → `amp_code_deps`
- Architecture → `amp_arch_context`
- Blast radius → `amp_impact`
- Drift check → `amp_arch_drift`

## Autonomous Behavior

Load memory at session start. Store decisions, preferences, bug fixes, and conventions automatically. Check architecture context before planning. Use blast radius analysis before risky changes.

For full documentation: see `skills/amp/SKILL.md` in the AMP repository root.
