---
id: 8488nBDDUytl9a5QwOKCh
session_id: session-20260416-task11
agent_id: mcp
task: [project:agent-assist-cr] Task 11 — Add must_book_reason to CallContext
outcome: approved
created_at: "2026-04-16T20:38:26.413Z"
---

[project:agent-assist-cr] Added must_book_reason: str = "" field to CallContext immediately after must_book_rule. Also updated EXPECTED_KEYS frozenset in the wire test file to include the new key — required because the same frozenset is used in three API-level tests that assert exact key equality. Both new unit tests pass; full suite 1035 passed. Commit d182d3b on feat/extraction-sop-slicing-hardening.