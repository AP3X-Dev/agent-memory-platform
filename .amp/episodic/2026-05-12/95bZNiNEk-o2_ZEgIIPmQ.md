---
id: 95bZNiNEk-o2_ZEgIIPmQ
session_id: session-20260512-115400
agent_id: mcp
task: [project:oni-grid] optimization sessions 27 + 28: CI workflows + stricter ESLint
outcome: approved
created_at: "2026-05-12T19:06:13.186Z"
---

[project:oni-grid] Two sessions this turn:

**Session 27** (`78c0072`) — Item #25 closed. Added `.github/workflows/test.yml` (lint + tsc + vitest + cargo test + cargo clippy on every push/PR, with libwebkit2gtk deps on Ubuntu and Cargo.lock-keyed cache) + `.github/workflows/build.yml` (tagged-release Tauri build across macOS/Windows/Linux with bundle-artifact upload). CI mirrors the local verification suite exactly so green-on-CI matches green-on-laptop.

**Session 28** (`4c6f9c1`) — Item #26 closed. Enabled `@typescript-eslint/no-floating-promises` (type-aware via `parserOptions.projectService`) and promoted `react-hooks/exhaustive-deps` from warn to error. Fixed 10 violations (9 in TerminalPane.tsx fire-and-forget IPC calls + 1 in useMail.ts initial pollMail) by wrapping with `void`. `import/order` from eslint-plugin-import deferred — single new plugin not worth the maintenance cost for one stylistic rule.

Conventions established:
- **CI mirrors local verification, not a superset of it.** Same five gates: lint, tsc --noEmit, vitest, cargo test --all-targets, cargo clippy -D warnings. If local passes, CI should pass; if CI fails on a green local run, the divergence is the bug, not the rule.
- **Linux Tauri builds need libwebkit2gtk even for `cargo test --no-run`.** The Tauri crates pulled in by tests link against WebKit headers at compile time. Adding apt install to the rust job prevents confusing "I just want tests" failures.
- **Tauri build is opt-in via tag, not every push.** macOS/Windows/Linux full bundles burn ~20-30 CI minutes each; running them on every PR would 10x cost for no PR benefit. `v*.*.*` tag triggers + workflow_dispatch for re-runs.
- **`projectService: true` is the modern way to wire type-aware lint rules.** Replaces the older `parserOptions.project: './tsconfig.json'` pattern. Auto-resolves which tsconfig owns each file. ~5x lint runtime increase (still <10s) is worth `no-floating-promises` catching forgotten-await bugs at the boundary.
- **`vitest.config.ts` belongs in `tsconfig.node.json`.** Any root-level TS config file not covered by tsconfig.app.json's src/ include needs to land here, otherwise type-aware lint rules can't resolve the file. Same applies to future root configs (e.g. playwright.config.ts).
- **`void` is the right fix for fire-and-forget Promises.** Catch-and-swallow (`.catch(() => {})`) hides real errors; `void` says "yes async, yes intentionally dropped." All 10 Item #26 fixes used void rather than catch chains. Reserve `.catch(err => console.warn(...))` for cases where surfacing the failure to the user matters.
- **Deferring with a reason beats adding a plugin you don't need.** import/order would have required adding eslint-plugin-import (~50KB transitive, version maintenance, cache-invalidation cost) for one rule. Deferred with explicit rationale in the eslint.config.js comment; if a future session wants strict ordering, it can land the plugin then.

Operational: `2512fd6` (linter commit between sessions) added the persistConnection auto-save feature that had been mid-edit across Sessions 23-26 reverts. Net positive — fewer manual reverts going forward since the linter ships its own complete commits.

Cumulative this turn: 18 sessions, 27/30 items complete + 4 discoveries (D4 closed). TS 1430 → 1575 (+145). Rust 54 → 119 (+65).

Next: Item #27 (code-split heavy panels in vite.config.ts via manualChunks + React.lazy). Then #28 (bundle visualizer). Then Block 6 finishes the original backlog. Item #30 sub-tasks #30a/b/c remain for after.