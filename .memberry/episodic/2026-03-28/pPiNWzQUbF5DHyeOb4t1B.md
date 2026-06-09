---
id: pPiNWzQUbF5DHyeOb4t1B
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Classification hysteresis (5a)
outcome: approved
created_at: "2026-03-28T09:10:40.995Z"
---

[project:cic2] Ported CIC1's _apply_hysteresis/_is_stable from orchestrator.py. Created reusable ClassificationHysteresis class in runtime/assist/hysteresis.py. Logic: maintains a sliding window of recent classifications (last 3). A new value only replaces the current one when the last 2 entries agree and differ from current — prevents flip-flopping. Integrated into TradeClassifier.classify() by reading current trade from assist_projections before applying hysteresis. 8 tests added covering: first classification, stability, flip-flop blocking, None handling, window bounding.