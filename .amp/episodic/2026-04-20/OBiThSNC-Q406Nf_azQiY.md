---
id: OBiThSNC-Q406Nf_azQiY
session_id: session-20260419-001044
agent_id: mcp
task: [project:ap3x-solana] T44 Phase D integration tests review: deregister drain gap and portfolio dist stale
outcome: approved
created_at: "2026-04-20T07:11:30.081Z"
---

[project:ap3x-solana] T44 (commit 6831f7b) reviewed. Two flagged findings assessed:

Finding 1 (deregister drain gap): runtime.ts deregister() only awaits a barrier task when onShutdown is defined. If pending onSignal tasks are in flight and onShutdown is not defined, they get dropped when instances.delete() runs. The fix is a 2-line unconditional `await rec.queue.enqueue(() => Promise.resolve())` barrier before the delete. This is a real runtime correctness bug - not just a test issue. Workaround in test (forcing all test strategies to define no-op onShutdown) is documented and functional, but the production contract is broken for strategies without onShutdown. Recommend fix in T44.

Finding 2 (portfolio dist stale): dist/index.d.ts and dist/index.cjs do NOT export FilePortfolioStore. The source index.ts does (added in commit f1a89e5 via the T-last run but `pnpm build` was never run on that commit). The dist is genuinely stale - not structurally broken. CI runs `pnpm build` before `pnpm test` so this would be fixed in CI. The vitest alias workaround in vitest.config.ts is correct and is the right long-term answer for workspace packages (resolve from source in dev).

23 integration tests, 116 total, all pass. Typecheck clean. Lint has 5 pre-existing warnings (no errors) in src/ unit tests - none in new tests/ files. Commit message clean - no AI attribution. Only 6 files changed (exactly as specced: 5 test files + vitest.config.ts). Gate 3 Option B documented and justified.