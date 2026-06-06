---
type: always
description: AMP persistent memory — autonomous usage rules for all coding tasks
---

# AMP — Agent Memory Platform

Use AMP MCP tools autonomously during all work. Progressive disclosure: 7 always-visible tools + 9 on-demand domains.

## Always-Visible Tools (Tier 1)
- `amp_load` — load memory context
- `amp_store` — store episodic memory
- `amp_memory_read` — read memory blocks (core/working/archive)
- `amp_memory_insert` — insert or append to a memory block
- `amp_grep` — search memory by text pattern (exact or regex) across all node types
- `amp_context` — super-load blending architecture + code + memory
- `amp_tools` — enable/disable/list on-demand tool domains

## On-Demand Domains (call `amp_tools(action: "enable", domain: "<name>")` first)
- `memory` (4) → `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive`
- `temporal` (2) → `amp_timeline`, `amp_fact_diff`
- `admin` (6) → `amp_query`, `amp_consolidate`, `amp_resolve`, `amp_bootstrap`, `amp_ingest_codebase`, `amp_provenance`
- `research` (6) → `amp_research_init`, `amp_research_log`, `amp_research_context`, `amp_research_tree`, `amp_research_contradictions`, `amp_research_consolidate`
- `code` (7) → `amp_code_index`, `amp_code_search`, `amp_code_ast_grep`, `amp_code_symbols`, `amp_code_deps`, `amp_code_context`, `amp_code_watch` — `amp_code_index` does structural extraction for TypeScript, JavaScript, Python, Go, Rust, SQL (tables/views/functions), Terraform/HCL (resources/modules/variables/outputs), and MCP config files (servers; env-safe)
- `arch` (6) → `amp_arch_register`, `amp_arch_relate`, `amp_arch_aspect`, `amp_impact`, `amp_arch_drift`, `amp_arch_context`
- `wiki` (5) → `amp_compile`, `amp_ingest`, `amp_lint`, `amp_braindump`, `amp_wiki_sync` — `amp_ingest` also converts PDF, Word/.docx, Excel/.xlsx, HTML, RTF to text via optional system tools, in addition to text/markdown
- `retrieval` (1) → `amp_feedback`
- `graph` (4) → `amp_graph_report`, `amp_graph_export`, `amp_pr_impact`, `amp_pr_conflicts` — disabled by default, read-only, project-scoped, secret-safe. `amp_graph_report` is a deterministic graph audit (corpus summary, node/relation counts, confidence summary, high-centrality Core Abstractions, Knowledge Areas, dependency cycles, low-confidence knowledge, knowledge gaps) that works for ANY memory graph, not just code. `amp_graph_export` emits portable JSON or a self-contained offline interactive HTML graph map. `amp_pr_impact` and `amp_pr_conflicts` analyze GitHub PR blast radius and overlap (require the `gh` CLI)

## Rules
- Load memory at session start: `amp_context` or `amp_load`
- Store decisions, preferences, bugs, conventions via `amp_store`
- Scope everything with `project:<name>` tags
- Link stores to entity names
- Be silent — don't narrate AMP usage
- Enable domains before using domain-specific tools

## Recall — pull the right context, precisely
Recalling the right memory at the right moment without flooding the context window is the whole point — recall is as automatic as storing.
- Recall continuously, not just at session start: before answering about an entity, deciding, modifying a module, assuming a default/limit/preference, or re-asking the user. If you might already know it, check first.
- Recall precisely: scope every load with `entities` + `tags` (`project:<tag>`) and set `max_tokens` to the smallest that fits — the right context, not all of it. Start specific; widen only if empty.
- Smallest tool that fits: `amp_grep` (specific fact/preference) · `amp_memory_read(block)` (known block) · `amp_load(task, entities, tags, max_tokens)` (scoped task memory) · `amp_context` (cross-cutting) · `amp_timeline`/`amp_fact_diff` (how knowledge changed) · `amp_code_search` (code).
- Close the loop: enable `retrieval`, use `amp_feedback` when recalled memory helped (or didn't).

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
