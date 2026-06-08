---
id: exp-fHzQfdNy82
session_id: deepgram-switchover-session
agent_id: amp-researcher
task: [20260331-pipeline-accuracy-optimization] experiment #0: Initial pipeline state. Stage 2 used gpt-4o-mini which failed ~40% of the time (returned empty trade/call_type/job_type). Stage 1 extracted outside_location as 'outside' (too vague). functional_status was 'partial' instead of 'non-functional' for AC blowing warm air.
outcome: approved
created_at: "2026-03-31T18:33:06.461Z"
---

Hypothesis: Baseline measurement — initial pipeline with gpt-4o-mini for Stage 2, gpt-4o-mini for Stages 1+3
Changes: Initial pipeline state. Stage 2 used gpt-4o-mini which failed ~40% of the time (returned empty trade/call_type/job_type). Stage 1 extracted outside_location as 'outside' (too vague). functional_status was 'partial' instead of 'non-functional' for AC blowing warm air.
Result: probing_match_rate=0.5 (keep)
Insight: gpt-4o-mini is unreliable for SOP classification — 3/5 success rate on Stage 2. Stage 1 needs better guidance for outside_location and functional_status definitions.