---
id: InJBsuvvYS3FMfzVwNagn
session_id: session-20260607-ag3ntic-prpv2
agent_id: mcp
task: Record the AMP→MemBerry rebrand decision for the AG3NTIC PRP v2.
outcome: approved
created_at: "2026-06-07T11:26:43.048Z"
---

AG3NTIC PRP v2 decision: the memory plane formerly called "AMP / Agent Memory Plane" in the AG3NTIC PRP is rebranded to MemBerry (the user's real memory system, github.com/AP3X-Dev/memberry, BUSL-1.1). MemBerry = "Persistent memory for AI agents": Neo4j knowledge graph + Redis, TypeScript/Node, exposes MCP (49 tools, SSE on port 3101, /healthz /readyz, optional Bearer auth), shipped as Docker Compose. It currently runs on the Cerebro server (192.168.0.25). In AG3NTIC it will be packaged as an easy-to-launch containerized service (memberry + neo4j + redis) that the Operator and employees connect to over MCP and/or the control-plane memory API. Rebrand rules in the PRP: component/brand name = "MemBerry"; user-facing UI label stays "Memory"; identifiers amp-api→memberry-api, services/amp→services/memberry, /amp/*→/memberry/*, amp_<ws> collections→memberry_<ws>, amp_enabled→memberry_enabled; memory.* events unchanged. Section 18 reframed from "build a memory service" to "integrate & containerize existing MemBerry". Note: MemBerry uses Neo4j+Redis (not Qdrant) — the v1 Qdrant-for-memory design is superseded; full storage reconciliation flagged as follow-up in §34 (user said keep it light for now).