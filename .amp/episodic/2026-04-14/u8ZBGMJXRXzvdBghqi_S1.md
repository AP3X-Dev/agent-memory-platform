---
id: u8ZBGMJXRXzvdBghqi_S1
session_id: session-20260414-oni-opt-closure
agent_id: mcp
task: [project:oni-code] Close v0.2 optimizer backlog — decisions on remaining 4 deferred items (#19, #12, #14, #15)
outcome: approved
created_at: "2026-04-14T08:03:42.642Z"
---

[project:oni-code] v0.2 optimizer loop closed at session 21 (2026-04-14) with three commits on opt/coding-agent-v0.2-hardening: opt(21) #19 + opt(22) #12 + opt(23) #14/#15.

#19 retention contract — shipped. Chose "status-filtered read + drop": terminal subagent handles move from live _subagents Map into a bounded _completedSubagents log at markTerminal. list/wait/send/prune/abort all union both Maps. Setting subagent.completed_log_size caps size (default 200, 0 disables). Preserves observable contract post-terminal while bounding memory for long-running runtimes that spawn many short-lived subagents between destroy() calls. destroy() clears both Maps. 8 regression tests.

Rejected alternatives: TTL retention window (complex + clock dependency), drop + SessionStore fallback (DB hop per list call).

#12 — shipped. N=10 swarm reliability test with happy-path + mid-flight abort. Exercises #19's eviction invariant at scale. 2 tests.

#14 AgentRuntime service extraction — deferred via ADR 0007. Across 21 optimizer sessions no consumer driver emerged. _internals()/_internalsMut() typed boundary is stable, no correctness bugs, every bounded win landed around it. Original ADR 0006 framed as transitional pending #14; now re-annotated as accepted long-term pattern. Revisit only on concrete driver: new runtime host, cross-process subagent, SDK consumer pain.

#15 SQLite async journal — closed as premature. scripts/bench-session-store.ts measures 3 realistic scenarios: baseline 0.04ms, deep tree 500 entries 1.5ms, wide append 2000 entries 4.8ms. All sub-50ms threshold. Journal already WAL mode. Revisit only when real resume-scan >50ms surfaces.

Principle confirmed: optimizer loop discipline is "fix what hurts, defer what doesn't" — closed 16 bounded items across v0.2; the 2 remaining large/deep items (#14 #15) were not skipped out of cowardice but deliberately gated on driver evidence.

Suite: 1375 pass / 1 skip / 0 fail / typecheck + build + lint clean. Branch 23 commits, not pushed.