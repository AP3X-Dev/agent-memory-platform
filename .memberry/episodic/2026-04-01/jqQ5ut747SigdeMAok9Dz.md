---
id: jqQ5ut747SigdeMAok9Dz
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Design Section 3 — Background Agent Handles
outcome: approved
created_at: "2026-04-01T05:26:54.238Z"
---

[project:oni-code] Design for Background Agent Handles — new primitive in core.

NEW FILE: src/harness/background-agent.ts

TYPES:
- AgentHandle { id, status, result: Promise<string>, send(message), cancel(), onEvent(handler) }
- SpawnAgentOptions { prompt, config: AgentLoopConfig, id? }

HOW IT WORKS:
- spawnAgent() creates AbortController, starts consuming agentLoop() in detached async context, returns AgentHandle immediately
- send() writes to a message queue, drained at safe point in loop (between tool results and next inference)
- cancel() calls abortController.abort(), loop checks signal.aborted at step 3a
- result promise resolves with final content or rejects on error/cancel
- onEvent() subscribes to LoopMessage stream from the running generator

CHANGES TO EXISTING FILES:
- src/harness/loop/index.ts: between steps 3j and 3k, drain optional messageQueue from config
- src/harness/types.ts: add messageQueue?: string[] to AgentLoopConfig

NOT IN SCOPE (product-level, belongs in oni-code):
- Worktree isolation, process/worker isolation, coordinator mode, agent registry

SCOPE: ~100 lines new file, ~15 lines in existing files. Exports from src/harness/index.ts.