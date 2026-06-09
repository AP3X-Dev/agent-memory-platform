---
id: Nzz1FawCKGGFqZu27Kd1S
session_id: smart-drain-task2-2026-04-07
agent_id: mcp
task: Add drain timeout config values to config.py (Task 2 of Smart Drain feature)
outcome: approved
created_at: "2026-04-07T23:41:38.639Z"
---

[project:agent-assist-cr] Added two plain dataclass fields to AppConfig in src/engine/config.py: drain_timeout_stt (10.0s, max wait for DeepGram flush) and drain_timeout_max (30.0s, total drain safety net including final sweep). These are internal engine config with no UI or settings integration. Placed after the streaming_primary field in the Streaming pipeline section. Committed as "feat: add drain timeout config values".