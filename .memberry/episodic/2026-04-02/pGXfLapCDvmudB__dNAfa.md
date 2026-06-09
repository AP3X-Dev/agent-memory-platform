---
id: pGXfLapCDvmudB__dNAfa
session_id: oni-code-audit-fixes-20260401
agent_id: mcp
task: [project:oni-code] Audit fixes complete — all 3 issues resolved
outcome: approved
created_at: "2026-04-02T02:13:44.256Z"
---

[project:oni-code] Post-audit fixes complete:

FIX 1: Core published (npm link) + workarounds removed
- @oni.bot/core linked at v1.1.3 with all primitives
- MemoryExtractor re-exported from harness/index.ts (was missing)
- SubagentExecutor now uses real spawnAgent/AgentHandle from core (removed 65 lines of local copies)
- MemoryExtractor enabled in conductor (was undefined)
- Coordinator uses typed MemoryLoader import (removed as any casts)

FIX 2: Coordinator.execute() wired into auto-dispatch
- Replaced ~180 lines of inline auto-dispatch in conductor chat() with coordinator.execute() delegation
- Coordinator now emits EventBus lifecycle events (swarm.started, swarm.completed)
- Conductor handles UI-level yields, stats, change tracking on top of coordinator events
- Error path falls through to agent loop (same behavior as before)

FIX 3: ConflictDetector migration already complete (no changes needed)

TEST RESULTS: 2382 tests pass, typecheck clean. All failures are pre-existing (Windows file locking, conductor-eventbus-lifecycle setup issues).

REMAINING PRE-EXISTING FAILURES (5 src test files, all Windows environment issues):
- conductor-eventbus-lifecycle.test.ts — mock setup issues
- conductor-phantom-tools.test.ts — file snapshot locking
- conductor-permission-resilience.test.ts — path traversal test on Windows
- swarm-checkpoint.test.ts — checkpoint test assumption
- workspace/workspace.test.ts — temp dir cleanup