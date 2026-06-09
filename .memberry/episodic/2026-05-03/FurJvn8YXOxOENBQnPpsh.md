---
id: FurJvn8YXOxOENBQnPpsh
session_id: session-20260503-0930
agent_id: mcp
task: Connect Codex to AMP memory
outcome: revised
created_at: "2026-05-03T09:44:22.164Z"
---

Correction to final AMP connection state: Codex global MCP server amp is configured as a stdio server running C:\Program Files\nodejs\node.exe with C:\Users\Guerr\.codex\amp-sse-bridge.js. The bridge forwards stdio MCP traffic to AMP at http://192.168.0.25:3101/sse. The earlier direct streamable_http Codex entry was temporary and was replaced because AMP exposes legacy SSE.