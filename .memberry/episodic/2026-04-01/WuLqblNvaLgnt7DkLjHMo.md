---
id: WuLqblNvaLgnt7DkLjHMo
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] WebSocket connection model decision
created_at: "2026-04-01T05:23:52.169Z"
---

[project:agent-assist-cr] Decision: Two separate WebSocket connections — one for mic (user/agent), one for system/loopback (remote/customer). No multichannel.

Rationale: Speaker attribution accuracy is non-negotiable. The only way to guarantee correct speaker labels is to keep the streams physically separate at the transport level. Merging into a single multichannel connection risks misattribution, which is not allowed. The dual-stream capture architecture already provides clean source separation — the WebSocket model must preserve that.

Each connection independently tagged, independently reconnectable. Matches the existing DualStreamCapture dual-thread model.