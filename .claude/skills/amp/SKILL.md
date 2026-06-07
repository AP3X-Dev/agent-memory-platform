---
name: amp
description: "MemBerry admin and explicit queries. Use when the user explicitly asks about MemBerry: 'memberry status', 'memberry query', 'show the graph', 'run consolidation', 'review proposals', 'what's in memberry', 'provenance', 'compile wiki', 'ingest', 'lint'. NOT needed for normal coding — the agent uses MemBerry autonomously via CLAUDE.md instructions."
allowed-tools: Read, Glob, mcp__memberry__berry_load, mcp__memberry__berry_store, mcp__memberry__berry_ask, mcp__memberry__berry_query, mcp__memberry__berry_consolidate, mcp__memberry__berry_resolve, mcp__memberry__berry_provenance, mcp__memberry__berry_compile, mcp__memberry__berry_ingest, mcp__memberry__berry_lint, mcp__memberry__berry_context, mcp__memberry__berry_feedback, mcp__memberry__berry_bootstrap, mcp__memberry__berry_timeline, mcp__memberry__berry_fact_diff, mcp__memberry__berry_memory_read, mcp__memberry__berry_memory_insert, mcp__memberry__berry_memory_replace, mcp__memberry__berry_memory_rewrite, mcp__memberry__berry_memory_promote, mcp__memberry__berry_memory_archive, mcp__memberry__berry_grep, mcp__memberry__berry_tools, mcp__memberry__berry_graph_report, mcp__memberry__berry_graph_export, mcp__memberry__berry_pr_impact, mcp__memberry__berry_pr_conflicts
argument-hint: "status | ask <question> | query <q> | consolidate [run|review|dream] | recall [topic] | remember <what> | provenance <id> | compile | ingest <path> | lint | timeline <entity> | fact-diff <entity> | memory [read|write|promote] <block> | grep <pattern> | graph [report|export] | pr-impact <num> | pr-conflicts"
---

# MemBerry — Admin & Explicit Queries

For the rare times the user explicitly asks to interact with MemBerry. Normal coding workflows use MemBerry **automatically** via the CLAUDE.md instructions.

## Subcommands

| Subcommand | What it does |
|------------|-------------|
| `status` | Health check + graph stats. See [reference/admin.md](reference/admin.md) |
| `ask <question>` | Dialectic retrieval — ask a question, get a synthesized cited answer (not raw chunks) via `berry_ask`. See [reference/memory-ops.md](reference/memory-ops.md) |
| `query <q>` | Natural language or Cypher query. See [reference/memory-ops.md](reference/memory-ops.md) |
| `consolidate [run\|review\|dream]` | Manage consolidation, or `dream` — the background gap-filling / abductive-hypothesis pass. See [reference/admin.md](reference/admin.md) |
| `recall [topic]` | Explicit memory load. See [reference/memory-ops.md](reference/memory-ops.md) |
| `remember <what>` | Explicit memory store. See [reference/memory-ops.md](reference/memory-ops.md) |
| `provenance <id>` | Trace the full lifecycle of a semantic node. See [reference/provenance.md](reference/provenance.md) |
| `compile` | Compile the knowledge graph into an interlinked wiki. See [reference/wiki.md](reference/wiki.md) |
| `ingest <path>` | Ingest a source document into the graph. See [reference/wiki.md](reference/wiki.md) |
| `lint` | Run health checks on the knowledge graph. See [reference/wiki.md](reference/wiki.md) |
| `timeline <entity>` | Chronological fact history for an entity. See [reference/memory-ops.md](reference/memory-ops.md) |
| `fact-diff <entity>` | What changed about an entity between two timestamps. See [reference/memory-ops.md](reference/memory-ops.md) |
| `memory [read\|write\|promote] <block>` | Read, edit, or manage memory tier blocks. See [reference/memory-ops.md](reference/memory-ops.md) |
| `graph [report\|export]` | Deterministic graph audit (`berry_graph_report`: corpus summary, node/relation counts, core abstractions, knowledge areas, cycles, low-confidence/gaps) or portable JSON / offline interactive HTML map (`berry_graph_export`). Read-only, project-scoped, secret-safe. Works for any memory graph, not just code. See [reference/admin.md](reference/admin.md) |
| `pr-impact <num>` | Blast radius of a GitHub PR over the code graph (`berry_pr_impact`: changed files → symbols → dependents, plus knowledge areas + high-centrality nodes touched). Requires the `gh` CLI. See [reference/provenance.md](reference/provenance.md) |
| `pr-conflicts` | PR pairs whose impact overlaps — likely merge/review conflicts (`berry_pr_conflicts`). Requires the `gh` CLI. See [reference/provenance.md](reference/provenance.md) |

**No subcommand?** Default to `status`.

Read the reference file for your subcommand before executing.
