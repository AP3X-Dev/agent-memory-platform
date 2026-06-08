---
id: dO6MP4x1mA5JRvRoQAs4h
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Restatement filter for SOP alerts (9g)
outcome: approved
created_at: "2026-03-28T09:36:01.453Z"
---

[project:cic2] Ported CIC1's _filter_restatements() from sop_engine.py to alert_matcher.py. Added _is_restatement() function that checks new alerts against existing same-category alerts using: (1) substring containment in either direction, (2) >70% word overlap (computed as intersection/min). Integrated into AlertMatcher.match_turn() — after exact dedupe_key check, loads existing alert bodies via _get_surfaced_entries() and runs restatement check. Prevents near-duplicate alerts from cluttering the agent's SOP view during long calls. 4 tests added: substring match, word overlap match, different-category exemption, low-overlap pass-through.