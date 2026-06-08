---
id: 9O-XsP8CEB8NzRnIImbvQ
session_id: always-ask-flag-2026-04-10
agent_id: mcp
task: [project:agent-assist-cr] Add always_ask flag to ProbingQuestion model and data
outcome: approved
created_at: "2026-04-10T14:18:27.749Z"
---

[project:agent-assist-cr] Added always_ask boolean field (default=False) to ProbingQuestion model in src/engine/models/probing.py. Updated probing_questions.json to set always_ask=true on drain_mb_02 in Drains_Must Book, Drains_Demand Service, and Drains_After Hours question sets. Updated get_question_list() in probing_loader.py to include always_ask in returned dicts. Created tests/test_probing_filter.py with 7 tests covering model field behavior and loader output. All regression tests pass (16/16).