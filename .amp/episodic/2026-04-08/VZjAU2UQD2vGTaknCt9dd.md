---
id: VZjAU2UQD2vGTaknCt9dd
session_id: bug-scan-session-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Bug scan of 8 recently modified files: extraction_pipeline, sop_matcher, fact_extractor, session_manager, streaming_cadence, audio_capture, sop_engine, api_server
created_at: "2026-04-08T17:35:36.801Z"
---

[project:agent-assist-cr] Bug scan findings:

1. BUG: fire_final tick always discarded — stop_session adds to _stopping BEFORE calling fire_final, but _on_streaming_tick checks _stopping and returns immediately. The final tick comment says it should trigger work but it never does.

2. BUG: Quadratic prompt blowup in SOP engine streaming feed — _streaming_sop_feed sends full accumulated transcript each tick, but _build_prompt appends each "chunk" to transcript_chunks and includes ALL previous chunks in the prompt. With streaming, each "chunk" is the full transcript, causing O(n^2) token growth.

3. DEAD_CODE: audio_capture.py output_dir parameter stored but never read after WAV/chunk refactoring.

4. DEAD_CODE: extraction_pipeline.py _run_parallel lines 175-176 else branch unreachable since _run_parallel requires self._previous_facts is not None.

5. DEAD_CODE: session_manager.py line 276 redundant local import of format_conversation and format_source_stream already imported at top level.

6. SUSPICIOUS: sop_engine.py line 581 walrus operator (m := a) is pointless — a is already AlertMetadata, m just aliases it.