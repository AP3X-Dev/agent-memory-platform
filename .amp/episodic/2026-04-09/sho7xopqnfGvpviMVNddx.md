---
id: sho7xopqnfGvpviMVNddx
session_id: phase3-tasks-11-15-2026-04-08
agent_id: mcp
task: [project:ap3x-core] Implement Tasks 11-15 of @ap3x/server: routes, SSE stream, scheduler wiring, boot/shutdown
outcome: approved
created_at: "2026-04-09T08:21:24.269Z"
---

[project:ap3x-core] Implemented Tasks 11-15 of @ap3x/server package:

Task 11: Created app.ts (Hono factory with createApp), routes/companies.ts (CRUD + sub-route mounting), routes/agents.ts (CRUD + start/pause/terminate lifecycle), and stub files for threads, messages, tasks, audit, stream. Key fix: exactOptionalPropertyTypes required stripping undefined values from Zod-parsed objects before passing to repo functions. Used a clean() helper and explicit conditional assignment patterns.

Task 12: Implemented full routes for threads (create/list/get), messages (create/list + separate messageApproveRoute for approval), tasks (create/list/get/update/approve/status), and audit (list with filters). Message routes split into messageRoutes and messageApproveRoute per design spec. Task.threadId is string|null in core types, so approval route wraps createMessage in null check.

Task 13: SSE stream route using ReadableStream with event listeners on the shared eventBus. Supports companyId filtering, 15-second keepalive, and proper cleanup on abort signal.

Task 14: HeartbeatScheduler hooks wiring — connects runtime scheduler to Drizzle repos and event bus. Builds tier-specific state (CompanyState/ManagerState/WorkerState), manages DM threads per agent, persists heartbeat messages, accumulates cost, processes parsed actions (assign/approval_request/done), writes heartbeat records via raw SQL.

Task 15: boot() creates DB, runs migrations, creates scheduler + app, starts running agents, serves via @hono/node-server. shutdown() cancels scheduler, waits 2s for in-flight ticks, closes server and DB. Added @hono/node-server dependency.

All 65 tests pass (10 test files). Typecheck clean.