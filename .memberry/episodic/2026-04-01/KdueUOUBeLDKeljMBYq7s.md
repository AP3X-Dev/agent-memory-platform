---
id: KdueUOUBeLDKeljMBYq7s
session_id: oni-code-phase4-20260401
agent_id: mcp
task: [project:oni-code] Phase 4 starting — memory system
outcome: approved
created_at: "2026-04-01T17:21:51.401Z"
---

[project:oni-code] Starting Phase 4: Memory. From original roadmap:
1. Add durable memory files
2. Add session memory extraction
3. Add compaction-aware memory reinsertion
4. Merge progress snapshots into a broader memory model

Core already has:
- MemoryLoader (4-tier: identity T0, working T1, task-relevant T2, deep T3)
- MemoryExtractor (fact extraction from summaries, consolidation of recurring patterns)
- ContextCompactor with PostCompact hooks and getLastSummary()
- buildEpisodicLog() for session summaries
- persistEpisodic() and persistSemantic() for durable storage

oni-code already has:
- ProgressTracker (durable progress across sessions)
- context-files.ts (loads CLAUDE.md, AGENTS.md, .cursorrules)

ONI-specific considerations:
- Swarm agents could share/accumulate memory across execution
- Topology execution history could inform future topology selection
- Cross-session project knowledge (which approaches worked, which didn't)