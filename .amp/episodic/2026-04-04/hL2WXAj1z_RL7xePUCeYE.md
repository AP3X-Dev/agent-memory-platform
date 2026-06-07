---
id: hL2WXAj1z_RL7xePUCeYE
session_id: scenario-replay-water-heater-2026-04-03
agent_id: mcp
task: [project:agent-assist-cr] Implemented parallel Stage 1+3 in extraction pipeline post-lock
outcome: approved
created_at: "2026-04-04T13:39:26.635Z"
---

[project:agent-assist-cr] Modified ExtractionPipeline to run Stage 1 (fact extraction) and Stage 3 (probing matching) concurrently using asyncio.gather when Stage 2 is locked. Stage 3 uses previous tick's facts while Stage 1 extracts fresh ones.

Change in src/engine/agents/extraction_pipeline.py:
- Added _previous_facts cache to ExtractionPipeline
- Split run() into _run_parallel() (post-lock) and _run_sequential() (pre-lock)
- _run_parallel uses asyncio.gather for Stage 1 + Stage 3
- Lock break check still runs after parallel completion
- _previous_facts updated after each tick for next parallel cycle

Measured improvement: Blanton single-client test went from 383s to 348s (35s saved, ~3.5s per post-lock tick across 10 ticks). Also set streaming_primary=true as default in config.py and updated test script to simulate production 15-second cadence ticks instead of per-chunk processing.