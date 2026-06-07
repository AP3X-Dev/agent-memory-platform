---
id: FhPUas1rnDhGvSJWX55Kp
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Migration path stages for streaming transition
created_at: "2026-04-01T05:58:26.211Z"
---

[project:agent-assist-cr] Migration path from chunk-based STT to DeepGram WebSocket streaming — four phases:

Phase 1 (current build): streaming_enabled=True, streaming_primary=False. Streaming runs silently alongside chunk pipeline. Chunk feeds UI and all downstream consumers. Streaming collects transcripts for comparison. Collect latency, completeness, accuracy, and cost metrics via ComparisonLogger.

Phase 2: streaming_primary=True. Streaming feeds UI and downstream (notes, analysis, SOP). Chunk pipeline still runs as safety net and fallback. Validate in real production calls.

Phase 3: Remove chunk STT calls. DualStreamCapture still writes WAVs for archival and replay, but no longer sends them to Whisper or DeepGram REST. Saves API cost and eliminates redundant processing.

Phase 4: Optionally remove WAV writing entirely if archival is not needed. Upgrade reconnection strategy to backfill from local audio ring buffer instead of relying on chunk fallback. Streaming becomes the sole path.

Each phase is a config flag change until Phase 3-4 where dead code gets removed. Settings hot-reload allows switching mid-session without restart.