---
id: -puZEjk-NLYw7nDLocui-
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Design Section 4 — Memory Extraction Pipeline
outcome: approved
created_at: "2026-04-01T05:27:25.982Z"
---

[project:oni-code] Design for Memory Extraction Pipeline — extractor + consolidator.

NEW FILE: src/harness/memory/extractor.ts

MemoryExtractor class:
- constructor(model: ONIModel, loader: MemoryLoader)
- extractFromSummary(sessionId, summary): uses LLM to pull durable facts from compaction summary, persists via loader.persistEpisodic()
- consolidate(): scans episodic/recent/, groups by tag overlap + keyword matching, promotes facts appearing 3+ times across sessions to semantic via loader.persistSemantic()

EXTRACTION FORMAT: Structured facts tagged with categories [decision], [preference], [fact]

WIRING:
- Called from finalizeMemory() in src/harness/loop/memory.ts (session end, not mid-compaction — avoids latency)
- AgentLoopConfig gets memoryExtractor?: MemoryExtractor field
- consolidate() gated by autoConsolidate?: boolean config flag (default false, expensive)

DESIGN CHOICES:
- No embeddings — uses tag overlap + keyword matching (zero-dependency)
- Session end extraction, not PostCompact hook (avoids mid-conversation latency)
- Conservative consolidation threshold (3+ occurrences) — false negatives cheaper than false positives
- buildEpisodicLog() already exists and writes session summaries — extractor adds structured fact extraction on top

CHANGES TO EXISTING FILES:
- src/harness/types.ts: add memoryExtractor field to AgentLoopConfig
- src/harness/loop/memory.ts: call extractor in finalizeMemory()
- src/harness/memory/index.ts: re-export MemoryExtractor

SCOPE: ~150 lines new file, ~20 lines in existing files.