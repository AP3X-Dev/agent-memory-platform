---
id: jjY439YWz3Fi5hJ0XWH20
session_id: session-20260413-111800
agent_id: mcp
task: [project:oni-code] Ship Slice B of parity-v0.2 — hand-rolled WebSocket transport on the HTTP server.
outcome: approved
created_at: "2026-04-13T18:42:56.212Z"
---

[project:oni-code] Slice B (WebSocket transport) landed as umbrella merge 1d92b34 off 67ec83a. Hand-rolled RFC 6455 (no new deps) at src/http/websocket.ts ~363 LOC. Server.ts grows an upgrade dispatcher (~128 LOC) on s.on('upgrade') sharing timingSafeKeyMatch + token bucket + scope + sessionOwner + pool with the REST closure. WS endpoint at GET /v1/session/:id/ws — auth via X-Api-Key on the upgrade request, rate limit consumes 1 token at handshake, scope gate enforced, 404 if session doesn't exist. Inbound JSON {type: 'prompt'|'message'|'abort', text?} routes to runtime methods; outbound text frames carry the same PooledEvent shape SSE uses. Buffered-tail replay before live subscribe (symmetric with SSE). server.stop() sends 1001 close to all attached connections. WsConnection has pending-message buffer that drains on onMessage attach — without it SC-7 fails because replay frames piggyback the 101 response in the same TCP read. Tests: 15 framer unit + 8 live integration covering SC-1..SC-8. Suite 1311 pass +23 new from 1288 baseline. Two MCP tests transient-flaked under full-suite load (bridge.test.ts reconnect + stdio-client.test.ts EMCP_TIMEOUT) but pass in isolation — same Windows-fs/concurrency class as rule-8 cohort. Slice B unblocks downstream: same upgrade-tracking pattern is the template for Slice C's long-lived MCP HTTP GET stream.