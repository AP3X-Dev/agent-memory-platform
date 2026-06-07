---
id: VPG4w2Bvc6dvKtgKVuADa
session_id: session-20260512-009
agent_id: mcp
task: [project:oni-grid] optimization session 9: Item #9 — persist activeRun across app restart
outcome: approved
created_at: "2026-05-12T13:02:35.592Z"
---

[project:oni-grid] Completed Item #9 (commit a7917cd). New runs.rs + runs.db backend, runClient.ts + useActiveRunPersistence hook frontend. TS 1424/1424, Rust 46/46.

Architecture decisions:
1. Two `runs` tables, two domains. metrics.db already had a runs table for cost aggregation. New runs.db is for orchestration lifecycle (specText, autoDispatch, interrupted recovery). Same logical run, different views; id is the join key if reconciliation is ever needed. Don't merge — adding orchestration columns to metrics.runs would entangle cost-aggregation queries.

2. Status enum diverges intentionally between Rust and TS. Rust: active|completed|failed|interrupted. TS RunStatus: active|completed|failed. The 'interrupted' state is a recovery sentinel surfaced ONCE on rehydration so the operator can attach/abandon. Then transitions to active (resumed) or failed (abandoned). Never a steady-state UI mutation target.

3. Side-effects OUTSIDE the store, hooked from App.tsx. Same pattern as runTaskInWorktree (Items #6/#7). Zustand stays synchronous; async IPC bridges live in top-level functions or hooks that subscribe. Keeps store trivially testable, lets hooks coordinate cross-cutting concerns (rehydrate race, save dedupe, beforeunload).

4. JSON-fingerprint dedupe for save_run. activeRun changes fire from many code paths; without dedupe, re-renders spam IPC. lastSavedRef.current = JSON.stringify(activeRun); skip-if-equal. Saves cost ~5–20ms each on WAL-mode SQLite — matters at scale.

5. Rehydrate-vs-fresh-run race protection. `if (useAppStore.getState().activeRun) return` guard inside the get_active_run.then() prevents a slow IPC from clobbering a fresh run the user started in the meantime. Test "does not overwrite a live activeRun" pins this. Operator preference wins over rehydrated stale state.

6. beforeunload is best-effort. Fire-and-forget mark_run_interrupted because page is unloading and awaits aren't reliable. If IPC doesn't complete (rare; Tauri, but possible on force-kill), row stays 'active' on next launch. Recovery UI (Item #11 territory) should treat any 'active' run with started_at older than current launch's bootstrap as "probably orphaned".

7. In-memory SQLite for Rust tests. Bypass DbPool entirely: Connection::open_in_memory() + ensure_runs_schema_conn(&conn) + bare *_conn helpers give fast isolated tests. Pattern: every public function has a private *_conn variant taking Connection directly; Tauri wrapper opens the pool then dispatches. Future persistence modules (Items #15–#19) should follow.

8. Defensive null/undefined coercion in runClient mappers. (raw ?? []), (auto_dispatch ?? false). Even if Rust serde never omits these, callers shouldn't have to null-check.

Next: Item #10 — emit RunEvents from frontend to events.rs (the durable event stream from Session 6 plan).