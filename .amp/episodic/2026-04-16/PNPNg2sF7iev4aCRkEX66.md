---
id: PNPNg2sF7iev4aCRkEX66
session_id: session-20260416-000000
agent_id: mcp
task: [project:agent-assist-cr] Task 3: Tighten ESCALATION criterion in Stage 2 analyzer prompt
outcome: approved
created_at: "2026-04-16T21:45:46.297Z"
---

[project:agent-assist-cr] Tightened the ESCALATION bullet in _ANALYSIS_PROMPT in sop_chat.py. The old wording "call needs to be escalated per escalationContacts" had no qualifying criterion, causing ESCALATION to surface on routine AC calls where the customer expressed urgency or frustration. The new wording requires BOTH (a) customer clearly upset AND (b) explicit supervisor/manager request. Added examples on both sides of the line. Ruff clean, 550 tests pass. Commit f21f6b7 on feat/extraction-sop-slicing-hardening.