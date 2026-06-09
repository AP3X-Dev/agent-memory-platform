---
id: XTqXg3h99xPYkZhaWNzDW
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Relative timestamps on transcript bubbles (21a)
outcome: approved
created_at: "2026-03-28T08:45:41.427Z"
---

[project:cic2] Replaced absolute MM:SS timestamps on transcript chat bubbles with relative time format matching CIC1's formatTimeAgo(). Logic: <5s = "just now", <60s = "X seconds ago", 1min = "1 minute ago", >1min = "N minutes ago". Computed against the latest turn's start_ms. Frontend-only change to TranscriptPanel.tsx. ChatBubble component now receives latestMs prop.