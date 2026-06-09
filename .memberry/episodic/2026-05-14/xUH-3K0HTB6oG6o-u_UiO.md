---
id: xUH-3K0HTB6oG6o-u_UiO
session_id: session-20260514-optimizer57
agent_id: mcp
task: [project:oni-grid] optimization session 57: D17 — bound agentSessions/agentBlockers store arrays
outcome: approved
created_at: "2026-05-14T13:49:40.970Z"
---

[project:oni-grid] Session 57 (commit efc0c6b) closed D17. Root cause: agentSessions and agentBlockers slices were added to appStore in Sessions 48+, after Item #12's array-bounding pass, so they grew without limit while managedAgentEvents got trimManagedAgentEvents. Key convention: a plain newest-N .slice(-N) — fine for managedAgentEvents because an old event is just history — is WRONG for sessions/blockers, because a still-running AgentSession or an open AgentBlocker is LIVE STATE; dropping it would orphan a managed run or discard an operator decision. So trimAgentSessions / trimAgentBlockers (cap 200 each) evict only TERMINAL sessions (done/failed/cancelled) and NON-OPEN blockers (resolved/declined), oldest first, preserving array order; if every entry is still live the array is returned over the cap. Applied in appStore only on the new-push path (else branches of upsertAgentSession + applyManagedAgentEvent). 8 tests added. Generalizable rule: when adding a new array slice to appStore, decide whether entries are disposable history (blind window OK) or live state (terminal-preserving trim required). State of pass: items 1-30 + D1-D17 all complete except D14's live-validation tail (needs interactive desktop + provider credentials, not loop-runnable). Next: final Mode-B sweep, then likely ready for /finishing-a-development-branch.