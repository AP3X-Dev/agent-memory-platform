---
id: 9oGliIgSfWN5R1No6GrOG
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Membership tier detection + mark already-done items (9d, 4a, 4c, 17c, 20d)
outcome: approved
created_at: "2026-03-28T10:01:53.864Z"
---

[project:cic2] Added keyword-based membership tier detection in runtime/sop/membership_detector.py. Adapts CIC1's LLM-extracted tier (from SOP alert metadata) to deterministic keyword matching. Detects member (service agreement, maintenance plan), non-member (not a member, no membership), and commercial (business, office) from transcript text. Priority order: non-member > member > commercial to avoid substring false positives. 6 tests. Also verified and marked 4 items already implemented: 4a (SOP alert matching runs per turn), 4c (notes projection updates every turn), 17c (RebuildChecklist command from TradeSelector already wired), 20d (SOP projection pushed via WebSocket on each turn).