---
id: 6DSLKV-7xDaGrege1nF4H
session_id: sop-panel-research-session
agent_id: mcp
task: [project:agent-assist-cr] Mapping SOP panel architecture for context-aware optimization
created_at: "2026-03-31T18:43:00.361Z"
---

[project:agent-assist-cr] SOP Panel Architecture — Complete data flow mapped.

Current architecture: Audio chunk → transcription → _sop_feed fires on EVERY chunk with speech → SOPSession.analyze_chunk_full() runs gpt-4o LLM with full accumulated transcript + [LATEST CHUNK] → SOPAnalysis alerts extracted → _filter_restatements deduplication → build_call_context() → context stored in _sop_poll_state with version increment → frontend polls every 2s → re-renders entire Call SOP tab on every context update (causes shimmer).

Key files: sop_engine.py (SOPSession, LLM prompt, analyze_chunk_full, build_call_context), api_server.py (_sop_feed, poll endpoint), sop-panel.js (frontend rendering), main.js (polling loop).

Core problem: LLM runs on every chunk (~7s intervals), context always overwrites, frontend always re-renders → constant shimmer even when nothing meaningful changed. No change detection at any layer.

CallContext already filters by: membership_tier, time_period, active_sections. The filtering logic is sound — the issue is that it re-evaluates unnecessarily.