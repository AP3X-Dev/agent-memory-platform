---
id: POKi5o9Qf8VdUgdP4IAxb
session_id: oni-code-phase1-20260401
agent_id: mcp
task: [project:oni-code] Phase 1 complete — all 5 immediate parity features wired
outcome: approved
created_at: "2026-04-01T07:32:26.899Z"
---

[project:oni-code] Phase 1 COMPLETE. All 5 immediate parity features implemented, tested, and committed on master.

COMMITS (6 total):
- 0e9ad88 feat: register apply_patch tool in makeCodingTools()
- ac290d7 feat: boot plugins at startup, pass tools to conductor
- 87ef761 feat: wire MCP servers at runtime via MCPBridge
- 633c04f feat: expose LSP operations as explicit agent tools
- b06ba41 feat: expand command surface with registry pattern and 6 new commands
- 8189ea2 fix: correct method names in apply_patch (recordChange, capture)

NEW FILES:
- src/mcp-bridge.ts (MCPBridge class)
- src/tools/lsp.ts (5 LSP tools)
- src/__tests__/apply-patch-tool.test.ts (4 tests)
- src/__tests__/mcp-bridge.test.ts (5 tests)
- src/__tests__/lsp-tools.test.ts (4 tests)

MODIFIED FILES:
- src/tools/coding.ts (apply_patch tool)
- src/bin.ts (plugin boot)
- src/conductor.ts (MCP bridge, LSP tools, facade methods)
- src/ui/command-menu.ts (registry pattern, 12 commands total)

TYPECHECK: Clean (0 errors).

WHAT'S NOW WIRED:
1. apply_patch — tool registered, system prompt promise fulfilled
2. Plugins — loaded at startup, tools injected into conductor
3. MCP — servers connect at runtime, tools discovered and wrapped
4. LSP — 5 explicit tools for definition/references/symbols/hover/completions
5. Commands — 12 slash commands with registry pattern (/help, /status, /changes, /mode, /clear, /exit, /compact, /mcp, /agents, /tools, /memory, /export)

NEXT: Phase 2 (kernel + permissions hardening) or Phase 3 (agent runtime) per roadmap.