---
id: yJYbzBRAGCO-yHx41G9QA
session_id: oni-code-gap-analysis-20260331
agent_id: mcp
task: [project:oni-code] Gap analysis — cross-referencing roadmap requirements against @oni.bot/core v1.0.1 exports
outcome: approved
created_at: "2026-04-01T05:01:21.288Z"
---

[project:oni-code] Completed gap analysis between oni-code roadmap and @oni.bot/core v1.0.1 actual exports.

FULLY READY IN CORE (no work needed):
- MCP Client (@oni.bot/core/mcp) — full JSON-RPC client, tool discovery, proxy. oni-code just doesn't wire it at runtime.
- Graph execution (StateGraph, ONISkeleton) — Pregel supersteps, checkpointing, fork, streaming.
- Swarm orchestration (SwarmGraph, supervisors) — topologies, handoffs, mailboxes.
- HITL (interrupt(), getUserApproval()) — pause/resume with typed data flow.
- Tool definition (defineTool(), executeTool()) — schema + execution + context injection.
- Event bus (EventBus, PubSub) — lifecycle events, pub/sub with wildcards.
- Checkpointing (MemoryCheckpointer, SqliteCheckpointer) — state time-travel, fork from history.

MISSING OR TOO SHALLOW IN CORE (needs work):
1. Background Agent Handles (blocks Phase 3) — agents are synchronous graph nodes, no background spawn/wait/send/cancel. Need BackgroundAgentTask wrapping agentLoop.
2. Tool Auto-Classification & Parallel Batching (blocks Phase 2) — parallelSafe flag exists on ToolDefinition but harness ignores it. Need orchestration layer for auto-batching reads vs serial mutations. ~50 lines.
3. Memory Extraction Pipeline (blocks Phase 4) — AgentMemoryStore has manual remember/recall but no automatic session extraction, consolidation, or compaction-aware reinsertion. Post-compact hook point exists in ContextCompactor.
4. LSP Depth (blocks Phase 1 item 4) — LSPManager only has publishDiagnostics. Missing: definition, references, documentSymbol, hover, completion. LSPClient has JSON-RPC transport already.

PRODUCT-LEVEL ONLY (no core work):
- Worktree isolation (git-specific)
- Remote session transport (product networking)
- Permission state machine (policy logic)
- Command registry (CLI surface)
- Coordinator mode (prompt + config over existing swarm primitives)

RECOMMENDED BUILD ORDER FOR CORE:
Priority 1: LSP depth (small, unblocks Phase 1)
Priority 2: Tool parallel batching (small, unblocks Phase 2)
Priority 3: Background agent handles (medium, unblocks Phase 3)
Priority 4: Memory extraction pipeline (medium-large, unblocks Phase 4)