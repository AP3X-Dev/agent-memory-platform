---
id: _JV3UjIkY9U8zh4jzhcH9
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Design spec written and committed — ready for implementation planning
outcome: approved
created_at: "2026-04-01T05:29:49.549Z"
---

[project:oni-code] Design spec committed at docs/superpowers/specs/2026-03-31-oni-core-primitives-design.md (commit a1bdea2 on master branch in oni-code repo).

STATUS: All 4 core primitive designs complete. Spec self-reviewed — no placeholders, contradictions, or ambiguity.

NEXT STEP: Invoke writing-plans skill to create implementation plan, then implement in oni-core-cerebro (C:\Users\Guerr\Desktop\oni-core-cerebro).

IMPLEMENTATION ORDER:
1. Tool parallel batching (harness/loop/tools.ts) — smallest, pattern exists
2. LSP depth (lsp/client.ts, types.ts, index.ts) — mechanical wiring
3. Background agent handles (new harness/background-agent.ts) — new abstraction
4. Memory extraction pipeline (new harness/memory/extractor.ts) — most open-ended

All changes target @oni.bot/core in oni-core-cerebro. oni-code product work starts after core is ready.