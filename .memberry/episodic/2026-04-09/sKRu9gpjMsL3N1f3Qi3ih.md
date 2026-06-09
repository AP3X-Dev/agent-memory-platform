---
id: sKRu9gpjMsL3N1f3Qi3ih
session_id: ap3x-phase3-design-plan-2026-04-09
agent_id: mcp
task: [project:ap3x-core] Phase 3 design and implementation planning for @ap3x/server
outcome: approved
created_at: "2026-04-09T07:34:35.596Z"
---

[project:ap3x-core] Completed Phase 3 design spec and implementation plan for @ap3x/server. Key architectural decisions: (1) In-process Hono server — boot(port, dbPath) with zero Electron imports, better-sqlite3 native bindings require single process. (2) Core types as source of truth — Drizzle schema is persistence representation, mapper layer bridges with TS drift detection. (3) Single SSE stream per company with 8 typed events using SSE event: field for native addEventListener dispatch. (4) Server owns HeartbeatScheduler — hooks wired to Drizzle repos + event bus, one hop from tick to browser. (5) API scoped to must-have: Companies/Agents/Tasks/Threads/Messages CRUD + approval endpoints + audit read-only. Teams/Channels/Skills deferred to Phase 4. (6) processConfig stored as JSON blob column. (7) Scheduler passed to agent routes for start/pause/terminate lifecycle control. (8) ONI source at oni-core-cerebro can be patched if StateGraph typing issues recur. Plan has 17 tasks across scaffold, utilities, schema, mappers, 5 TDD repos, routes, SSE, scheduler wiring, boot/shutdown, and integration tests.