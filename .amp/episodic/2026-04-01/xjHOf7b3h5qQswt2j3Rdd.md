---
id: xjHOf7b3h5qQswt2j3Rdd
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Core primitives merged to main — ready for oni-code product work
outcome: approved
created_at: "2026-04-01T06:36:53.944Z"
---

[project:oni-code] feat/core-primitives merged to main in oni-core-cerebro. All 4 primitives now available on main branch.

NEXT: Begin oni-code product work. Phase 1 immediate parity items (from roadmap):
1. Register apply_patch as a tool (parser exists at src/tools/patch.ts, not registered in makeCodingTools())
2. Boot plugins at startup (plugin-loader.ts exists, not called during boot)
3. Turn mcpServers from config metadata into runtime tools (MCP client ready in core)
4. Expose LSP operations through explicit tools (LSP depth now available in core)
5. Expand command surface (currently only /help, /status, /changes, /mode, /clear, /exit)