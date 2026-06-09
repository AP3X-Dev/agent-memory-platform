---
id: IWV1tiVOFmdhjxwp097cC
session_id: chunk-pipeline-removal-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Split job_type and must_book_eligible into separate fields
outcome: approved
created_at: "2026-04-08T10:07:25.730Z"
---

[project:agent-assist-cr] Refactored job_type so "Must Book" is no longer a competing classification with service categories. Must Book is now a separate boolean flag (must_book_eligible) on both SopMatchResult and ClassificationResult.

**The problem:** gpt-5.4 flip-flopped between "Must Book" and "Demand Service" because both were correct — the call IS demand service AND qualifies for must-book. This reset the lock streak and delayed probing question loading.

**The fix:** job_type now only holds service categories (Demand Service, Maintenance, Estimate, After Hours). must_book_eligible is a separate boolean. The lock key (trade, job_type) is now stable since "Must Book" can't appear as a job_type.

**Changes across 9 files:**
- SopMatchResult: Added must_book_eligible: bool = False
- ClassificationResult: Added must_book_eligible: bool = False
- AssistState._merge_classification: OR logic for must_book_eligible (once True, stays True)
- SOP matcher prompt: Updated to output must_book_eligible separately, not "Must Book" as job_type
- pipeline_applicator: _apply_classification propagates must_book_eligible; _build_checklist uses "Must Book" as probing key when must_book_eligible=True
- extraction_pipeline: Both locked and unlocked Stage 3 paths use must_book_eligible for probing key lookup
- analyzer.py: AnalyzerOutput model adds must_book_eligible; keyword_classify outputs must_book flag; prompt updated
- orchestrator.py: Removed "Must Book" from _VALID_JOB_TYPES; propagates must_book_eligible; checklist build and probing context use must_book_eligible for key

**Probing questions unchanged:** The {Trade}_Must Book keys in probing_questions.json stay as-is. When must_book_eligible=True, the probing loader is called with "Must Book" as the job_type key. This means no JSON restructuring was needed.

282 tests pass.