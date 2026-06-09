---
id: Ftq0Ps9BlBYy4BofF4gm2
session_id: session-20260429-backfill
agent_id: mcp
task: [project:agent-assist-cr] Forensic audit + Electron observability hookup
outcome: approved
created_at: "2026-04-29T12:12:32.001Z"
---

[project:agent-assist-cr] Two observability landings on 2026-04-29.

JSONL audit log of /submit attempts (5d2eafc): every /submit request appends a JSON line to a per-day log file capturing the inbound payload, per-Job submission outcome, and error if any. Format is JSONL (newline-delimited JSON) so logs can be tailed live and parsed line-by-line. Purpose is forensic — answering 'did the agent submit X for call Y' after-the-fact, including failures the user may not have noticed.

Partial-submit failure surfacing to renderer (e9ef4e1): when submit_all reports any Job in a failed state, the renderer is now informed rather than silently treating the call as fully submitted. Honors core principle: surface == act. The renderer must be able to distinguish 'all N Jobs succeeded' from 'M of N succeeded, K failed'. Previously the partial-failure case looked identical to full success at the UI surface.

On-disk Electron logs + path unification + tray bundler (712e59a): consolidated Electron's logs to a single AppData path scheme; tray icon now bundles correctly into the packaged app. Aligns with the 'venv + .env are dev-only; ship a signed Windows installer; AppData paths only' distribution principle.

These three together close the observability gap: the desktop side now writes everything to a known-location log, the backend mirrors submit attempts to a JSONL audit, and the UI honestly surfaces partial failures.