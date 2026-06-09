---
id: iRDGSy9NreEC-NK85KeLg
session_id: code-review-deepgram-stream-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Code review of stt_deepgram_stream.py — bugs, dead code, race conditions, leftover chunk pipeline code
created_at: "2026-04-08T11:44:55.729Z"
---

[project:agent-assist-cr] Reviewed stt_deepgram_stream.py for bugs, dead code, race conditions. Key findings: (1) Race condition on _connected dict — reads/writes happen both inside and outside _lock, (2) stop() method is dead code — never called by session_manager, drain() is used instead via DrainCoordinator, (3) offset_ms parameter in send_audio is unused, (4) is_final field parsed from DeepGram result but never checked (interim_results=False so all results are final, making the field redundant but not buggy), (5) _connected dict replacement on line 72 and 130 is not thread-safe. Leftover chunk pipeline: FEATURES.md still describes _process_chunk() pipeline that no longer exists. audio_capture.py still has on_chunk_ready/ChunkPair which are chunk-era artifacts no longer used by session_manager. scripts/test_capture.py uses on_chunk_ready. process_chunk method name in orchestrator is vestigial naming but still actively used.