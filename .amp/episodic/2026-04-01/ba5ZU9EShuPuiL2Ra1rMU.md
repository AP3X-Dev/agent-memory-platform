---
id: ba5ZU9EShuPuiL2Ra1rMU
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Reconnection strategy decision
created_at: "2026-04-01T05:25:55.664Z"
---

[project:agent-assist-cr] Decision: Auto-reconnect and accept the gap (option A) for initial build. Chunk-based fallback covers any lost audio during reconnection.

Future consideration: When streaming replaces chunk pipeline entirely, reconnection strategy must be revisited. At that point, backfill from a local audio buffer or WAV recording will be necessary since there won't be a parallel pipeline to cover gaps. Design the streaming client with reconnection hooks that can be upgraded later — don't hardcode the "accept the gap" assumption into the architecture.