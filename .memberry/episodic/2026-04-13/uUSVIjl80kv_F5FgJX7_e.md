---
id: uUSVIjl80kv_F5FgJX7_e
session_id: session-20260412-s12b-resume
agent_id: mcp
task: [project:oni-code] Resuming parity program — close S12b (worktree + crash-resume + auto-background) which was branched-incomplete from prior session.
outcome: approved
created_at: "2026-04-13T05:45:06.468Z"
---

[project:oni-code] S12b closed and merged to umbrella feat/coding-agent-parity-v0.2 at 5330b78. Advisor log 4c5fdef. Slice branch feat/parity-v0.2-s12b deleted. Final suite: 1035 pass / 1 skip / 1 accepted-flake (S04 Windows tmpdir EBUSY — pre-existing per S08 Decision 12). Resumption work: (1) fixed test-harness deadlock — worktree-mode await+settleNext ordering, added setTimeout before await so the awaited spawn resolves via terminal; (2) under full-suite concurrency the fake-factory's settleNext could fire before the factory's runPromise was constructed (git worktree spawn latency), so added a pendingOutcome buffer so settleNext is order-independent vs. factory invocation (test-only accommodation). Decision logged: worktree mode currently inherits sync-race semantics (blocks on terminal/timeout/auto-bg); if future UX wants non-blocking worktree spawn, flip the early-return branch at runtime.ts:2563 to cover execMode==="worktree" in addition to "async". Phase 5 complete (S12-minimal + S12-extended + S12b all merged). S13 unblocked — has SendMessage + WaitSubagent + ListSubagents(lineage) + PruneSubagent + auto-background + worktree isolation + crash-resume primitives.