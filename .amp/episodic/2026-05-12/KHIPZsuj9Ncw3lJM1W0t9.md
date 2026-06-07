---
id: KHIPZsuj9Ncw3lJM1W0t9
session_id: session-20260512-074500
agent_id: mcp
task: [project:oni-grid] optimization session 12: Item #11 EventTimeline backed by durable events store
outcome: approved
created_at: "2026-05-12T14:47:59.300Z"
---

[project:oni-grid] Session 12 completed Item #11 in `444796d`. EventTimeline now renders durable events from the Rust `events.rs` store inside the OrchestrationStrip's new 'events' tab.

Architecture: three layers added.
1. `src/lib/eventClient.ts` — IPC wrapper. Mirrors Rust `StoredEvent` snake_case→camelCase. Exports `getEvents` / `getAgentEvents`, plus pure helpers `eventSeverity(type)` (suffix-based classification), `parseEventData(string|null)` (safe JSON parse, returns null for non-objects/arrays/malformed), and `applyEventFilter(events, filter)` for client-side filtering by runId/paneId/agentName/severities.
2. `src/hooks/useEvents.ts` — polling hook. Default 3s interval, configurable. Mount-time fetch + setInterval; aliveRef guards stale completions; refresh() escape hatch for callers that just emitted. Re-filters in place when filter args change to avoid network round-trips. `enabled: false` pauses polling entirely.
3. `src/components/EventTimeline.tsx` — UI. Newest-first scrollable rows with severity color stripe, type/timestamp/agent/pane columns, expandable JSON payload. Filter chip row (All/Info/Success/Warning/Error). `runId` prop has 3-state contract: undefined → use activeRun?.id, null → all events, string → that run.

Conventions established:
- **runId lives in the data JSON column, not as a Rust schema column.** All run/task/merge events emit with `{ runId: ... }` in the data payload. Filtering by runId is client-side via `parseEventData`. If event volume grows enough to make this painful, a generated column or sidecar index table is the right escalation — but at current volume (handful per run), it's free.
- **Severity is derived from event-type suffix, not stored.** `*.failed`/`*.error` → error, `*.conflict`/`*.interrupted` → warning, `*.completed`/`*.merged`/`*.done`/`*.passed` → success, otherwise info. Pattern-based so unknown future types still classify sensibly. New event types (e.g. the planned #30a `coordinator.auto_answered`) get info severity automatically without code changes.
- **Polling beats push for low-volume read paths.** events.rs has no `tauri::Emitter` channel today; polling at 3s + a refresh() bypass is sufficient and avoids the listen/emit plumbing. Push can be added later if the volume warrants it.
- **3-state nullable override for derived defaults.** `runId` prop pattern: undefined = use store default (activeRun?.id), null = explicitly disable filter, string = override. Standard idiom for "optional override of a derived default." Callers shouldn't need to read the store themselves to disable the default.
- **Adjustable autonomy in the timeline scope.** Defaults to activeRun?.id, falls back to "all workspace events" when no run is active. Manual cockpit panes still surface here without needing a managed run.

Test pitfall caught: **fake timers + waitFor is an antipattern.** `waitFor` polls with real `setTimeout`, deadlocks under `vi.useFakeTimers()`. Reliable pattern: `flush()` drains microtasks inside `act` for mount-time async, plus explicit `vi.advanceTimersByTime` for interval ticks. A linter pass tried to rewrite the test with `advanceTimersByTimeAsync + waitFor` and broke the unmount test; the flush pattern was restored.

Verification: TS 1480/1480 (+37), ESLint clean, tsc clean, cargo test 54/54, cargo clippy clean. Diff 1086 lines (520 tests + 570 prod) — over the soft 400-line cap but per-item rather than scope creep; documented in the session entry.

Next: Item #12 (bound pane.output array). Item #30 sub-tasks (#30a event emission for blocked/answered, #30b broader detection, #30c repeated-block escalation) remain tracked.