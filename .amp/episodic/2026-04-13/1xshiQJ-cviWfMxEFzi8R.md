---
id: 1xshiQJ-cviWfMxEFzi8R
session_id: session-20260413-111800
agent_id: mcp
task: [project:oni-code] Ship Slice A of parity-v0.2 remaining queue — typed runtime-event discriminated union.
outcome: approved
created_at: "2026-04-13T18:19:02.899Z"
---

[project:oni-code] Slice A (typed event schema) landed as umbrella merge 67ec83a off f9d72a7. Shape: discriminated union over 34 literal runtime-event types (every this.deps.emit call in src/runtime.ts) + UnknownRuntimeEvent escape hatch for registry fan-out. RuntimeEvent = KnownRuntimeEvent | UnknownRuntimeEvent. isEvent&lt;T&gt; narrows by type literal; isKnownEvent promotes to the closed union. PooledEvent aliased to RuntimeEvent for back-compat — all existing SessionPool/server/integration consumers compile unchanged. Pure TypeScript, no zod. Lives at src/http/events.ts (~310 LOC). Suite 1288 pass +6 new tests, 2 accepted-flake (S04 class pass in isolation per rule 8). Forward items captured in NOTES: runtime emit-site typing tightening, JSON-schema export, per-tool state_delta typing, grep-based drift detection. Slice A unblocks Slice B (WebSocket transport), which can type WS frames against RuntimeEvent at the boundary.