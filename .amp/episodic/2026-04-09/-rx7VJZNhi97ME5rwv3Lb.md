---
id: -rx7VJZNhi97ME5rwv3Lb
session_id: phase-4a-design-decisions-20260408
agent_id: mcp
task: [project:ap3x-core] Phase 4a design decisions for Electron shell + Vite migration
outcome: approved
created_at: "2026-04-09T08:44:31.402Z"
---

[project:ap3x-core] Phase 4a design decisions finalized:

Q1 Styling: Keep inline styles as-is, defer to Phase 4b. App.jsx is 1980 lines of inline styles -- changing the styling system while changing bundlers is unnecessary risk.

Q2 TypeScript: Keep .jsx with allowJs, defer TS conversion to Phase 4b. 20 useState hooks and dense render logic would require touching hundreds of lines just to satisfy the compiler.

Q3 Package structure: packages/ui/ is a standalone Vite app (builds to dist/index.html). Electron BrowserWindow loads URL in dev, file in prod -- that's a standalone app pattern.

Q4 Dev workflow: Single pnpm dev command via concurrently (Vite + Electron with wait-on), same pattern as current CRA setup but pointing at port 5173.

Q5 Root cleanup: Delete root src/, remove react-scripts entirely. Clean break. CRA is dead upstream, no dual-toolchain.

Q6 packages/app/ TypeScript: Yes from day 1. Only ~80 lines total (main.ts + preload.ts). Every other package is already TS. Use tsx for dev, tsc for prod build.

Q7 Tray icon: PNG files in packages/app/assets/. Export from existing public/logo.webp at 16x16, 32x32, 256x256. No SVG build step, no default Electron icon.

Core principle: Phase 4a is infrastructure only. Zero styling changes, zero TS conversion, zero component extraction. Move files, wire Vite, wire Electron shell with tray, delete CRA. Phase 4b handles all UI refactoring.