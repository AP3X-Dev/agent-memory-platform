---
id: eOJZdG0IOjVogOxdIitkV
session_id: oni-code-phase5-20260401
agent_id: mcp
task: [project:oni-code] Phase 5 scoping — deferred items for future work
outcome: approved
created_at: "2026-04-02T00:55:15.214Z"
---

[project:oni-code] Phase 5 DEFERRED ITEMS — save for future implementation:

1. HTTP/WebSocket Server — Remote transport layer for oni-code sessions. Endpoints: POST /session/create, GET /session/{id}, POST /session/{id}/message, WS /session/{id}/events. Build when there's a remote client need. EventBus events would bridge to WebSocket streams.

2. Bridge Control Plane — Full remote session management. Start/stop/monitor sessions remotely. Multi-session orchestration. Originally marked "later" in roadmap.

3. Remote Authentication — Token-based auth for remote session access. Only needed when HTTP transport is added.

4. Cross-Session Message Routing — Route messages between concurrent sessions. Needed for multi-user or multi-terminal coordination.

5. Process Daemonization — `oni daemon start` to run as a persistent background service. BackgroundScheduler exists and could be the execution engine. Need process manager integration (systemd, pm2, or Windows service).

PREREQUISITES THESE DEPEND ON (being built now in Phase 5):
- Session serialization (toSessionSnapshot/fromSessionSnapshot)
- Headless execution mode (--headless, stdin/stdout)
- Session resume (--resume <sessionId>)

These deferred items should be built AFTER Phase 5 is complete and ONI has real users needing remote access.