---
id: 33pU8Ys5eMxJQ8kbhobjS
session_id: probing-filter-applicator-2026-04-10
agent_id: mcp
task: [project:agent-assist-cr] Apply probing filter mask in pipeline_applicator.py
outcome: approved
created_at: "2026-04-10T14:41:37.438Z"
---

[project:agent-assist-cr] Added _apply_probing_filter function to pipeline_applicator.py that hides probing questions not in the visible_question_ids set by setting them to CONDITIONAL_HIDDEN. Key rules: never hide AUTO_DETECTED/COMPLETED questions (already answered), never hide agent_override questions, only filter the "probing" section. Updated _apply_probing_answers to accept optional visible_question_ids parameter and skip answers for filtered-out questions. Wired both into apply_pipeline_result as steps 5 (filter mask) and 6 (probing answers), shifting metadata to step 7. visible_question_ids=None means no filter (backwards compatible). 5 new tests in TestApplicatorFilterMask class, all 33 tests pass.