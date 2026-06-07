---
id: bQKqvbYrgSBJhO68WPXe-
session_id: session-20260416-task2
agent_id: mcp
task: [project:agent-assist-cr] Task 2: Demote empty-answer matches in Stage 3 post-processor
outcome: approved
created_at: "2026-04-16T21:43:27.645Z"
---

[project:agent-assist-cr] Completed Task 2 of the 2026-04-16 live-call fixup plan. Modified _post_process in src/engine/agents/probing_matcher.py to add two new behaviors: (1) empty/None answer with no customer_unsure and no not_applicable flags is now demoted to unmatched_questions instead of passing through as a false match — this stops Stage 3 LLM noise from polluting the checklist display; (2) dedup pass ensures any question_id present in kept matched_answers is removed from unmatched_questions so a question id appears in exactly one list. The unmatched dedup uses a set (kept_ids) for O(n) membership check, plus an unmatched_seen set to handle duplicates within the unmatched list itself. Branch ordering in the new _post_process: unsure/NA passthrough → empty-demote → normalize → accepted-list check → dedup. Added 2 new tests: test_matcher_demotes_empty_answer_without_flags and test_matcher_dedupes_unmatched_against_kept. Commit: 3760a27 on feat/extraction-sop-slicing-hardening. All 12 tests in test_probing_matcher.py pass; full suite 1045 passed (1 pre-existing flaky integration test unrelated to this change); ruff and mypy --strict clean.