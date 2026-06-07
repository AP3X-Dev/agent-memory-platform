---
id: y8h1y4byXVfpKATSFU2sR
session_id: session-20260512-008
agent_id: mcp
task: [project:oni-grid] optimization session 8: Item #8 — replace merge simulation with merge_queue backend calls
outcome: approved
created_at: "2026-05-12T12:30:03.510Z"
---

[project:oni-grid] Completed Item #8 (commit a412570). Built real `git_merge` Tauri command + frontend wiring. TS 1408/1408, Rust 36/36.

Architecture decisions:
1. Real git_merge command refuses to run unless HEAD == base_branch. We don't auto-checkout because the operator's git context is sacred — surface the mismatch, let the operator fix it.
2. On conflict: parse `git status --porcelain=v1` for UU/AA/DD/AU/UA/DU/UD markers (column 1+2), then `git merge --abort` so working tree is restored. If abort itself fails, append warning to original error rather than mask.
3. Frontend kept BOTH paths: synchronous `runMergeResolution` (simulation, used by tests + as a fixture) AND async `runMergeResolutionWithBackend(entry, attemptGit)` (real git). The simulation isn't legacy — it's the testing harness for tier-escalation logic without Tauri mocking.
4. Dependency injection: `runMergeResolutionWithBackend` takes `attemptGit: () => Promise<...>` rather than calling mergeClient directly. Trivial vi.fn() mocks; lets future callers substitute strategies (e.g., dry-run via `git merge-tree`).
5. AI-resolve and reimagine tiers stay simulated for now — but the conflict file list they receive is now real git output, not synthetic counts. That was the spec's intent: ground the inputs in reality, defer the AI implementation.

Conventions:
- Windows CRLF gotcha: when reading git-managed text files in Rust tests on Windows, normalize via `.replace("\r\n", "\n")` before assertEq. Git's autocrlf config converts on checkout. Don't disable autocrlf in test setup; normalize on read is more robust.
- Conservative branch ref validator (no leading '-', no '..', no '@{', no control chars) — same ruleset as worktree.rs but duplicated locally so modules stay independent. Acceptable code duplication; the validators are stable.
- Use --no-ff --no-edit flags: keep the merge commit (no fast-forward) for traceability, suppress the editor prompt for non-interactive runs.

Outstanding wiring (NOT scope of this session, candidate follow-ups):
- No UI caller invokes runMergeResolutionWithBackend yet. Hook point will surface during Item #11 (EventTimeline) or Item #20 (MergeQueue component tests).
- enqueue_merge → attemptGitMerge → update_merge_status three-step orchestration not yet assembled in any one caller. Each piece exists; the glue is a small follow-up.

Next: Item #9 — persist activeRun across app restart (will need new src-tauri/src/runs.rs + Tauri command + store rehydration on init).