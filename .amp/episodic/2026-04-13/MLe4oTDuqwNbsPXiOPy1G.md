---
id: MLe4oTDuqwNbsPXiOPy1G
session_id: session-20260413-111800
agent_id: mcp
task: [project:oni-code] Ship Slice D of parity-v0.2 — MCP elicitation (server-originated requests + bridge prompt registry).
outcome: approved
created_at: "2026-04-13T19:54:03.083Z"
---

[project:oni-code] Slice D landed as umbrella merge ab83c09 off 4cc9099. McpClient interface gains setServerRequestHandler(handler|null) for inbound JSON-RPC requests (frames with both id+method); both transports route to the handler and reply with result frame or method_not_found (-32601). Stdio writes via writeFrame; HTTP POSTs the response back as a fresh envelope without blocking the SSE drain. McpBridge owns elicitation registry: handleServerRequest dispatches elicitation/create to a Map<prompt_id, PendingElicitation> with a 5min default timeout (configurable, unref'd timer) and surfaces via setElicitationListener (or onElicitationPrompt opt). resolveElicitation routes back; unknown_prompt_id surfaces 404-shape; disconnect aborts pending with EMCP_DISCONNECTED. Runtime wires bridge.setElicitationListener to emit a typed elicitation_prompt event (added to Slice A's discriminated union + KNOWN_EVENT_TYPES). New mcp_elicitation_resolve RPC + onMcpElicitationResolve hook. Mock-server grew MOCK_MODE=elicit. Tests: 7 in test/mcp/elicitation.test.ts (stdio handler + no-handler fallthrough; HTTP fixture with SSE-borne elicit; bridge happy + timeout + unknown-id + disconnect-cancel). Suite 1334 pass +7 = exactly the new tests, baseline rule-8 flake class only. Slice D unblocks Slice E — listener pattern + per-server prompt_id namespace generalize to multi-runtime views forwarding prompts up to parent.