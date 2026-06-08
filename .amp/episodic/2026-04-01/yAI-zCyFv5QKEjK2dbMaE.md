---
id: yAI-zCyFv5QKEjK2dbMaE
session_id: oni-code-phase1-20260401
agent_id: mcp
task: [project:oni-code] Phase 1 design approved — 5 immediate parity fixes
outcome: approved
created_at: "2026-04-01T07:02:05.790Z"
---

[project:oni-code] Phase 1 design approved. 5 independent product-level changes in oni-code.

1. Register apply_patch — wrap patch.ts parser in a tool, add to makeCodingTools()
2. Boot plugins at startup — call loadAllPlugins() in bin.ts, pass tools to Conductor
3. Wire MCP servers at runtime — instantiate MCP clients from config, discover tools, merge into tool set
4. Expose LSP as explicit tools — 5 new tools wrapping LSPManager methods in src/tools/lsp.ts
5. Expand command surface — command registry pattern, add /compact, /mcp, /agents, /tools, /memory, /export

All work targets C:\Users\Guerr\Downloads\oni-code on master branch.