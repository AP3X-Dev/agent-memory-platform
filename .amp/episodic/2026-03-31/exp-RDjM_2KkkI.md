---
id: exp-RDjM_2KkkI
session_id: sop-panel-research-session
agent_id: amp-researcher
task: [20260331-sop-panel-context-aware] experiment #1: Major SOP prompt rewrite: (1) Added Minimum Viable Information Rule — every alert must earn its place. (2) Added explicit anti-speculation section with BAD/GOOD examples. (3) PRICING restricted to single fee row + single tier. (4) HOT TOPIC restricted to topics affecting THIS call only. (5) SERVICE NOT PROVIDED requires confirmed match, no proactive scanning. Could not measure due to gpt-5.4 rate limit (429 on all 27 chunks). Needs live test to verify.
outcome: revised
created_at: "2026-03-31T19:54:48.322Z"
---

Hypothesis: Rewriting the SOP system prompt to enforce Minimum Viable Information Rule and add explicit anti-speculation guardrails will eliminate irrelevant alerts (tune-up pricing, speculative SNP, commercial hot topics).
Changes: Major SOP prompt rewrite: (1) Added Minimum Viable Information Rule — every alert must earn its place. (2) Added explicit anti-speculation section with BAD/GOOD examples. (3) PRICING restricted to single fee row + single tier. (4) HOT TOPIC restricted to topics affecting THIS call only. (5) SERVICE NOT PROVIDED requires confirmed match, no proactive scanning. Could not measure due to gpt-5.4 rate limit (429 on all 27 chunks). Needs live test to verify.
Result: unnecessary_updates=0 (thought)
Insight: Rate limit hit during batch testing — 27 sequential LLM calls with full SOP context is too many for a single burst. Need to add rate limiting/backoff to the comparison tool, or test with fewer chunks. Live testing will verify the prompt changes work.