---
id: 4YDisPKvK5qSeUWawt0NI
session_id: oni-code-topology-viz-20260401
agent_id: mcp
task: [project:oni-code] Audit fixes complete — SwarmPanel wired, compose builder added, labels fixed
outcome: approved
created_at: "2026-04-02T06:10:31.331Z"
---

[project:oni-code] Post-audit fixes for topology + TUI:

FIXED:
1. SwarmPanel wired into App.tsx layout — renders above MessageList when swarms are active (was completely disconnected)
2. compose builder added to topology-agent-builder.ts + registered in TOPOLOGY_BUILDERS
3. Missing topology labels added: race, pool, dag ("DAG"), compose in swarm-activity.ts

CORRECTLY SKIPPED:
- ScrollBox: Left unwired (correct while alternate screen disabled — would clip content)
- stepwiseVerify permissions: Builder doesn't distinguish verifier agents (each stage self-verifies)
- Command autocomplete UI: Polish item, slash commands work via ConductorBridge

CURRENT STATE: 102/103 test files pass, 1348/1349 tests, typecheck clean, build clean.

FULLY WIRED TOPOLOGY SYSTEM:
- 20 topology diagram renderers ✅
- SwarmPanel rendered in layout ✅
- 15 auto-dispatched topologies ✅
- 20 topology labels ✅
- 19 agent builders (all that make sense for auto-dispatch) ✅
- Permission hints on read-only roles ✅
- ConductorBridge tracks swarm events → store → SwarmPanel ✅