---
id: 4_VMImGyPZpM-4aYrP-JC
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Stage 2 locking implemented — gpt-5.4 calls drop from ~40 to ~2-3 per call
outcome: approved
created_at: "2026-04-01T20:31:03.956Z"
---

[project:agent-assist-cr] Implemented Stage 2 classification locking in ExtractionPipeline.

Behavior: After 2 consecutive Stage 2 runs return the same trade, the SopMatchResult is cached and Stage 2 is skipped. Stages 1+3 continue every cycle. Lock breaks if Stage 1 equipment type changes (e.g., AC unit to oil boiler), triggering Stage 2 re-evaluation.

State tracked on pipeline instance: _locked_sop_result, _last_trade, _trade_streak, _last_equipment_type. Pipeline instance persists across analysis cycles per session via SessionManager._extraction_pipeline.

Cost impact: gpt-5.4 calls drop from ~40 to ~2-3 per 10-min call. Stage 2 cost drops from $0.48 to ~$0.036. Total per-call cost from $0.748 to ~$0.304. Monthly savings at 500 calls/day: ~$6,600.

Design decision: job_type is NOT locked separately because it can change mid-call (maintenance call becomes emergency = Must Book). The locked SopMatchResult includes the job_type from when trade stabilized, but since Stage 2 is skipped, job_type won't update. This is an acceptable tradeoff — trade changes are rare (equipment type change) while job_type changes within the same trade are also uncommon. If this becomes an issue, Stage 2 could be re-run on a longer cadence (every 60s) instead of fully locked.