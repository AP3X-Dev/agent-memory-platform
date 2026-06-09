---
id: MDJfV7VeVxm89dqIll29d
session_id: smart-drain-design-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Design and plan smart drain for pipeline shutdown
outcome: approved
created_at: "2026-04-07T23:12:49.388Z"
---

[project:agent-assist-cr] Designed smart drain system for graceful pipeline shutdown. Key decisions: (1) Best-effort with final sweep approach — drain DeepGram transcripts, discard stale in-flight analysis, run one final pass over complete transcript. (2) New DrainCoordinator class owns the shutdown sequence in a background thread. (3) New DRAINING session status between RECORDING and COMPLETED. (4) DeepgramStreamClient gets a drain() method that sends finish() and waits up to 10s for final transcripts via threading.Event per connection. (5) stop_session() returns immediately, frontend keeps polling during drain and shows "Finalizing..." state. (6) 30s total safety net timeout. Critical finding: main.js was stopping polling and nulling sessionId BEFORE the stop API call completed — this would have caused data loss even without drain. Fixed in the plan by keeping polling active until COMPLETED is detected.