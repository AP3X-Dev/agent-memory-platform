---
id: bwF-hjBoUsnHUE_Fpfl3Q
session_id: oni-code-phase2-20260401
agent_id: mcp
task: [project:oni-code] User directive — design with ONI's native swarm/topology strengths in mind
outcome: approved
created_at: "2026-04-01T09:18:40.992Z"
---

[project:oni-code] IMPORTANT USER DIRECTIVE: Don't just copy Claude Code patterns. ONI has unique strengths that Claude Code lacks:

- Swarm topologies (hierarchical, fan-out, pipeline, peer network, map-reduce, debate, critique-refine, race, DAG, pool, compose)
- Supervisor strategies (LLM, rule, round-robin, capability-based routing)
- Handoff primitives with resume/priority
- AgentPool with backpressure and priority scheduling
- RequestReplyBroker for request/response coordination
- PubSub with wildcard topic matching
- Background agent handles (spawnAgent with AgentHandle)

When designing permissions, policies, and conductor decomposition, consider how these interact with multi-agent execution. For example:
- Swarm agents need their own permission scopes (not just inherit from parent)
- Subagent executors should leverage the background agent handles we just built
- Compaction manager should be swarm-aware (multiple agents share context)
- Policy transforms should compose across agent boundaries in a swarm

Always look for opportunities to improve ONI's native capabilities, not just match Claude Code's feature set.