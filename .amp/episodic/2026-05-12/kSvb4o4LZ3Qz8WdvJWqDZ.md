---
id: kSvb4o4LZ3Qz8WdvJWqDZ
session_id: session-20260512-0518
agent_id: mcp
task: [project:oni-grid] optimization session 4: log silent error swallows (Item #4)
created_at: "2026-05-12T11:26:55.252Z"
---

[project:oni-grid] Session 4 COMPLETE on opt/oni-grid-hardening (commit 1bf72b1).

Fixed: 9 silent error swallow sites across 7 files. All now log with truncated payload context.
- useCoordinatorBridge.ts:87, useConductor.ts:80, ChatSidebar.tsx:{1215,1312,1315}: silent .catch(() => {}) on PTY writes → console.warn with paneId/ptyId/payload-prefix
- toolBridge.ts:66 parseToolCall, mergeFlow.ts:115 parsePayload: empty `catch { return null }` on JSON.parse → console.warn with command/mail-id + truncated input
- usePty.ts:38,45,57,68: spawn/write/resize/kill error logs enriched with paneId, ptyId, shell/cwd/data prefix; write+resize+kill demoted from console.error to console.warn (operations are recoverable)
- useWorktree.ts:49: runTaskInWorktree error log enriched with paneId, branch, projectPath

Tests added: 2 — assert parseToolCall warns on bad JSON, assert parsePayload warns on bad JSON. Use vi.spyOn(console, 'warn').mockImplementation(() => {}) pattern; lightweight, doesn't pollute test output.

Conventions established (new):
- Payload truncation: cmd args 60 chars, data writes 40 chars, error messages 200 chars. Future logging sites should match.
- Demote console.error → console.warn when the calling operation continues without the result (PTY write/resize/kill). Keep console.error when the function aborts (PTY spawn).
- Surfacing-to-UI vs. logging are separate concerns. The toast-on-3-misses recovery feature is deferred (D2/#29) — not bundled into a logging hygiene pass.

Discovery (Mode B):
- Backlog item #29 added: surface a toast after 3+ consecutive PTY write failures. Has design considerations (per-pane counter, threshold, decay) that warrant its own session.

Other observations:
- TypeScript caught a real bug in flight: I initially logged options.command in usePty spawn, but SpawnOptions has no command field. tsc -b --noEmit caught it cleanly. Reinforces value of running typechecks per session.

Verification: TS 1376/1376 (2 new), ESLint 0/0, tsc clean, cargo test 7/7, cargo clippy clean (3s warm). Wall clock ~7 min.</content>
<parameter name="outcome">approved