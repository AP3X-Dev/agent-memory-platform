---
id: OGl7UlD4MdT1flr5vWZ1y
session_id: probing-filter-pipeline-integration-2026-04-10
agent_id: mcp
task: [project:agent-assist-cr] Integrate probing filter into ExtractionPipeline
outcome: approved
created_at: "2026-04-10T14:33:03.590Z"
---

[project:agent-assist-cr] Integrated ProbingFilter into ExtractionPipeline with three key behaviors: (1) Filter runs in parallel with Stage 3 via asyncio.gather in _run_sequential, adding zero latency. (2) Additive-only tracking: _shown_question_ids accumulates across ticks so once a question is shown it stays shown, preventing mid-call UI flicker. (3) Filter locks when Stage 2 locks (_probing_filter_locked set in _run_stage2), and _run_parallel uses the frozen _shown_question_ids. PipelineResult gained visible_question_ids: Optional[Set[str]] where None means show all (backwards compatible). The _compute_visible_set method combines filter result + always_ask IDs + previously shown IDs. Four integration tests added to test_probing_filter.py covering parallel execution, additive-only behavior, filter failure fallback, and lock-with-Stage-2.