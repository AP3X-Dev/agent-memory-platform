---
id: Hvlj9IoWUKIOv-mEgl0d3
session_id: chunk-pipeline-removal-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Remove test scenario machinery and benchmark/research scripts
outcome: approved
created_at: "2026-04-08T09:52:26.234Z"
---

[project:agent-assist-cr] Removed test scenario recording system and all benchmark/research scripts and data files.

**Test scenario machinery removed from:**
- api_server.py: Deleted TestScenarioRecordRequest model, test_scenario_router, all 3 endpoints (/status, /record, /stop), and router registration
- session_manager.py: Removed _test_scenario_dir field from Session, output_dir parameter from create_session, transcript dump in _drain_cleanup, test scenario guard in _on_streaming_tick, notes guard in drain coordinator setup
- main.js: Removed testScenarioSessionId state, 3 IPC handlers (test-scenario-status/record/stop), session start guard, quit cleanup
- preload.js: Removed 3 IPC bridges (testScenarioStatus/Record/Stop)
- settings.js: Removed entire Test Scenarios tab (render method, populate dropdown, load status, all event bindings, state fields)
- test_drain_coordinator.py: Removed _test_scenario_dir from FakeSession

**Deleted 15 scripts:** streaming_vs_chunk_comparison.py, test_sop_relevance.py, sop_auto_research.py, test_scenario_replay.py, analyzer_vs_pipeline_comparison.py, model_comparison.py, multi_model_comparison.py, pipeline_evaluator.py, sop_model_comparison.py, test_stt.py + 2 JSON result files

**Deleted 5 data/research files:** streaming_comparison.json, multi_model_comparison.json, analyzer_vs_pipeline.json, sop_template.json, sop_template_example.json

**Deleted 2 research docs:** auto-research-summary.md, sop-relevance-session.md

282 tests pass.