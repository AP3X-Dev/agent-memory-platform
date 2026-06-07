---
id: 3oxJiBXi6-0ThRmfdc46Y
session_id: session-20260511-2300
agent_id: mcp
task: [project:oni-grid] optimization session 1: enable CSP in tauri.conf.json (hardening Item #1)
created_at: "2026-05-12T04:33:53.633Z"
---

[project:oni-grid] Session 1 complete on opt/oni-grid-hardening (commit 9a9fd4b).

Fixed: Replaced "csp": null in src-tauri/tauri.conf.json with restrictive CSP. Final policy includes default-src 'self'; script-src 'self' (NO unsafe-inline/eval); style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ipc: http://ipc.localhost plus Vite dev-server origins (localhost/127.0.0.1:5173 + ws://); object-src 'none'; base-uri 'self'; frame-src 'none'.

Root cause: The Tauri scaffold default leaves csp null, which disables enforcement entirely. The 2026-05-12 product plan flagged this in its security plan section; the 2026-03-02-sprint0-audit-fixes plan does not address it. Renderer was exposed to XSS/injection from any compromised dependency path.

Conventions established:
- Production CSP keeps script-src strict (no unsafe-inline). React inline style={{...}} attributes are covered by style-src 'unsafe-inline' — acceptable trade-off for now.
- xterm.js style injection is covered by style-src 'unsafe-inline'.
- Dev-server origins (localhost:5173 + ws://) are baked into the prod CSP today; flagged in the log to move behind a dev-only build flag in a later pass.
- mcpPool.ts is a STUB — never opens real WebSocket connections — so wide ws:/wss: allowances are not needed yet. Revisit when mcpPool is wired to a real MCP server.

Discovered: nothing inline this session (focused single-item).

Verification gap (must surface to future sessions and to the merge reviewer): tauri:dev was NOT exercised live from this loop environment. The CSP needs runtime confirmation before merge — load app, exercise terminal + modal + theme switching + xterm WebGL, watch devtools for CSP violations.

Tests/lint/types/cargo all green: TS 1374/1374, lint clean, tsc clean, cargo test 7/7, cargo clippy --all-targets -D warnings clean.</content>
<parameter name="outcome">approved