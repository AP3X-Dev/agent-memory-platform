---
id: ipCmxig_kD1tDyRqMt-Zm
session_id: session-20260603-mcpserver
agent_id: mcp
task: Implement the AG3NTIC MCP server per docs/superpowers/specs/2026-06-03-ag3ntic-mcp-server-design.md
outcome: approved
created_at: "2026-06-03T20:19:10.785Z"
---

Built packages/mcp-server (ag3ntic_mcp): a stdio MCP server exposing the AG3NTIC control plane to MCP clients. Thin layer over the in-repo SDK cloud_computer.CloudComputerClient.

Key design facts for future work:
- Tool boundary: tools/ are pure functions func(client, args, config, on_progress=None) -> dict; no MCP types leak. server_stdio.py is the only transport adapter (so a future server_http.py reuses tools/).
- 36 tools registered (35 curated + ag3ntic_api_request escape hatch). Registry via @tool decorator in tools/registry.py; danger/writes flags drive guards.
- Tools the SDK does NOT cover use client.raw_request (path relative to /api, leading /api stripped): workflows (GET /workspaces/{ws}/workflows, POST /workflows/{id}/runs with body {computer_id,...}, GET /workflow-skills + /workspaces/{ws}/workflow-skills/catalog), gateway (POST /workspaces/{ws}/gateway/outbound-messages, body key is channel_connector_id), runtime logs (GET /computers/{id}/runtime-logs?lines=), and computer hibernate (POST /computers/{id}/hibernate — no SDK method).
- Guards: guards.enforce(meta,args,config) blocks readonly writes + dangerous-without-confirm; readonly precedence over confirm. Escape hatch self-enforces (danger dynamic: DELETE or destructive keyword in path needs confirm; readonly allows only GET). normalize_error turns CloudComputerError into {status,status_code,code,message,hint}.
- Long-running ops: waiting.wait_until(poll,is_done,timeout,...) injectable clock/sleeper; returns (last_value, completed) — on timeout returns last-known, never raises. Sync tools run via anyio.to_thread.run_sync; progress via anyio.from_thread.run + session.send_progress_notification.
- mcp SDK 1.25 low-level Server: @server.list_tools / @server.call_tool(validate_input=True validates against inputSchema). call_tool returning a dict -> structuredContent; returning (content_list, dict) -> both; image dict {type:image,mime_type,data(base64)} -> ImageContent.
- Tests: 98 passed, 1 skipped (env-gated live smoke). Tests put packages/sdk-python on sys.path via conftest; FakeClient duck-types the wrapper (records SDK calls + raw_request). In-memory protocol roundtrip via mcp.shared.memory.create_connected_server_and_client_session.
- Run: python -m ag3ntic_mcp (entry ag3ntic-mcp). Env: AG3NTIC_API_KEY, AG3NTIC_BASE_URL required; AG3NTIC_WORKSPACE_ID, AG3NTIC_MCP_READONLY, AG3NTIC_MCP_PROVISION_TIMEOUT(180), AG3NTIC_MCP_TASK_TIMEOUT(600).