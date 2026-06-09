---
id: uemotw2Timq90Qn6n1d3t
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Implementation plan written and committed — ready for execution
outcome: approved
created_at: "2026-04-01T05:35:37.919Z"
---

[project:oni-code] Implementation plan committed at docs/superpowers/plans/2026-03-31-oni-core-primitives.md (commit ce5074d).

PLAN STRUCTURE: 12 tasks, 39 steps total, TDD approach (write test → verify fail → implement → verify pass → commit).

TASK SUMMARY:
- Task 1-2: Tool parallel batching (tests + implementation in harness/loop/tools.ts)
- Task 3: LSP types (types.ts additions)
- Task 4-5: LSP client request methods (tests + 5 methods on LSPClient)
- Task 6: LSP manager pass-through methods
- Task 7: Background agent config changes (messageQueue in AgentLoopConfig + loop drain)
- Task 8-9: Background agent handles (tests + spawnAgent/AgentHandle implementation)
- Task 10-11: Memory extraction (tests + MemoryExtractor with extractFromSummary + consolidate)
- Task 12: Final verification (full test suite + typecheck)

ALL WORK TARGETS: C:\Users\Guerr\Desktop\oni-core-cerebro

KEY DESIGN NOTE: finalizeMemory() changes from sync to async in Task 11. Backwards compatible — callers use fire-and-forget pattern.

READY FOR: subagent-driven-development or executing-plans skill to begin implementation.