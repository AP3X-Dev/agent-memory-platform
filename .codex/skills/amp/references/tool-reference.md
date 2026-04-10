# AMP Tool Quick Reference

| Tool | Domain | Purpose |
|------|--------|---------|
| `amp_context` | Retrieval | Super-load: blends architecture + code + memory |
| `amp_feedback` | Retrieval | Record result usefulness for ranking improvement |
| `amp_load` | Core | Load assembled memory context |
| `amp_store` | Core | Store episodic memory with signals |
| `amp_query` | Core | Read-only Cypher against Neo4j |
| `amp_consolidate` | Core | Run/check/review consolidation |
| `amp_resolve` | Core | Resolve amp:// URIs to markdown |
| `amp_bootstrap` | Core | One-time project graph setup |
| `amp_code_index` | Code | AST-based code indexing (TS, JS, Python, Go, Rust) |
| `amp_code_search` | Code | Hybrid fulltext + vector code search |
| `amp_code_symbols` | Code | Query symbols by file/name/kind |
| `amp_code_deps` | Code | Symbol deps: callers, callees, importers, inheritance |
| `amp_code_context` | Code | Code-aware context assembly for a task |
| `amp_arch_register` | Arch | Enrich entity with responsibility/interface/internals |
| `amp_arch_relate` | Arch | Create typed entity relationships |
| `amp_arch_aspect` | Arch | Cross-cutting concerns management |
| `amp_impact` | Arch | Blast radius analysis |
| `amp_arch_drift` | Arch | SHA-256 drift detection |
| `amp_arch_context` | Arch | Deterministic architectural context assembly |
| `amp_research_init` | Research | Initialize experiment campaign |
| `amp_research_log` | Research | Log experiment with provenance |
| `amp_research_context` | Research | Dynamic THINK phase context |
| `amp_research_tree` | Research | Hypothesis tree visualization |
| `amp_research_contradictions` | Research | Find conflicting principles |
| `amp_research_consolidate` | Research | Research pattern consolidation |
| `amp_provenance` | Core | Trace full lifecycle of a semantic node |
| `amp_timeline` | Core | Chronological fact history for an entity |
| `amp_fact_diff` | Core | What changed between two timestamps |
| `amp_memory_read` | Core | Read memory blocks from a tier (core/working/archive) |
| `amp_memory_insert` | Core | Insert or append to a memory block |
| `amp_memory_replace` | Core | Replace content in a memory block |
| `amp_memory_rewrite` | Core | Full rewrite of a memory block |
| `amp_memory_promote` | Core | Move a block between tiers (e.g., working → core) |
| `amp_memory_archive` | Core | Archive a memory block |
| `amp_compile` | Wiki | Compile graph into interlinked markdown wiki |
| `amp_ingest` | Wiki | Ingest source documents (auto-extracts entities/claims) |
| `amp_lint` | Wiki | 10 graph health checks |
