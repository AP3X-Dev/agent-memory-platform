---
id: exp-RMgA87bT6F
session_id: deepgram-switchover-session
agent_id: amp-researcher
task: [20260331-pipeline-accuracy-optimization] experiment #2: Model comparison tested gpt-5.4, 5.4-mini, 5.4-nano across all stages. gpt-5.4 was the only model with 100% Stage 2 reliability (9/10 with gpt-4o, 3/5 with gpt-4o-mini). Assigned gpt-5.4 to Stages 1+2, gpt-5.4-nano to Stage 3. Result: 5/6 probing questions matched consistently, Stage 2 classification 100% correct across 3 runs.
outcome: approved
created_at: "2026-03-31T18:33:31.478Z"
---

Hypothesis: Upgrading all stages to gpt-5.4 family models will fix Stage 2 reliability and improve overall accuracy. gpt-5.4 for Stage 2, gpt-5.4 for Stage 1, gpt-5.4-nano for Stage 3.
Changes: Model comparison tested gpt-5.4, 5.4-mini, 5.4-nano across all stages. gpt-5.4 was the only model with 100% Stage 2 reliability (9/10 with gpt-4o, 3/5 with gpt-4o-mini). Assigned gpt-5.4 to Stages 1+2, gpt-5.4-nano to Stage 3. Result: 5/6 probing questions matched consistently, Stage 2 classification 100% correct across 3 runs.
Result: probing_match_rate=0.83 (keep)
Insight: Stage 2 SOP classification is the critical bottleneck — requires the most capable model. Stage 3 probing matching is a simpler task that cheaper models handle well. Stage 1 with gpt-5.4 consistently gets functional_status right but still extracts outside_location as 'outside' — this is transcript ambiguity, not model capability.