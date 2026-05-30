---
id: KA1jWe5vVDKbIOfQnxCZF
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Design DeepGram Nova 3 WebSocket streaming STT integration
created_at: "2026-04-01T05:05:01.860Z"
---

[project:agent-assist-cr] Starting design for DeepGram WebSocket streaming integration to replace chunk-based STT pipeline.

Current architecture: DualStreamCapture writes 5s WAV chunks → merger pairs by index → file-upload STT (Whisper or DeepGram REST) → downstream consumers triggered on chunk boundaries. Frontend polls 4 endpoints every 1s via Electron IPC. No WebSocket anywhere in the stack.

Key decision: Keep DualStreamCapture running in parallel as fallback/recording mechanism. Streaming is additive — new path alongside existing one. This allows A/B testing, graceful degradation, and safe rollback. WAV files continue to be written for archival and comparison. Once streaming is validated, old system can be degraded.

Latency problem: Current pipeline adds ~8-10s from speech to transcript (7s buffer + file I/O + HTTP upload + API response). WebSocket streaming targets ~300ms with interim results.

Downstream impact: ChunkPair as unit of work, merge pipeline chunk-boundary dedup, chunk_index-based cadence for analysis/notes/SOP, and timeline caching all need rethinking — likely timer or utterance-end events instead of chunk boundaries.