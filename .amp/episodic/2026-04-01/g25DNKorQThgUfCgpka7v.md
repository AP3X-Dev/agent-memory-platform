---
id: g25DNKorQThgUfCgpka7v
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Post-fix benchmark: 3-stage pipeline probing regressed to 44% with gpt-4o-mini
outcome: approved
created_at: "2026-04-01T17:49:20.068Z"
---

[project:agent-assist-cr] Post-fix benchmark results (3 runs, gpt-4o-mini):

Unified Analyzer: 100% classification, 100% customer info, 83% probing (consistently misses hvac_mb_04). Avg 6.9s. Stable and reliable.

3-Stage Pipeline: 100% classification score (but Stage 2 returned trade=None in 2/3 runs — scoring bug lets None pass as matching). Probing dropped to 44% avg (17% min, 100% max). When Stage 2 fails (trade=None), no checklist builds, so probing answers match no questions.

Root cause confirmed: gpt-4o-mini fails Stage 2 SOP classification ~40% of the time. This was the same finding from the deepgram-switchover-session experiments. The probing not_applicable fix and prompt tightening didn't help because the problem is upstream — Stage 2 classification failure cascades into Stage 3 probing failure.

Also found: When Stage 2 fails, Stage 3's probing matcher invents its own question IDs (type_of_system, age_of_system) instead of using the checklist IDs (hvac_mb_01, hvac_mb_02). This happens because no trade-specific questions are loaded, so the matcher gets 0 questions and makes up field names from the equipment facts.

Conclusion: The 3-stage pipeline REQUIRES per-stage model assignment. Stage 2 must use gpt-5.4 for reliability. With gpt-4o-mini for all stages, the unified analyzer is the superior choice (83% probing vs 44% probing, 3x faster, 1 LLM call vs 3).