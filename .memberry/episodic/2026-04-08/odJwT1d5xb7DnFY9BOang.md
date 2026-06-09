---
id: odJwT1d5xb7DnFY9BOang
session_id: auth-main-js-task2-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Task 2: Register custom protocol and add auth IPC handlers in main.js
outcome: approved
created_at: "2026-04-08T22:25:48.562Z"
---

[project:agent-assist-cr] Completed Task 2 of the Doorkeeper OAuth integration. Modified src/electron/main.js with 4 changes: (1) Added auth module import at line 10, (2) Added 4 auth IPC handlers (start-auth, logout, dev-auth-callback, get-is-dev) after SOP handlers, (3) Added cic-assistant:// custom protocol registration with single-instance lock and handleAuthCallback function for OAuth code exchange, (4) Modified app.whenReady() to check token validity at startup with proactive refresh for near-expiry tokens, redirecting to login.html if unauthenticated. The protocol handler block sits between IPC handlers and app.whenReady(). handleAuthCallback is a standalone async function accessible by both the protocol handler and the dev-auth-callback IPC handler.