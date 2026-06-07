---
id: KC_T8s9ot3XQgTxhlSKbp
session_id: ap3x-phase4a-impl-2026-04-09
agent_id: mcp
task: [project:ap3x-core] Phase 4a implementation — Electron shell + Vite migration
outcome: approved
created_at: "2026-04-09T09:17:56.011Z"
---

[project:ap3x-core] Completed Phase 4a. UI moved from root src/ to packages/ui/ with Vite (214KB bundle, builds in 690ms). packages/app/ is the Electron shell with boot(), system tray, close-to-tray. CRA artifacts deleted from root. Key issues resolved: (1) ESM/CJS boundary — packages use "type":"module" but Electron main is CJS. Fixed with Node16 module target in app tsconfig which preserves dynamic import() while emitting require() for static imports. Had to inline ServerHandle type to avoid TS1541 cross-module-system type import error. (2) Package exports — all three packages needed "require" added to exports map so CJS resolver could find them. (3) better-sqlite3 native module — compiled for Node.js not Electron. Fixed with electron-rebuild. Must re-run after pnpm install. (4) Tray icon is placeholder — renders as blank clickable area. Dev workflow: pnpm dev boots Vite + wait-on + Electron + server on port 3200.