---
id: IxPdQMjYCoNYlMiC9hfJw
session_id: tachi-optloop-2026-04-07
agent_id: mcp
task: [project:tachi] Built optimization loop prompt for Tachi runtime from PRP document
created_at: "2026-04-08T05:38:51.093Z"
---

[project:tachi] Created comprehensive optimization loop for building the Tachi graph runtime from pre-development to v0.2. 

Key findings from audit:
- Tachi has TWO layers: Runtime (zero code exists) and UI (1,309-line JSX prototype with its own 35-item optimizer)
- The PRP describes @tachi/core, @tachi/adapters, @tachi/store, @tachi/scheduler — all TypeScript, zero-dependency
- No git repo, no package.json, no tsconfig, no tests, no build system exist yet
- UI prototype has 5 agents, 7 message types, simulated heartbeats — all hardcoded/mocked

Generated 4 artifacts:
1. `docs/prompts/tachi-runtime-optimizer.md` — 37-item backlog across 8 blocks (Foundation → ProcessRegistry → HarnessGraph → Adapters → SessionStore → Scheduler → Integration → Reliability)
2. `docs/prompts/tachi-runtime-optimizer-log.md` — progress log (0 completed, est. 25-35 sessions)
3. `docs/prompts/tachi-intent-summary.md` — comprehensive intent summary synthesizing PRP + UI optimizer + ONI guidelines
4. `docs/prompts/tachi-runtime-5m-loop.md` — quick execution loop prompt for session-based building

Architecture decisions embedded in optimizer:
- TDD enforced for all runtime items
- Zero external deps in @tachi/core (node builtins only), better-sqlite3 only in @tachi/store
- BashAdapter first (simplest, testable), ClaudeCodeAdapter highest priority per PRP
- Tier-based tick ordering: planner → manager → worker (sequential across tiers, parallel within)
- UI optimizer remains separate — runtime optimizer never touches paperclip-teams-v3.jsx