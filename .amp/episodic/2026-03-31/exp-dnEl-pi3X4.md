---
id: exp-dnEl-pi3X4
session_id: deepgram-switchover-session
agent_id: amp-researcher
task: [20260331-pipeline-accuracy-optimization] experiment #1: 1) Redefined functional_status to focus on primary function (AC blowing warm = non-functional). 2) Added outside_location guidance to use agent question context for ground level/roof. 3) Tightened not_applicable in Stage 3 — only for equipment-type impossibilities, not unanswered questions. 4) Added anti-hallucination guardrail and equipment-to-question field mapping in probing matcher.
outcome: approved
created_at: "2026-03-31T18:33:18.541Z"
---

Hypothesis: Improving Stage 1 prompts for functional_status and outside_location, and Stage 3 not_applicable vs unmatched distinction, will increase accuracy.
Changes: 1) Redefined functional_status to focus on primary function (AC blowing warm = non-functional). 2) Added outside_location guidance to use agent question context for ground level/roof. 3) Tightened not_applicable in Stage 3 — only for equipment-type impossibilities, not unanswered questions. 4) Added anti-hallucination guardrail and equipment-to-question field mapping in probing matcher.
Result: probing_match_rate=0.67 (keep)
Insight: functional_status now correct. not_applicable vs unmatched fixed. outside_location still extracted as 'outside' — transcript ambiguity, not model issue. Stage 3 improved from hallucinating answers to correctly leaving unanswered questions unmatched.