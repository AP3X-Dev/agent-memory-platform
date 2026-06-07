---
type: always
description: MemBerry persistent memory — autonomous usage rules for all coding tasks
---

# MemBerry — persistent memory for AI agents

Use MemBerry MCP tools autonomously during all work. Progressive disclosure: 8 always-visible tools + 9 on-demand domains.

## Always-Visible Tools (Tier 1)
- `berry_load` — load memory context
- `berry_store` — store episodic memory
- `berry_memory_read` — read memory blocks (core/working/archive)
- `berry_memory_insert` — insert or append to a memory block
- `berry_grep` — search memory by text pattern (exact or regex) across all node types
- `berry_context` — super-load blending architecture + code + memory
- `berry_ask` — dialectic retrieval: ask a question, get a synthesized **cited** answer (not raw chunks); `reasoning_level` minimal→max trades latency for depth. Use when the answer needs reasoning across several memories; use `berry_context` for raw context
- `berry_tools` — enable/disable/list on-demand tool domains

## On-Demand Domains (call `berry_tools(action: "enable", domain: "<name>")` first)
- `memory` (4) → `berry_memory_replace`, `berry_memory_rewrite`, `berry_memory_promote`, `berry_memory_archive`
- `temporal` (2) → `berry_timeline`, `berry_fact_diff`
- `admin` (6) → `berry_query`, `berry_consolidate` (incl. `action:"dream"` — background gap-filling + abductive hypotheses), `berry_resolve`, `berry_bootstrap`, `berry_ingest_codebase`, `berry_provenance`
- `research` (6) → `berry_research_init`, `berry_research_log`, `berry_research_context`, `berry_research_tree`, `berry_research_contradictions`, `berry_research_consolidate`
- `code` (7) → `berry_code_index`, `berry_code_search`, `berry_code_ast_grep`, `berry_code_symbols`, `berry_code_deps`, `berry_code_context`, `berry_code_watch` — `berry_code_index` does structural extraction for TypeScript, JavaScript, Python, Go, Rust, SQL (tables/views/functions), Terraform/HCL (resources/modules/variables/outputs), and MCP config files (servers; env-safe)
- `arch` (6) → `berry_arch_register`, `berry_arch_relate`, `berry_arch_aspect`, `berry_impact`, `berry_arch_drift`, `berry_arch_context`
- `wiki` (5) → `berry_compile`, `berry_ingest`, `berry_lint`, `berry_braindump`, `berry_wiki_sync` — `berry_ingest` also converts PDF, Word/.docx, Excel/.xlsx, HTML, RTF to text via optional system tools, in addition to text/markdown
- `retrieval` (1) → `berry_feedback`
- `graph` (4) → `berry_graph_report`, `berry_graph_export`, `berry_pr_impact`, `berry_pr_conflicts` — disabled by default, read-only, project-scoped, secret-safe. `berry_graph_report` is a deterministic graph audit (corpus summary, node/relation counts, confidence summary, high-centrality Core Abstractions, Knowledge Areas, dependency cycles, low-confidence knowledge, knowledge gaps) that works for ANY memory graph, not just code. `berry_graph_export` emits portable JSON or a self-contained offline interactive HTML graph map. `berry_pr_impact` and `berry_pr_conflicts` analyze GitHub PR blast radius and overlap (require the `gh` CLI)

## Rules
- Load memory at session start: `berry_context` or `berry_load`
- Store decisions, preferences, bugs, conventions via `berry_store`
- Scope everything with `project:<name>` tags
- Link stores to entity names
- Be silent — don't narrate MemBerry usage
- Enable domains before using domain-specific tools

## Recall — pull the right context, precisely
Recalling the right memory at the right moment without flooding the context window is the whole point — recall is as automatic as storing.
- Recall continuously, not just at session start: before answering about an entity, deciding, modifying a module, assuming a default/limit/preference, or re-asking the user. If you might already know it, check first.
- Recall precisely: scope every load with `entities` + `tags` (`project:<tag>`) and set `max_tokens` to the smallest that fits — the right context, not all of it. Start specific; widen only if empty.
- Smallest tool that fits: `berry_grep` (specific fact/preference) · `berry_memory_read(block)` (known block) · `berry_load(task, entities, tags, max_tokens)` (scoped task memory) · `berry_context` (cross-cutting) · `berry_timeline`/`berry_fact_diff` (how knowledge changed) · `berry_code_search` (code).
- Close the loop: enable `retrieval`, use `berry_feedback` when recalled memory helped (or didn't).

## Autonomous Triggers
- Session start → read core memory (`berry_memory_read`), then load context. Tier 1 tools only — no domain enablement needed.
- Before modifying code → `berry_tools(action: "enable", domain: "code")` or `"arch"`, then load module context
- During work → update working_state block (`berry_memory_insert`, always visible)
- During debugging → enable `arch` domain for blast radius, enable `temporal` for fact timeline
- When planning → enable `arch` domain, load architecture decisions
- After decisions → store reasoning (`berry_store`, always visible)
- After bug fixes → store root cause
- On user preference → enable `memory` domain, then `berry_memory_replace`
- On contradicted facts → facts get invalidated, not just overwritten
- Facts carry an `inference_type`: `deductive` (explicit), `inductive` (consolidation-generalized), `abductive` (a dream-pass guess). Abductive facts rank lower and show as `[hypothesis]` — never treat a guess as a known fact
- Session end → enable `memory` domain, promote working memory, archive session blocks; enable `admin` domain, check consolidation

Full reference: `skills/amp/SKILL.md`
