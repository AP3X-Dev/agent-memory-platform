---
id: ncbmxBl4kL1IZOBXxy1DC
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Merge pipeline strategy for streaming path
created_at: "2026-04-01T05:20:41.304Z"
---

[project:agent-assist-cr] Decision: Build a new lightweight merge path for streaming (option B), not adapt results into existing chunk-based merge pipeline.

Rationale: Since this is a parallel pipeline intended to compete with and eventually replace the existing one, there's no value in shoehorning streaming data into chunk-shaped containers. Streaming already provides per-speaker, timestamped, ordered segments — the chunk-boundary dedup and cross-chunk overlap detection in the current 3-stage merge pipeline solve problems that streaming doesn't have.

New streaming merge path: sort by timestamp, group by speaker, build bubbles from natural speech boundaries. Stages 1-2 of existing merge pipeline (per-stream dedup, cross-speaker splitting) are largely unnecessary since DeepGram handles segmentation natively. Stage 3 (bubble construction) still applies conceptually but with simpler inputs.

This means the streaming path gets its own data model and merge logic, cleanly separated from the chunk-based path. Whichever pipeline wins replaces the other.