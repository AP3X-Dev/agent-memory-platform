---
id: CWMvZ8s8t_EkjbkGdfNcA
session_id: cic2-phase3-2026-03-27
agent_id: mcp
task: [project:cic2] Phase 3 task 4: Wire into main.py
outcome: approved
created_at: "2026-03-28T06:16:31.323Z"
---

[project:cic2] Wired SessionPipelineManager into main.py. In lifespan(): creates manager with asyncio.get_running_loop() for thread→async bridging, shuts it down on exit. In StartSession handler: after svc.start_session(), creates OpenAISTTProvider if api_key available, calls pipeline_manager.start_pipeline() wrapped in try/except for graceful degradation. In StopSession handler: calls pipeline_manager.stop_pipeline() before svc.stop_session(). 4 new tests: lifespan creates manager, start calls start_pipeline, stop calls stop_pipeline, degraded mode when pipeline fails. 460 tests total.