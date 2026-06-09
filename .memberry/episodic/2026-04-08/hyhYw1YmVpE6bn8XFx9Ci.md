---
id: hyhYw1YmVpE6bn8XFx9Ci
session_id: chunk-pipeline-removal-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Remove chunk STT pipeline, ComparisonLogger, and streaming config flags
outcome: approved
created_at: "2026-04-08T09:34:14.427Z"
---

[project:agent-assist-cr] Completed Phase 3 streaming migration — removed chunk STT pipeline, ComparisonLogger, and streaming_enabled/streaming_primary config flags. Streaming is now the sole STT path.

**Deleted files (11):**
- src/engine/stt_deepgram.py (REST batch transcriber)
- src/engine/merge_pipeline.py (3-stage chunk merge)
- src/engine/comparison_logger.py (Phase 1 A/B comparison)
- src/engine/entity_mapper.py (DeepGram REST entity mapping — streaming doesn't support entities)
- tests/test_stt_deepgram.py, test_transcript_fixes.py, test_merge_pipeline.py, test_comparison_logger.py, test_config_streaming.py, test_downstream_source.py, test_entity_mapper.py

**Moved before deleting merge_pipeline.py:**
- format_conversation() and format_source_stream() → moved into stt_openai.py (still used by streaming path)

**Session dataclass simplified:**
- Removed chunk stores (user_transcripts, remote_transcripts) and all chunk cache fields
- Streaming stores (streaming_user_transcripts, streaming_remote_transcripts) are now the canonical stores
- get_active_timeline/get_active_mic_continuous/get_active_system_continuous now unconditionally return streaming data
- Removed get_timeline (chunk), get_mic_continuous (chunk), get_system_continuous (chunk), get_reconstructed

**SessionManager simplified:**
- Removed _on_chunk, _process_chunk, _transcribe_stream, _build_chunk_text, _sop_feed (chunk), _is_chunk_silent
- Removed _get_dg_transcriber, _get_comparison_logger, _run_deepgram_comparison
- Removed chunk executor pool, chunk futures, chunk counts, comparison loggers dict
- create_session no longer passes on_chunk_ready to DualStreamCapture
- Streaming pipeline starts unconditionally when deepgram_api_key is set (no streaming_enabled check)
- _on_streaming_tick no longer checks streaming_primary

**Config removed:** deepgram_enabled, deepgram_entity_fill, deepgram_comparison_log, deepgram_primary, streaming_enabled, streaming_primary

**API removed:** /transcripts/chunks, /comparison, /transcripts/reconstructed endpoints. Settings model and response cleaned of dead fields.

**Settings UI:** Removed streaming toggles, DeepGram REST checkboxes (enabled/primary/entity-fill/comparison-log). DeepGram tab now just has API key.

282 tests pass. DualStreamCapture still writes WAV files for archival (Phase 4 item, not removed).