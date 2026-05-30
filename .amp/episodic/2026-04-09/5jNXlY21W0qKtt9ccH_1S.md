---
id: 5jNXlY21W0qKtt9ccH_1S
session_id: ap3x-phase1-planning-2026-04-08
agent_id: mcp
task: [project:ap3x-core] Phase 2 implementation plan created for @ap3x/runtime
outcome: approved
created_at: "2026-04-09T05:45:16.981Z"
---

[project:ap3x-core] Wrote Phase 2 plan for @ap3x/runtime. Key discovery: ONI v1.2.0 has NO /processes subpath — the PRP's ProcessManager doesn't exist. Process management for CLIs (claude-code, codex, bash) must be built using Node.js child_process in @ap3x/runtime. ONI provides: StateGraph (graph construction), model adapters (anthropic/openai/ollama/openrouter with .chat({systemPrompt, messages}) → ChatResponse), checkpointers (SqliteCheckpointer), HITL (interrupt). Plan has 8 tasks: scaffold, types, TDD prompt builder (buildSystem), TDD output parser (parseAgentOutput with ASSIGN/APPROVAL_REQUEST/DONE regex), run() router (API via ONI models + CLI via execFile), buildCompanyGraph (ONI StateGraph with circuit-breakers), TDD HeartbeatScheduler (fake timers, budget gate, coalescing, hooks injection), and acceptance verification. 26 new tests planned.