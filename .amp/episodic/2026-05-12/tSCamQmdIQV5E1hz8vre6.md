---
id: tSCamQmdIQV5E1hz8vre6
session_id: session-20260512-095700
agent_id: mcp
task: [project:oni-grid] optimization session 23: ONI Core harness integration point + feature flag (stub)
outcome: approved
created_at: "2026-05-12T17:00:29.411Z"
---

[project:oni-grid] Session 23 in `47e7fdf`. Item #21 closes with a stub-style implementation — feature flag + integration point + typed contract — because the harness can't load in the renderer.

Key architectural finding (worth remembering across all future ONI Core integration work):
- **`@oni.bot/core/harness/external-agent.js` imports `node:child_process` and `node:readline` at module load.** Confirmed by inspecting `node_modules/@oni.bot/core/dist/harness/external-agent.js`. Any renderer file that does `import { ExternalAgentHost } from '@oni.bot/core/harness'` non-type would crash Vite at bundle time. The original Item #21 problem statement implied direct renderer import was the right path — it isn't.
- **Actual dispatch must live in a Tauri sidecar.** A Node child process spawned by the Rust backend owns the ExternalAgentHost instance; the renderer talks to it via IPC. That sidecar is the natural scope of Items #22 (MemoryProvider) and #23 (connection settings).
- **Type-only imports compile cleanly.** `import type { ExternalAgentProvider, ExternalAgentRuntimeSummary } from '@oni.bot/core/harness'` strips at compile time — no Node code reaches the bundle. The integration POINT (typed contract, callable function) can exist in the renderer ahead of the sidecar; only the integration PATH (actual dispatch) waits.

Conventions established:
- **Stub-but-typed pattern for deferred external integrations.** When the runtime side of an integration is blocked on infrastructure (here: a sidecar) but the typed contract is already known, land the contract + a `try*Dispatch(state, request)` function that returns null in all current cases. Existing callers fall through to the v1 path; when the runtime backend appears, the third early-return branch flips to a real IPC call. The call sites don't change.
- **`#[serde(default)]` on every new boolean field in AppConfig.** Older config files written before the field exists must load cleanly. The test `oni_harness_enabled_uses_serde_default_when_omitted_from_toml` pins this and is the template for any future field add.

Operational lesson from this session:
- **External edits to files mid-session are common — `git checkout HEAD --` is the canonical recovery.** A parallel agent was attempting a separate refactor (replace OrchestrationStrip placeholder labels with real MergeQueue/MailFeed/HealthPanel/CostDashboard children, replace DiffViewer SAMPLE_HUNKS with real diff parsing). Both refactors were left mid-edit, breaking tsc on multiple files I hadn't touched. Recovery: revert all unrelated files via `git checkout HEAD -- <paths>` before running the verification suite. This session reverted 9 files total. Cumulative diff stayed scoped to the intended 256 lines.

Cumulative this turn: 13 sessions, 22/30 items complete + 4 discoveries. TS 1430 → 1541 (+111). Rust 54 → 106 (+52). Next: Item #22 (MemoryProvider interface + NoopMemoryProvider). That + #23 (connection settings) + the deferred Tauri sidecar are the path to flipping `oni_harness_enabled` to actually do something.