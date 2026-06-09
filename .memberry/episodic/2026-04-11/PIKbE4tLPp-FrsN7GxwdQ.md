---
id: PIKbE4tLPp-FrsN7GxwdQ
session_id: session-20260410-na-rules-integration
agent_id: mcp
task: [project:agent-assist-cr] Wire instant N/A rules into pipeline applicator step 4.5
outcome: approved
created_at: "2026-04-11T04:48:22.773Z"
---

[project:agent-assist-cr] Integrated probing_na_rules.py into pipeline_applicator.py as step 4.5 between customer info (step 4) and LLM probing filter (step 5). Added _apply_na_rules helper with same guards as _apply_probing_filter: skips AUTO_DETECTED, COMPLETED, and agent_override items. Step 4.5 calls get_na_question_ids with trade, equipment_type, job_type, problem_description, and symptoms from state/facts, then applies CONDITIONAL_HIDDEN to matched items. Four integration tests added to test_probing_na_rules.py: AC hides fuel, answered item preserved, agent override preserved, empty checklist no crash. All 687 tests pass.