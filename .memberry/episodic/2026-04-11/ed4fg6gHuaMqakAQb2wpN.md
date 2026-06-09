---
id: ed4fg6gHuaMqakAQb2wpN
session_id: session-20260410-echo-detector
agent_id: mcp
task: [project:agent-assist-cr] Task 3: Add echo detector to probing_fast_match.py
outcome: approved
created_at: "2026-04-11T02:33:24.650Z"
---

[project:agent-assist-cr] Added ProbingFastMatchState dataclass and echo_detect() to src/engine/probing_fast_match.py. Echo detection uses keyword-overlap scoring: score = overlap / len(question_keywords), threshold ECHO_THRESHOLD=0.40. Filler words stripped via _FILLER_WORDS frozenset before scoring. State holds active_question_id, active_question_type, active_question_since (time.monotonic()); pending_questions is never mutated by echo_detect. 7 new tests in TestEchoDetector all pass; full suite 625/625 green. Committed as feat(probing): add echo detector for agent question matching.