---
id: exp-LQi263oKOl
session_id: sop-panel-research-session
agent_id: amp-researcher
task: [20260331-sop-panel-context-aware] experiment #0: Fed baseline transcript (32 chunks) through SOP engine with each model. Measured alert accuracy (must surface SCHEDULING, PRICING, HOURS; must NOT surface ESCALATION, SERVICE NOT PROVIDED) and context accuracy (membership=member, must_book=true, fee_rows present). Also counted unnecessary context updates (same context pushed multiple times).

Results:
- gpt-5.4: 5/5 alert score, 3/3 context, 7 alerts, 4 real context changes out of 32, 28 unnecessary updates. 63s total. Clean — no false alerts.
- gpt-5.4-mini: 5/5 alert score, 3/3 context, 17 alerts, 12 context changes out of 32, 20 unnecessary. 48s. Noisy — surfaced SPECIAL INSTRUCTION alerts that weren't triggered by conversation (cold transfer procedure when no transfer requested).
- gpt-5.4-nano: 4/5 alert score, 3/3 context, 3 alerts, 4 context changes, 28 unnecessary. 29s. Missed HOURS entirely. Too conservative.
outcome: approved
created_at: "2026-03-31T18:47:53.970Z"
---

Hypothesis: Model comparison baseline — test gpt-5.4, 5.4-mini, and 5.4-nano for SOP analysis accuracy and update frequency across 32 transcript chunks.
Changes: Fed baseline transcript (32 chunks) through SOP engine with each model. Measured alert accuracy (must surface SCHEDULING, PRICING, HOURS; must NOT surface ESCALATION, SERVICE NOT PROVIDED) and context accuracy (membership=member, must_book=true, fee_rows present). Also counted unnecessary context updates (same context pushed multiple times).

Results:
- gpt-5.4: 5/5 alert score, 3/3 context, 7 alerts, 4 real context changes out of 32, 28 unnecessary updates. 63s total. Clean — no false alerts.
- gpt-5.4-mini: 5/5 alert score, 3/3 context, 17 alerts, 12 context changes out of 32, 20 unnecessary. 48s. Noisy — surfaced SPECIAL INSTRUCTION alerts that weren't triggered by conversation (cold transfer procedure when no transfer requested).
- gpt-5.4-nano: 4/5 alert score, 3/3 context, 3 alerts, 4 context changes, 28 unnecessary. 29s. Missed HOURS entirely. Too conservative.
Result: unnecessary_updates=28 (keep)
Insight: gpt-5.4 is the most accurate — perfect alert scoring, no false positives, and fewest unnecessary alerts. Mini is noisy (surfaces procedures not triggered by conversation). Nano misses required categories. For the SOP engine where accuracy and relevance are critical, gpt-5.4 is the right choice. The 28 unnecessary context updates (same context re-pushed) is an architecture issue, not a model issue — all models have it. Next experiment should add change detection.