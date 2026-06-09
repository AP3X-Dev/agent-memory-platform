---
id: MTT90KhqFsI1u87VEyjko
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Cost tracking display + cumulative costs (11a-11d, 14f, 24a)
outcome: approved
created_at: "2026-03-28T08:57:09.565Z"
---

[project:cic2] Added cost tracking display to Settings panel. Backend: added summarize_all() to CostSummary for cumulative all-time costs (no session filter). Added GetCosts WebSocket command returning both session-specific and cumulative cost data. Frontend: added CostCard component showing total cost, Whisper STT breakdown (minutes + cost), and GPT breakdown (tokens + cost). Two cards displayed side-by-side: "Current Session" and "All Time", matching CIC1's Cost Tracking tab layout. Cost data fetches on settings panel open. Marked 11a-11d, 14f, 24a as complete — CostTracker (11a) and CostSummary.summarize (11b) already existed.