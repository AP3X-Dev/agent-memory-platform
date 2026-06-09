---
id: xBxOnpEg00nlowVxIK879
session_id: session-20260410-probing-fast-match
agent_id: mcp
task: [project:agent-assist-cr] Add question type classifier for probing fast-match (Task 1)
outcome: approved
created_at: "2026-04-11T02:27:32.899Z"
---

[project:agent-assist-cr] Created src/engine/probing_fast_match.py with classify_question_type() — pure regex classifier, no I/O. Six types: yes_no, age, location, count, type_brand, free_text. Priority order: yes_no > age > location > count > type_brand > free_text. Key design decision: count must rank above type_brand because questions like "If standard, size of tank" contain both "standard" (type_brand) and "size" (count) — count is the correct classification. Tests: 23/23 pass. Full suite: 591/591, no regressions.