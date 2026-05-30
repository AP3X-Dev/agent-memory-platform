---
id: QpZnV1VJcQItKE6g3rC__
session_id: session-20260410-optv2-audit
agent_id: mcp
task: [project:agent-assist-cr] optimization loop v2: audit complete, 14-item backlog generated
outcome: approved
created_at: "2026-04-10T23:07:02.656Z"
---

[project:agent-assist-cr] v2 optimization audit complete. 5 findings confirmed with exact line numbers:

1. HIGH: AssistState has 3 unprotected mutation paths — streaming entities (session_manager.py:498-521), form review (session_manager.py:415-426, form_review_applicator.py:69-84), both skip _assist_lock. 16 lock acquisitions exist in api_server.py but none in session_manager mutation paths.

2. MEDIUM-HIGH: Electron poller uses setInterval(async) at 1s (main.js:298,339). No in-flight guard. v1 added version tokens but didn't prevent overlapping cycles. Race on version state writes at lines 316,323,330.

3. MEDIUM: Cost telemetry missing on 6 active LLM call sites: fact_extractor.py:173, sop_matcher.py:173, probing_matcher.py:179, probing_filter.py:121, form_reviewer.py:125, sop_engine.py:921. ExtractionPipeline constructor doesn't accept cost_tracker. record_deepgram has zero production callers.

4. MEDIUM: CostTracker _persist() does full JSON rewrite on every record (cost_tracker.py:103-114). O(n) disk IO.

5. MEDIUM: send_audio() drops frames on disconnect (stt_deepgram_stream.py:142-143). Capture loop retries with zero backoff (audio_capture.py:196-197). No frame buffering during 1-10s reconnection windows.

Cleanup: 5 stale Whisper artifact locations survived v1. api_server.py grew to 1104 lines, main.js to 869.

14 items across 6 blocks. Estimated ~14 sessions.