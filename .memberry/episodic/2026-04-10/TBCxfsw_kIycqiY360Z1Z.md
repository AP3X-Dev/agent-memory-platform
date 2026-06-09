---
id: TBCxfsw_kIycqiY360Z1Z
session_id: markov-logic-tree-impl-2026-04-10
agent_id: mcp
task: [project:agent-assist-cr] Implement Markov Logic Tree probing question filter
outcome: approved
created_at: "2026-04-10T14:47:14.752Z"
---

[project:agent-assist-cr] Implemented the probing question filter (Markov Logic Tree) across 6 commits on the markov-logic-tree branch.

Components built:
1. always_ask flag on ProbingQuestion — drain_mb_02 always shown for Drains calls
2. ProbingFilterResult model — relevant_questions + relevance_reasoning
3. Probing Filter Agent — nano LLM call in probing_filter.py, returns None on any failure
4. Pipeline integration — filter runs parallel with Stage 3 via asyncio.gather, additive-only visible set, locks with Stage 2
5. Applicator integration — _apply_probing_filter hides excluded questions, _apply_probing_answers skips filtered questions
6. E2E integration test — full pipeline through applicator with real probing_questions.json

Key files: probing_filter.py (new agent), probing_filter_result.py (new model), extraction_pipeline.py (modified), pipeline_applicator.py (modified), probing.py (always_ask field), probing_questions.json (drain_mb_02 data), test_probing_filter.py (25 tests).

Code review feedback incorporated: made _probing_filter_locked an explicit guard in _run_filter(), documented _compute_visible_set fallback behavior.

366 tests pass, 0 failures. Final review safety net (DrainCoordinator final sweep surfacing filtered-out answers) deferred to follow-up.