# AMP Tool Quick Reference

## Progressive Disclosure

7 tools are always visible. All others require enabling their domain first via `amp_tools(action: "enable", domain: "<name>")`.

## Always Visible (Tier 1)

| Tool | Purpose |
|------|---------|
| `amp_load` | Load assembled memory context |
| `amp_store` | Store episodic memory with signals |
| `amp_memory_read` | Read memory blocks from a tier (core/working/archive) |
| `amp_memory_insert` | Insert or append to a memory block |
| `amp_grep` | Search memory by text pattern (exact or regex) across all node types |
| `amp_context` | Super-load: blends architecture + code + memory |
| `amp_tools` | Enable/disable/list on-demand tool domains |

## On-Demand Domains

### memory (4 tools)

| Tool | Purpose |
|------|---------|
| `amp_memory_replace` | Replace content in a memory block |
| `amp_memory_rewrite` | Full rewrite of a memory block |
| `amp_memory_promote` | Move a block between tiers (e.g., working → core) |
| `amp_memory_archive` | Archive a memory block |

### temporal (2 tools)

| Tool | Purpose |
|------|---------|
| `amp_timeline` | Chronological fact history for an entity |
| `amp_fact_diff` | What changed between two timestamps |

### admin (6 tools)

| Tool | Purpose |
|------|---------|
| `amp_query` | Read-only Cypher against Neo4j |
| `amp_consolidate` | Run/check/review consolidation |
| `amp_bootstrap` | One-time project graph setup |
| `amp_resolve` | Resolve amp:// URIs to markdown |
| `amp_ingest_codebase` | One-shot project setup: scan + bootstrap + index + seed |
| `amp_provenance` | Trace full lifecycle of a semantic node |

### code (7 tools)

| Tool | Purpose |
|------|---------|
| `amp_code_index` | AST-based code indexing (TS, JS, Python, Go, Rust; plus structural extraction for SQL, Terraform/HCL, MCP config) |
| `amp_code_search` | Hybrid fulltext + vector code search |
| `amp_code_ast_grep` | Structural AST search via ast-grep patterns (JS/TS/TSX) |
| `amp_code_symbols` | Query symbols by file/name/kind |
| `amp_code_deps` | Symbol deps: callers, callees, importers, inheritance |
| `amp_code_context` | Code-aware context assembly for a task |
| `amp_code_watch` | Background watcher that auto-reindexes changed files |

### arch (6 tools)

| Tool | Purpose |
|------|---------|
| `amp_arch_register` | Enrich entity with responsibility/interface/internals |
| `amp_arch_relate` | Create typed entity relationships |
| `amp_arch_aspect` | Cross-cutting concerns management |
| `amp_impact` | Blast radius analysis |
| `amp_arch_drift` | SHA-256 drift detection |
| `amp_arch_context` | Deterministic architectural context assembly |

### research (6 tools)

| Tool | Purpose |
|------|---------|
| `amp_research_init` | Initialize experiment campaign |
| `amp_research_log` | Log experiment with provenance |
| `amp_research_context` | Dynamic THINK phase context |
| `amp_research_tree` | Hypothesis tree visualization |
| `amp_research_contradictions` | Find conflicting principles |
| `amp_research_consolidate` | Research pattern consolidation |

### wiki (5 tools)

| Tool | Purpose |
|------|---------|
| `amp_compile` | Compile graph into interlinked markdown wiki |
| `amp_ingest` | Ingest source documents (auto-extracts entities/claims; also converts PDF, Word/.docx, Excel/.xlsx, HTML, RTF to text via optional system tools) |
| `amp_lint` | 10 graph health checks |
| `amp_braindump` | Capture a human brain dump as durable human-authored memory under a custom scope |
| `amp_wiki_sync` | Reconcile a human-edited wiki markdown file back into the graph via per-claim anchors |

### graph (4 tools)

| Tool | Purpose |
|------|---------|
| `amp_graph_report` | Deterministic graph audit: corpus summary, node/relation counts, memory-confidence summary, high-centrality "Core Abstractions", "Knowledge Areas", dependency cycles, low-confidence knowledge, knowledge gaps (general-purpose — any memory graph) |
| `amp_graph_export` | Portable JSON, or self-contained offline interactive HTML graph map (pan/zoom/drag, inspect nodes, color by type or knowledge area); secret-safe + XSS-escaped |
| `amp_pr_impact` | Blast radius of a GitHub PR over the code graph (changed files → symbols → dependent files; requires gh CLI) |
| `amp_pr_conflicts` | PR pairs whose impact overlaps (likely merge/review conflicts; requires gh CLI) |

### retrieval (1 tool)

| Tool | Purpose |
|------|---------|
| `amp_feedback` | Record result usefulness for ranking improvement |
