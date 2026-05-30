---
id: KP85w5t7mnfCBfAfHodB0
session_id: session-20260429-amp-wiki-overhaul
agent_id: mcp
task: [project:amp] AMP wiki health audit, fixes, and Operations Console redesign
created_at: "2026-04-30T05:42:54.181Z"
---

[project:amp] Wiki overhaul session. Five durable fixes shipped to ~/projects/amp/packages/:

1. mcp/src/bootstrap.ts — added setWikiServiceInstances call. amp_lint, amp_compile, amp_ingest were dead-on-arrival via MCP because the wiki services were never injected; now wired with a small adapter for WikiCompiler.compile() (string vs CompileInput mismatch).

2. wiki/src/viewer.ts — three changes: (a) resolve [[wikilinks]] BEFORE marked.parse() because marked v15's pipe-table tokenizer was splitting [[link|display]] at the | character, leaking <td align="right"> into the rendered HTML; (b) full reskin to "Operations Console" design — black/yellow Cerebro aesthetic, JetBrains Mono + Archivo Black, sticky topbar with NEO4J ONLINE pill, custom dark scrollbars; (c) bespoke /_index home renderer that parses _index.md/_recent.md/_decisions.md to emit hero + collapsible SVG graph (12 project nodes around amp hub, 🔵 emoji nodes, pan/zoom/pinch via inline JS, scroll-to-zoom, drag-to-pan, +/-/⊙ controls, default-collapsed via <details>) + 8-cell stat strip + 2-col projects table + activity ticker + top decisions strip.

3. wiki/src/lint.ts — coverage_gaps Cypher: WITH tag was dropping s from scope before RETURN s.confidence; fixed to WITH s, tag and properly scoped to projectName via parameter.

4. core/src/types.ts + core/src/service.ts + neo4j/src/episodic.ts + mcp/src/tools.ts — Episodic nodes now persist scope and tags. Auto-derives scope from [project:xxx] prefix in task/content when not explicitly passed. amp_store MCP schema now accepts tags and entities (entities was previously silently dropped).

Data fixes:
- Backfilled 453 of 465 existing Episodic nodes with scope + tags from their [project:xxx] prefix. 11 prefixless orphans remain.
- Deleted 2 truly-empty ghost project Entities: Downloads-oni-code (path-leak duplicate of oni-code) and pi-mono (unfilled stub).
- Migrated 8 episodes from project:scribo-v2 → project:scribo-2 (canonical = Desktop\Scribo-2.0).
- Migrated 98 episodes from project:agent-assist → project:agent-assist-cr (canonical = Desktop\Agent-Assist-CR).

Portal headline: 20 projects → 16 projects, sessions 462 → 465, table broken → clean. amp-mcp and amp-wiki services restarted clean, all-services-initialized banner present.

Project canonicalization decisions confirmed by user:
- KEEP SEPARATE: oni-core, oni-code, oni-agent (different repos, siblings).
- KEEP SEPARATE: ap3x-core, ap3x-solana (siblings).
- CANONICAL: scribo-2 over scribo-v2; agent-assist-cr over agent-assist.

Open items left for follow-up sessions:
- Bare project:ap3x (19 episodes from April 9 Phase 4a Electron/Vite work) — needs user call on whether to fold into ap3x-core or ap3x-solana.
- AP3X-Solana Entity (mixed-case) vs episodes using lowercase project:ap3x-solana — case is harmonized via slugify in the wiki UI but Entity name still capitalized; could rename or add aliases.
- claude-code-main has 1 semantic + 1 rel; user hasn't decided keep-or-delete.
- Bootstrap missing real-project Entity hierarchies for: oni-core, oni-agent, amp, gmgn-wallet-tracker, cic2, tachi, agent-assist-cr (proper modules), scribo-2, clean-room-skill — needs user input on entities/modules per project.

Surfaced by amp_lint after the fix: 41 broken_links (entities not in any project hierarchy — same root cause as the bootstrap gap), 1 contradiction at confidence 0.85 on an Electron renderer claim, 13 low_confidence research hypotheses pending reinforcement.</content>
<outcome>approved</outcome>
</invoke>