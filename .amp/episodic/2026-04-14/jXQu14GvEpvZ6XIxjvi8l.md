---
id: jXQu14GvEpvZ6XIxjvi8l
session_id: session-20260414-oni-opt-closure
agent_id: mcp
task: [project:oni-code] Record architectural decision: _internals() boundary promoted from transitional to accepted long-term pattern
outcome: approved
created_at: "2026-04-14T08:03:51.756Z"
---

[project:oni-code] Architectural decision (ADR 0007, 2026-04-14): the runtime-internals typed-view pattern (_internals() / _internalsMut() in src/runtime-internals.ts) is now the accepted long-term ops-module boundary for AgentRuntime — not transitional.

Original framing (ADR 0006, 2026-04-13) treated _internals() as a hatch pending backlog #14's five-service decomposition (SubagentService, QueueService, PersistenceBridge, AbortCoordinator, HookBridge). That decomposition is deferred indefinitely because: (a) no consumer driver emerged across 21 optimizer sessions, (b) the typed boundary has no known correctness bugs, (c) all 16 bounded wins landed around the hatch without friction.

Revisit criteria (from ADR 0007): new runtime host that needs subset composition, cross-process subagent orchestration, or SDK consumer needing to mock/replace specific services.

Implication for future refactor work: do not plan multi-session rewrites that assume #14 lands. Treat _internals() as a stable contract. Additions to RuntimeDepsView/RuntimeInternals/RuntimeInternalsMut follow normal internal-refactor review bar.

ADR 0006 re-annotated in-place to reflect this.