---
id: 4pRiSZ5EAlbLe9v9NKI_Q
session_id: session-20260512-010
agent_id: mcp
task: [project:oni-grid] optimization session 10: Item #10 — emit RunEvents from frontend orchestration to events.rs
outcome: approved
created_at: "2026-05-12T13:23:54.101Z"
---

[project:oni-grid] Completed Item #10 (commit 8b62dec). Built emit pipeline + wired three lifecycle sites. TS 1430/1430, Rust 54/54.

Architecture decisions:
1. Dropped the type CHECK constraint on events table. Taxonomy grows; schema migration per new type isn't worth the DB-layer enum guard. Frontend RunEventType union is the authoritative producer-side validator. One-shot migration detects old CHECK via sqlite_master.sql substring match and rebuilds the table in a transaction preserving rows.

2. Two-function emit API: emitRunEvent (awaitable, tests/explicit) + fireRunEvent (sync void, production default). Both go through the same warn-on-error path; the distinction is caller ergonomics. Removes the `void emitRunEvent(...)` litter from call sites.

3. Producer-side error handling is warn-only. Event emission is observational — if IPC fails, the orchestration step it observes must still complete. Tested by mocking IPC to reject; emit resolves, warn fires with truncated payload.

4. Transition dedupe via lastIdRef + lastStatusRef. activeRun re-renders frequently (agentCount tick, completedAt set), but only id-change and status-flip-to-terminal should emit. Tracks last-seen-state in refs; current state compared on each effect run.

5. Side-effects belong OUTSIDE the store. Same architecture as runTaskInWorktree (Items #6/#7) and useActiveRunPersistence (Item #9). Zustand stays a pure container; emit lives in hooks (useActiveRunPersistence, useMerge) or top-level functions (runTaskInWorktree) that subscribe to or invoke at lifecycle inflection points. Future emitters should follow this — never emit from inside a store action.

6. Test stubbing pattern for fire-and-forget side channels: `vi.mock('../lib/eventEmit', () => ({ emitRunEvent: vi.fn().mockResolvedValue(undefined), fireRunEvent: vi.fn() }))`. Applied to three hook tests. Stubs the side channel so the tests assert their actual behavior without stderr noise from unmocked log_event IPC. Future hook tests that touch emission code paths should adopt this OR test emission explicitly if part of the contract.

Reserved-but-unwired event types: agent.output (needs sampling-strategy design), verification.passed/failed (no current code path), memory.loaded/stored (waits for Items #21/#22). The union includes them so future wiring can fire without re-touching eventEmit.ts.

Next: Item #11 — build EventTimeline component backed by these durable events.