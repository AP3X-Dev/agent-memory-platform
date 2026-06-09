---
id: pAH154sk8nYPfs9_P0TAb
session_id: session-20260605-graph-pr
agent_id: mcp
task: [project:amp] Build the four selected "fancier" graph/memory features on top of the @amp/graph Minimal First PR, with a general-purpose (not coding-only) emphasis.
outcome: approved
created_at: "2026-06-06T03:24:00.188Z"
---

[project:amp] Extended @amp/graph and @amp/code/@amp/wiki with four features the user selected, in priority order, all green (1315 tests; 12 commits on branch graph-report):

1. General-purpose report — made the graph report content-adaptive: renamed "Import/Dependency Cycles" → "Dependency Cycles" (works for any USES graph, e.g. org-chart loops), gated the code-only "Components with no symbols" gap on presence of code nodes. Non-coding memory graphs (people/orgs/preferences) now read cleanly.

2. Visual memory map — amp_graph_export (new tool): JSON export + a self-contained, offline, dependency-free force-directed HTML viewer (pan/zoom/drag, click-to-inspect, color-by-type or by-knowledge-area toggle). XSS-safe: graph embedded as escaped JSON, labels rendered via textContent; server text via escapeHtml. Verified by syntax-checking the embedded viewer JS + round-tripping a script-terminator/secret payload. Traversal-safe optional file write under amp-graph-out/.

3. Knowledge clustering (themes) — deterministic pure-TS modularity (Louvain local-moving) community detection in community.ts. CRITICAL: plain label propagation collapsed two cliques across a single bridge edge; switched to modularity local-moving which separates them. Surfaced as a "Knowledge Areas" report section + the map's color-by-area toggle. Computed IN-MEMORY ONLY — never persisted, so it cannot pollute amp_load/retrieval/consolidation (sidesteps C-07's write-path concern entirely). No new tool, no graph writes.

4a. Non-code document ingestion — amp_ingest now converts PDF/Word/Excel/HTML/RTF to text before ingestion, with NO new npm dependencies (user's chosen approach): native HTML/RTF stripping; PDF/Office via OPTIONAL system tools (pdftotext/pandoc/libreoffice/ssconvert) detected at runtime with actionable errors when absent. SHA-256 manifest cache writes .amp/converted sidecars. Injected into IngestionService only in bootstrap; plain-text ingest + amp_braindump unchanged.

4b. PR impact — amp_pr_impact + amp_pr_conflicts (new tools): changed files → defined symbols → reverse SYMBOL_IMPORTS/SYMBOL_CALLS dependents → their files, plus knowledge areas + high-centrality nodes touched (MVP file/symbol-level per C-08, no brittle Symbol→module-Entity bridge). Conflicts flags PR pairs whose impact overlaps. GitHubCliProvider (mockable), graceful when gh absent.

4c. SQL/Terraform/MCP-config extractors in @amp/code — conservative dependency-free regex/JSON extractors routed through parseFile alongside tree-sitter. Navigated the C-15 traps: a new detectLanguage() (extension + config basename) replaced the scattered LANGUAGE_EXTENSIONS[ext] lookups and exempts .mcp.json from the dotfile skip; BOTH SupportedLanguage/LANGUAGE_EXTENSIONS defs (code/types.ts + mcp/codebase-scanner.ts) updated; SymbolKind extended (table/view/resource/config). MCP-config extraction is env-safe (server name + command binary only, never env/arg values — tested with planted secrets).

Tool count 45 → 48 (graph domain 1→4: report/export/pr_impact/pr_conflicts; extractors add no tools). Counts reconciled across README/CLAUDE.md.example/SKILL.md. Engineering judgment applied throughout per the user's "only if genuinely useful, not noise" bar: clustering kept write-free to avoid retrieval pollution; doc ingestion kept dependency-free; extractors emit symbols only (no resolver/whitelist changes needed).