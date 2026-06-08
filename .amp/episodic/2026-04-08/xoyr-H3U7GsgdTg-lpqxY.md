---
id: xoyr-H3U7GsgdTg-lpqxY
session_id: chunk-pipeline-removal-test-fixes-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Fix test failures after removing chunk-based STT pipeline, ComparisonLogger, and streaming config flags
outcome: approved
created_at: "2026-04-08T09:32:58.752Z"
---

[project:agent-assist-cr] Removed chunk-based STT pipeline, ComparisonLogger, and streaming_primary/streaming_enabled config flags from the codebase. Fixed 10 test failures and 3 test errors across 7 test files:

1. test_api_endpoints.py: Removed assertions for deepgram_enabled, deepgram_comparison_log, deepgram_primary, streaming_enabled, streaming_primary from settings checks. Deleted test_update_deepgram_enabled and TestComparisonEndpoint class (endpoint removed).

2. test_config.py: Removed assertions for deepgram_enabled, deepgram_entity_fill, deepgram_comparison_log, streaming_enabled, streaming_primary from defaults and settings_fields tests.

3. test_session_manager_streaming.py: Deleted TestGetActiveTranscripts class (_get_active_transcripts removed from SessionManager).

4. test_session_streaming.py: Deleted test_streaming_stores_independent_from_chunk_stores (references user_transcripts which no longer exists).

5. test_sop_feed.py: Deleted test_build_chunk_text_empty_session (_build_chunk_text removed).

6. test_reconstructor_agent.py: Deleted test_session_manager_get_reconstructed_timeline (get_reconstructed_timeline removed from SessionManager).

7. test_api_streaming_endpoints.py: Removed chunk store references from mock_session fixture, deleted test_get_chunk_transcripts (/transcripts/chunks endpoint removed), updated test_main_transcripts_uses_active_timeline to remove streaming_primary mock and assert streaming content instead of chunk content.

Key architectural change: Session no longer has user_transcripts/remote_transcripts (chunk stores). Only streaming_user_transcripts/streaming_remote_transcripts remain. get_active_timeline() always returns streaming timeline.