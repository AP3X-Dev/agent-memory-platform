---
id: -dpOFBGUExS5ZEOyb7dzu
session_id: oni-code-phase1-20260401
agent_id: mcp
task: [project:oni-code] Phase 1 plan written and committed — ready for execution
outcome: approved
created_at: "2026-04-01T07:06:56.406Z"
---

[project:oni-code] Phase 1 implementation plan committed at docs/superpowers/plans/2026-04-01-phase1-immediate-parity.md (commit 6d5f1e5).

PLAN: 9 tasks, 29 steps. TDD approach. All work in oni-code repo.

TASKS:
1-2: apply_patch tool (tests + implementation in coding.ts)
3: Plugin boot (bin.ts - loadAllPlugins, extract tools, pass to conductor)
4-5: MCP Bridge (tests + new mcp-bridge.ts + conductor wiring)
6-7: LSP tools (tests + new tools/lsp.ts + conductor wiring)
8: Command expansion (registry pattern, 6 new commands, conductor facades)
9: Final verification

READY FOR: subagent-driven-development execution.