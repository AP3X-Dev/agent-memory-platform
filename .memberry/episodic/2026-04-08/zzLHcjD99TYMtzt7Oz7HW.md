---
id: zzLHcjD99TYMtzt7Oz7HW
session_id: bug-scan-preexisting-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Bug scan of 6 pre-existing Python files: llm_notes, drain_coordinator, sop_normalizer, probing_loader, sop_text_loader, pipeline_applicator
created_at: "2026-04-08T17:34:29.115Z"
---

[project:agent-assist-cr] Bug scan findings:

1. BUG (extraction_pipeline.py:110-114, 298-302): Locked SopMatchResult shallow copy drops snp_blocked, must_book_eligible, must_book_rule_matched, routing_flag, message_only, escalation, fees, scheduling_context, additional_procedures. This causes probing to run when it should be skipped (snp_blocked lost), wrong question set loaded (must_book_eligible lost), and pipeline_applicator never sets must_book/emergency flags post-lock.

2. BUG (llm_notes.py:87-89): Memory leak — _rolling_summaries, _last_conversation_text, _last_customer_text dicts keyed by session_id are never cleaned up. NotesGenerator is a singleton on SessionManager, so entries accumulate across all sessions.

3. DEAD_CODE (drain_coordinator.py:14): Optional imported but never used.

4. SUSPICIOUS (pipeline_applicator.py:173-175): must_book_eligible unconditionally sets is_emergency=True. Must-book includes non-emergency scenarios (e.g. maintenance tune-ups with specific booking rules). May over-flag emergencies.

No stale ChunkPair/on_chunk_ready references found — those were cleanly removed. Drain coordinator works correctly with streaming-only architecture (handles stream_client=None gracefully at line 82-84). Pipeline applicator handles probing_match=None correctly (guarded at line 89).