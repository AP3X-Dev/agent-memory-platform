---
id: KCxn3WV1H6G593WJBeioq
session_id: review-task4-probing-filter-2026-04-10
agent_id: mcp
task: [project:agent-assist-cr] Code review of Task 4: ExtractionPipeline probing filter integration
outcome: approved
created_at: "2026-04-10T14:36:19.180Z"
---

[project:agent-assist-cr] Task 4 review completed. Implementation integrates probing filter into ExtractionPipeline with parallel execution via asyncio.gather, additive-only visible set accumulation, and filter lock tied to Stage 2 lock. All 4 integration tests pass, 341 pre-existing tests pass with no regressions.

Key finding: _probing_filter_locked flag is set to True in _run_stage2 but is never read anywhere in the pipeline. The filter lock works correctly only because the post-lock fast path (_run_parallel) never calls _run_sequential where the filter lives — the lock is implicit via control flow. The flag is misleading and the test for it passes for the wrong structural reason. Recommendation: either use it as an explicit guard inside _run_filter, or remove it and document the implicit lock.

Secondary finding: _compute_visible_set does not update _shown_question_ids when filter_result is None (fallback path). This is correct behavior but undocumented — accumulated IDs from prior ticks are preserved through failure ticks, which is intentional and safe, but should be commented.

Edge case not tested: when filterable_qs is empty (all questions are always_ask), _run_filter returns None which causes visible_question_ids to be None rather than the set of always-ask IDs. This is technically correct but the consumer cannot distinguish this from a filter failure.

Architecture pattern: inner async def closures inside hot path (_run_sequential called every tick) is consistent with existing _run_parallel pattern in the same file.