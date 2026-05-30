---
id: pQuBo8JG8Y0dJAZpUskX5
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Architecture approach decision
outcome: approved
created_at: "2026-04-01T05:30:15.970Z"
---

[project:agent-assist-cr] Decision: Approach C — Streaming layer with shared downstream, separate transcript stores.

DeepgramStreamClient writes to isolated transcript lists (streaming_user_transcripts / streaming_remote_transcripts). 15s timer triggers the same downstream consumers (notes, analysis, SOP) but feeds from streaming store. Config flag controls which store feeds the UI and downstream. No duplication of expensive LLM downstream logic.

Migration path: flip config flag to streaming → validate quality and latency → remove chunk pipeline, chunk store, and the flag. Clean removal with no orphaned code.

Confirmed by user: approach must allow accurate A/B testing between pipelines and eventual full replacement of chunk logic.