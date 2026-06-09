---
id: _1JNVW3DCd0IdiW1yVqHo
session_id: smart-drain-design-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Implement smart drain for pipeline shutdown
outcome: approved
created_at: "2026-04-08T00:02:30.296Z"
---

[project:agent-assist-cr] Implemented smart drain feature. 9 commits on feat/deepgram-nova3-integration branch. New DrainCoordinator class in src/engine/drain_coordinator.py owns the shutdown sequence. DeepgramStreamClient got a drain() method using threading.Event per connection for graceful WebSocket close. stop_session() now returns immediately after transitioning to DRAINING status and handing off to DrainCoordinator.run_async(). Frontend keeps polling during drain and shows amber "Finalizing..." state. 12 new tests (7 DrainCoordinator + 5 DeepGram drain). Code review caught missing pipeline fallback in final analysis and missing test-scenario guard — both fixed.