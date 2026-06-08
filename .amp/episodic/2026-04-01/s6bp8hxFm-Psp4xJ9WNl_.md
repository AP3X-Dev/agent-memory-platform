---
id: s6bp8hxFm-Psp4xJ9WNl_
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Refine trigger cadence and frontend display strategy
created_at: "2026-04-01T05:15:20.364Z"
---

[project:agent-assist-cr] Two key decisions refined:

1. TRIGGER CADENCE: Time-based at 15-second intervals is the primary trigger for all downstream LLM work (analysis, notes, SOP). User explicitly rejected utterance_end as a trigger for LLM calls — "I don't want to fire off an LLM call every time somebody takes a pause" — because dual stream means frequent pauses from both speakers, which would flood LLM calls. This is closer to the current chunk-cadence model but at 15s instead of every N 5-second chunks. Utterance_end events are still useful internally for segmenting transcript text, but NOT for triggering LLM pipelines.

2. FRONTEND DISPLAY: Faster backend only. No real-time interim/partial word display. Keep the existing chat bubble UI and 1s polling cycle. Transcripts land in the session store much sooner (~300ms vs ~8s), so polls pick them up faster. The reconstructor agent that post-processes chat bubbles stays intact. No push channel (WebSocket/SSE) to frontend needed. Key quote: "I don't want it to be flickering partial words. We have them showing up as chat bubbles right now, we should try to maintain that as much as possible."