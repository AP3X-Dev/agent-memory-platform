---
id: Ihw79ebI1pCzHOxf0FxgL
session_id: session-20260512-080000
agent_id: mcp
task: [project:oni-grid] optimization session 13: Item #12 ring-buffer pane.output + discovery caps on chatMessages and costAlerts
outcome: approved
created_at: "2026-05-12T15:01:41.177Z"
---

[project:oni-grid] Session 13 in `0bede91`. Capped pane.output (10_000/5_000), chatMessages (2_000/1_000), costAlerts (500/250) via splice-based ring buffer in appStore.

Conventions established:
- **Constant pair for every ring buffer: `*_MAX` + `*_KEEP`.** Trim only when crossing MAX; retain KEEP. Two constants (not one) because trimming at every push past the cap would splice on each line — the MAX-KEEP gap amortizes the cost. Pattern is now used three times in appStore.ts. Future buffer caps should follow this pair convention.
- **splice over slice for in-place trim.** `arr.splice(0, n)` mutates the immer draft in place and avoids allocating the discarded prefix. `arr = arr.slice(-N)` works too but allocates. Either is correct under immer; splice is cheaper.
- **Audit of unbounded pushes in appStore (2026-05-12):** Truly unbounded: pane.output (fixed), chatMessages (fixed), costAlerts (fixed). Already capped: toasts (20), mailMessages (200). Bounded externally: events (Rust SQLite + `get_events` limit arg). User-bounded by definition: tasks, forkTree.

Why bundle the discovery fixes: chatMessages and costAlerts had the identical unbounded-push pattern as pane.output. Mechanically identical fix. Bundling into one commit keeps the audit cost amortized rather than spawning two adjacent backlog items.

Why not touch agentDetector here: Item #13 specifically covers `agentDetector.bufferMaxSize` vs MAX_LINES. Different concern (char count vs line count, different module), keep it in its own session.

Verification: TS 1484/1484 (+4), all checks green. 124 line diff, well under cap.

Next: Item #13 (agentDetector line-count cap). Item #30 sub-tasks remain in the queue.