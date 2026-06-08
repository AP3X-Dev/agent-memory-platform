---
id: VqKxNVWfhKQ6pgbFtqsWA
session_id: session-20260410-task4-probing-unhide
agent_id: mcp
task: [project:agent-assist-cr] Task 4 — LLM probing filter un-hide logic
outcome: approved
created_at: "2026-04-11T04:50:48.183Z"
---

[project:agent-assist-cr] Updated _apply_probing_filter in pipeline_applicator.py to handle both directions: questions in visible_ids that are CONDITIONAL_HIDDEN get restored to PENDING (LLM overrides deterministic N/A rules); questions not in visible_ids are hidden as before. Only CONDITIONAL_HIDDEN items are un-hidden — AUTO_DETECTED, COMPLETED, and agent_override items are never touched. Added TestLLMOverride class (3 tests) to test_probing_na_rules.py. Full suite: 690/690 pass. Committed as feat(probing): allow LLM filter to un-hide rule-hidden questions.