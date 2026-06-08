---
id: SxuxbhyU4Cpw9R3DvKkdu
session_id: session-20260413-155500
agent_id: mcp
task: [project:oni-code] Ship parity-v0.2 Slice E — multi-runtime MCP server pooling
outcome: approved
created_at: "2026-04-13T22:58:26.351Z"
---

[project:oni-code] Slice E (multi-runtime MCP pooling) shipped and merged into umbrella `feat/coding-agent-parity-v0.2` at commit `ba84a9c`. Closes the parity-v0.2 queue — all five planned slices (A typed events, B WebSocket, C Streamable HTTP, D elicitation, E multi-runtime pool) are now complete-complete.

Design: `McpBridge.view({childDeferred, permissionCheck?})` produces an `McpBridgeView` that shares the parent's subprocesses with a subagent's own `DeferredToolRegistry`. Handlers installed in the child registry forward to the parent's client at call time (closures re-resolve the parent entry on each call so parent.disconnect propagates naturally). Ownership stays with the parent: view.disconnect(id) only drops child entries; view.close() drops all child entries. Permission gate runs before the parent forward — denied calls surface EMCP_PERMISSION_DENIED without touching the subprocess.

Subagent factory grew two new optional deps: `parentMcpBridge` and `childMcpPermissionCheck`. Factory creates a fresh `DeferredToolRegistry` per spawn and installs the view's entries; cleanup disposes the view without touching parent subprocesses. Runtime accepts `McpBridge | McpBridgeView` at deps.mcpBridge.

Tests added: 7 unit in test/mcp/bridge-view.test.ts (SC-1..SC-4, view.close, passthroughs, syncTools idempotence), 3 integration in test/integration/slice-19ext-multi-runtime.test.ts (real createSubagentFactory + real ToolHost/PermissionManager/HooksEngine/graph — SC-1 parent+2 subagents on one subprocess, SC-2+SC-3 cleanup isolation + parent disconnect propagation, SC-4 permission gate denial).

Suite: 1343 pass / 1 skip / 3 accepted-flake (rule 8 class: S04 finished_task_retention_sec=0, S04 large output spills, bash.test overflow/abort).

Forward notes: syncTools() runs once at construction — new tools from parent reconnect don't flow to existing views. Per-subagent elicitation listener override is possible but not implemented. PermissionManager→childMcpPermissionCheck wrapping left to callers. No cross-runtime-tree pooling.

Next roadmap is new-direction work (UX/frontend, real-agent testing, perf, v0.3 surface expansion) — no residual parity queue.