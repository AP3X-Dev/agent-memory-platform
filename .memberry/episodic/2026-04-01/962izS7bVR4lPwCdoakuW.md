---
id: 962izS7bVR4lPwCdoakuW
session_id: oni-code-phase2-20260401
agent_id: mcp
task: [project:oni-code] Phase 2 design — kernel and permissions hardening scoping
outcome: approved
created_at: "2026-04-01T09:16:18.861Z"
---

[project:oni-code] Phase 2 scoping decisions:

DROPPED: Tool auto-classification (item 2) — already done in core via parallelSafe batching.

KEEPING (3 items):
1. Conductor decomposition — extract subagent executor, compaction manager, reduce chat() from 573 lines
2. Richer permission context — persistent rules, path-scoped, per-agent inheritance, audit trail
3. Policy transforms — auto/interactive/plan as composable policies, not flags/agent-switches

KEY FACTS ABOUT CURRENT STATE:
- Conductor: 1,912 lines, 50+ methods, constructor 600 lines, chat() 573 lines
- Permissions: 121 lines, 5-rule cascade, no persistence, no path awareness
- Plan mode: agent switching (not a real mode), enforced by PreToolUse hook + agent tool filter
- Agent registry: clean abstraction, 4 built-in agents (build, plan, explore, compaction)
- Many subsystems already extracted: AgentRegistry, LoopDetector, TaskEvaluator, SessionStats, ChangeTracker, FileSnapshots, MCPBridge
- Hooks engine deeply integrated in conductor constructor (lines 189-668)

WORKING IN: C:\Users\Guerr\Downloads\oni-code