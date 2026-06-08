---
id: om3qBzhxbkzUeb5KPhAPg
session_id: cic2-phase3-2026-03-27
agent_id: mcp
task: [project:cic2] Phase 3 task 3: SessionPipelineManager
outcome: approved
created_at: "2026-03-28T06:11:43.267Z"
---

[project:cic2] Created runtime/pipeline/session_pipeline_manager.py. SessionPipelineManager owns per-session PipelineOrchestrator + DualStreamCapture lifecycle. Shared ThreadPoolExecutor(4) processes audio frames. Workers call orchestrator.process_audio_frame() synchronously, then bridge projection updates to the async event loop via run_coroutine_threadsafe for WebSocket broadcasting. _pipelines dict guarded by threading.Lock. DualStreamCapture is lazily imported inside start_pipeline to avoid pyaudiowpatch dependency in tests. Graceful degradation: if capture fails, pipeline still exists without audio. 8 new tests covering: context creation, cleanup, frame processing with mock STT, empty STT, drain on stop, stopped session noop, concurrent sessions. 456 tests total.