---
name: amp
description: "Agent Memory Platform — persistent memory with progressive tool disclosure, temporal facts, memory tiers, architectural understanding, code intelligence, and unified retrieval via MCP tools."
---

# AMP — Agent Memory Platform

Persistent memory for AI agents. Progressive disclosure: 8 always-visible tools + 9 on-demand domains.

## 5 Rules

1. Load before working — `amp_context` or `amp_load`
2. Store after deciding — `amp_store`
3. Scope with project tags — `project:<name>`
4. Link to entities — include entity names in stores
5. Be silent — don't narrate, just use

## Always-Visible Tools (Tier 1)

`amp_load`, `amp_store`, `amp_memory_read`, `amp_memory_insert`, `amp_grep`, `amp_context`, `amp_ask`, `amp_tools`

`amp_ask` is dialectic retrieval: ask a natural-language question and get a synthesized, **cited** answer (not raw chunks); `reasoning_level` minimal→max trades latency for depth. Use it when the answer needs reasoning across several memories; use `amp_context` for raw assembled context.

## On-Demand Domains (enable via `amp_tools`)

Call `amp_tools(action: "enable", domain: "<name>")` before using:

- `memory` (4) — `amp_memory_replace`, `amp_memory_rewrite`, `amp_memory_promote`, `amp_memory_archive`
- `temporal` (2) — `amp_timeline`, `amp_fact_diff`
- `admin` (6) — `amp_query`, `amp_consolidate`, `amp_bootstrap`, `amp_resolve`, `amp_ingest_codebase`, `amp_provenance`
- `research` (6) — `amp_research_init/log/context/tree/contradictions/consolidate`
- `code` (7) — `amp_code_index/search/ast_grep/symbols/deps/context/watch` (`amp_code_index` extracts structure for TypeScript, JavaScript, Python, Go, Rust, plus SQL tables/views/functions, Terraform/HCL resources/modules/variables/outputs, and MCP config servers — env-safe)
- `arch` (6) — `amp_arch_register/relate/aspect`, `amp_impact`, `amp_arch_drift/context`
- `wiki` (5) — `amp_compile`, `amp_ingest`, `amp_lint`, `amp_braindump`, `amp_wiki_sync` (`amp_ingest` also converts PDF, Word/.docx, Excel/.xlsx, HTML, and RTF documents to text via optional system tools, in addition to text/markdown)
- `retrieval` (1) — `amp_feedback`
- `graph` (4) — `amp_graph_report`, `amp_graph_export`, `amp_pr_impact`, `amp_pr_conflicts` (read-only, project-scoped, secret-safe; disabled by default)

## Decision Tree

- General context → `amp_context` (always visible)
- Ask a question, get a cited answer → `amp_ask` (always visible)
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
- Ingest sources (incl. PDF/Word/Excel/HTML/RTF) → `amp_ingest` (enable `wiki`)
- Health checks → `amp_lint` (enable `wiki`)
- Capture human brain dump → `amp_braindump` (enable `wiki`)
- Sync human-edited wiki back into graph → `amp_wiki_sync` (enable `wiki`)
- Graph audit / corpus summary / core abstractions → `amp_graph_report` (enable `graph`)
- Export graph (JSON / offline HTML map) → `amp_graph_export` (enable `graph`)
- PR blast radius over code graph → `amp_pr_impact` (enable `graph`, needs `gh` CLI)
- PR pairs likely to conflict → `amp_pr_conflicts` (enable `graph`, needs `gh` CLI)

## Recall — pull the right context, precisely

Recalling the right memory at the right moment without flooding the context window is the whole point — recall is as automatic as storing.

- Recall continuously, not just at session start: before answering about an entity, deciding, modifying a module, assuming a default/limit/preference, or re-asking the user. If you might already know it, check first.
- Recall precisely: scope every load with `entities` + `tags` (`project:<tag>`) and set `max_tokens` to the smallest that fits — the right context, not all of it. Start specific; widen only if empty.
- Smallest tool that fits: `amp_grep` (specific fact/preference) · `amp_memory_read(block)` (known block) · `amp_load(task, entities, tags, max_tokens)` (scoped task memory) · `amp_context` (cross-cutting) · `amp_timeline`/`amp_fact_diff` (how knowledge changed) · `amp_code_search` (code).
- Close the loop: enable `retrieval`, use `amp_feedback` when recalled memory helped (or didn't).

## Autonomous Behavior

Load memory at session start using Tier 1 tools only — no domain enablement needed. `amp_context`/`amp_load` automatically include the core blocks, so no separate read step is needed (use `amp_memory_read(block: "<name>")` only to re-read one specific block). Store decisions, preferences, bug fixes, and conventions automatically (`amp_store`). Update working memory during sessions (`amp_memory_insert`).

Before modifying code: enable `code` or `arch` domain via `amp_tools`, then load module context. Before planning: enable `arch` domain for architecture decisions and blast radius analysis.

At session end: enable `memory` domain, then promote valuable working memory (`amp_memory_promote`) and archive session blocks (`amp_memory_archive`). Enable `admin` domain to check consolidation. When user states preferences: enable `memory` domain, then `amp_memory_replace`. For temporal fact tracing: enable `temporal` domain, then `amp_timeline`.

When facts are contradicted, they get invalidated (not just overwritten). Facts also carry an `inference_type` — `deductive` (explicit, default), `inductive` (consolidation-generalized), or `abductive` (a guess from the background "dream" pass); abductive facts rank lower and render as `[hypothesis]`. The dream pass runs via `amp_consolidate(action: "dream", scope: "project:<tag>")` (enable `admin`) or the `amp dream` CLI / nightly timer — it only adds low-confidence hypotheses, never overwrites known facts.

For full documentation: see `skills/amp/SKILL.md` in the AMP repository root.
