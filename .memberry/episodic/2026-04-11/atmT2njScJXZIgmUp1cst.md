---
id: atmT2njScJXZIgmUp1cst
session_id: session-20260410-probing-e2e
agent_id: mcp
task: Add end-to-end integration test for probing fast match system
outcome: approved
created_at: "2026-04-11T02:49:41.048Z"
---

[project:agent-assist-cr] Added TestEndToEnd class to tests/test_probing_fast_match.py covering two scenarios: full HVAC call flow (echo detection, active-question extraction, unsure detection, keyword fallback) and LLM-closes-window (no duplicate answers after LLM removes pending question). Found and fixed a bug in _LOCATION_ANSWER_RE in probing_fast_match.py: bare 'inside' and 'outside' words were ambiguous — they matched as adjectives in phrases like 'the inside unit' before more specific location words like 'attic'. Removed them from the answer pattern; specific rooms (attic, basement, garage, etc.) remain. All 638 tests pass.