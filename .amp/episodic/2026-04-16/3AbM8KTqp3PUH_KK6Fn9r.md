---
id: 3AbM8KTqp3PUH_KK6Fn9r
session_id: session-20260416-120000
agent_id: mcp
task: [project:agent-assist-cr] Task 1: Make customer_answer tolerant of null/blank in ConversationQA
outcome: approved
created_at: "2026-04-16T19:40:11.281Z"
---

[project:agent-assist-cr] Fixed Stage 1 extraction crash: ConversationQA.customer_answer was declared as required str. LLM emits null on weak exchanges, exhausting pydantic-ai retries and killing the tick. Changed field to str | None = None and added _coerce_blank_to_none validator on customer_answer and resolved_answer. Created tests/models/ directory with 4 tests. All 997 tests pass, mypy --strict and ruff clean. Commit: ada1d9a.