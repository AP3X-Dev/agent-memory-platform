---
id: Vwm0juokrn2nAc__Xu5K0
session_id: session-20260514-workspace06
agent_id: mcp
task: [project:oni-grid] workspace optimizer session 6: agent role allocation + capacity model
outcome: approved
created_at: "2026-05-14T18:11:15.827Z"
---

[project:oni-grid] Workspace loop session 6 (commit 53c1ef6). Item #6: agent pool capacity model. CRITICAL convention: the optimizer item lists `AgentRole` among types to model, but a pervasive `AgentRole` already exists from intelligent-orchestrator-v1 — redefining it would break the codebase. Per "build alongside", introduced a NEW distinct `OperationsRole` taxonomy (planner/architect/host-ops/reviewer/qa/merger-archivist); existing AgentRole untouched. New types: OperationsRole, PoolSlotKind (coordinator/operations/worker), AgentLease, AgentLeaseStatus (idle/active/released), CapacityMode, RunPhase, AgentPoolSnapshot. New pure src/lib/agentPool.ts: MAX_LIVE_SESSIONS=16, CAPACITY_MODE_PRESETS (4 ADR modes), DEFAULT_CAPACITY_MODE='mvp-coordinated' (small spine; max-capacity is opt-in only), operationsRolesForPhase, summarizePool. KEY semantic: role definitions vs active leases are separate — summarizePool counts ONLY status:'active' leases; idle/released consume zero capacity (the "idle Planner != running worker" guarantee, test-pinned). Coordinator counts as a live session only under modes that run it inside the slots (mvp-coordinated, strict-16). appStore: agentLeases slice + capacityMode + startAgentLease/releaseAgentLease/setCapacityMode. Agent Pool UI deferred. Verification: TS 1748/1748 (+16), lint/tsc clean, cargo 163/163 + clippy clean. A discovered item #4A was added by oversight review to close the Session-4 no-spec dispatch bypass — next up. Then #6A AMP memory-ref contract, then #7 workspace types.