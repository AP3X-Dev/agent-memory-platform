---
name: amp
description: "AMP admin and explicit queries. Use when the user explicitly asks about AMP: 'amp status', 'amp query', 'show the graph', 'run consolidation', 'review proposals', 'what's in amp', 'provenance', 'compile wiki', 'ingest', 'lint'. NOT needed for normal coding — the agent uses AMP autonomously via CLAUDE.md instructions."
allowed-tools: Read, Glob, mcp__amp__amp_load, mcp__amp__amp_store, mcp__amp__amp_query, mcp__amp__amp_consolidate, mcp__amp__amp_resolve, mcp__amp__amp_provenance, mcp__amp__amp_compile, mcp__amp__amp_ingest, mcp__amp__amp_lint, mcp__amp__amp_context, mcp__amp__amp_feedback, mcp__amp__amp_bootstrap, mcp__amp__amp_timeline, mcp__amp__amp_fact_diff, mcp__amp__amp_memory_read, mcp__amp__amp_memory_insert, mcp__amp__amp_memory_replace, mcp__amp__amp_memory_rewrite, mcp__amp__amp_memory_promote, mcp__amp__amp_memory_archive, mcp__amp__amp_grep, mcp__amp__amp_tools, mcp__amp__amp_graph_report, mcp__amp__amp_graph_export, mcp__amp__amp_pr_impact, mcp__amp__amp_pr_conflicts
argument-hint: "status | query <q> | consolidate [run|review] | recall [topic] | remember <what> | provenance <id> | compile | ingest <path> | lint | timeline <entity> | fact-diff <entity> | memory [read|write|promote] <block> | grep <pattern> | graph [report|export] | pr-impact <num> | pr-conflicts"
---

# AMP — Admin & Explicit Queries

For the rare times the user explicitly asks to interact with AMP. Normal coding workflows use AMP **automatically** via the CLAUDE.md instructions.

## Subcommands

| Subcommand | What it does |
|------------|-------------|
| `status` | Health check + graph stats. See [reference/admin.md](reference/admin.md) |
| `query <q>` | Natural language or Cypher query. See [reference/memory-ops.md](reference/memory-ops.md) |
| `consolidate [run\|review]` | Manage consolidation. See [reference/admin.md](reference/admin.md) |
| `recall [topic]` | Explicit memory load. See [reference/memory-ops.md](reference/memory-ops.md) |
| `remember <what>` | Explicit memory store. See [reference/memory-ops.md](reference/memory-ops.md) |
| `provenance <id>` | Trace the full lifecycle of a semantic node. See [reference/provenance.md](reference/provenance.md) |
| `compile` | Compile the knowledge graph into an interlinked wiki. See [reference/wiki.md](reference/wiki.md) |
| `ingest <path>` | Ingest a source document into the graph. See [reference/wiki.md](reference/wiki.md) |
| `lint` | Run health checks on the knowledge graph. See [reference/wiki.md](reference/wiki.md) |
| `timeline <entity>` | Chronological fact history for an entity. See [reference/memory-ops.md](reference/memory-ops.md) |
| `fact-diff <entity>` | What changed about an entity between two timestamps. See [reference/memory-ops.md](reference/memory-ops.md) |
| `memory [read\|write\|promote] <block>` | Read, edit, or manage memory tier blocks. See [reference/memory-ops.md](reference/memory-ops.md) |
| `graph [report\|export]` | Deterministic graph audit (`amp_graph_report`: corpus summary, node/relation counts, core abstractions, knowledge areas, cycles, low-confidence/gaps) or portable JSON / offline interactive HTML map (`amp_graph_export`). Read-only, project-scoped, secret-safe. Works for any memory graph, not just code. See [reference/admin.md](reference/admin.md) |
| `pr-impact <num>` | Blast radius of a GitHub PR over the code graph (`amp_pr_impact`: changed files → symbols → dependents, plus knowledge areas + high-centrality nodes touched). Requires the `gh` CLI. See [reference/provenance.md](reference/provenance.md) |
| `pr-conflicts` | PR pairs whose impact overlaps — likely merge/review conflicts (`amp_pr_conflicts`). Requires the `gh` CLI. See [reference/provenance.md](reference/provenance.md) |

**No subcommand?** Default to `status`.

Read the reference file for your subcommand before executing.
