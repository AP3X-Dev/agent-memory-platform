---
id: Ho5HTrmCC9NltRvq1ZIQh
session_id: session-20260512-103000
agent_id: mcp
task: [project:oni-grid] optimization session 24: MemoryProvider interface + NoopMemoryProvider
outcome: approved
created_at: "2026-05-12T17:34:55.320Z"
---

[project:oni-grid] Session 24 in `ee3f314`. Item #22 done — the pluggable memory abstraction is now in the renderer with a Noop implementation as the default.

Conventions established for the memory layer:
- **Interface matches the 2026-05-12 plan spec line-by-line.** No reinterpretation. `loadContext(input)` with `projectScope/task/entities?/tags?/maxTokens?`. `storeEpisode(input: MemoryEpisode)` returns `{ id, duplicate }`. Optional `indexCodebase` and `impact`. AMPMemoryProvider gets to wrap the MCP wire format with minimal translation because the TS types are pre-shaped to match.
- **Capability guards for optional methods.** `supportsIndexCodebase(provider)` / `supportsImpact(provider)` narrow the provider type. Callers do `if (supportsImpact(p)) p.impact(...)` rather than `p.impact?.(...)`. Same pattern works for any future capability methods.
- **Deterministic Noop ids derived from input.** `noop-${runId}-${sessionId}-${task.slice(0,16)}`. Identity is testable without mock clocks or counters. Same input → same id; different runs/tasks → different ids. `duplicate: false` always because Noop doesn't persist.
- **Provider lives in the store, not as a module singleton.** `AppState.memoryProvider: MemoryProvider` initialized to `new NoopMemoryProvider()`. `setMemoryProvider(provider)` action replaces it. AMP integration in a future session calls `setMemoryProvider(new AMPMemoryProvider(...))` once a Tauri sidecar can host the MCP client. This mirrors Item #21's pattern: integration point in renderer, real backend in sidecar.
- **Build the producer, leave the consumer untouched, flip later.** The provider is registered but `loadContext` / `storeEpisode` are NOT yet called from `runTaskInWorktree` or `useActiveRunPersistence`. Plan's "Memory Load Policy" at run start and "Memory Store Policy" at task end will be wired later. Noop being the default means the future wire-up is a safe no-op until AMP exists. Same pattern as event emission (Session 10) — producer first, consumer later.

Operational continuation from Session 23:
- **Linter parallel-refactor interference is a persistent problem.** Same 11 unrelated files got modified mid-session as Session 23 (`OrchestrationStrip`, `DiffViewer`, `RunModal`, `SettingsPanel`, `TopBar`, `CommandPalette`, `KanbanBoard`, `App`, `useKeyboardShortcuts`, plus the two component test files). Recovery: `git checkout HEAD -- <paths>` reverts to last committed state before staging.
- **Commit immediately once tests pass.** Don't pause for AMP store between green-suite and commit — the linter can touch files in that window. Pattern: green suite → revert unrelated → git add scope → git commit immediately → amp_store afterwards.

Cumulative this turn: 14 sessions, 23/30 items complete + 4 discoveries. TS 1430 → 1551 (+121). Rust 54 → 106 (+52). Next: Item #23 (ONI/AMP/Cerebro connection settings in SettingsPanel) is the natural pairing with Items #21 + #22 — same renderer-vs-sidecar pattern, plus a UI surface for the credentials/endpoints that the future sidecar will read.