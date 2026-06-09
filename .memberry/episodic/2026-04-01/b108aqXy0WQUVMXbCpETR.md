---
id: b108aqXy0WQUVMXbCpETR
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Optimization roadmap created — 15 prioritized items across 5 key features
outcome: approved
created_at: "2026-04-01T17:22:38.608Z"
---

[project:agent-assist-cr] Created optimization roadmap at docs/optimization-roadmap.md covering 5 key features with 15 prioritized optimization opportunities.

Top 5 priorities:
1. Activate streaming Phase 2 (config flip, very high impact, low effort)
2. Pre-load universal probing questions immediately on session start (high impact, low effort)
3. Feed classification from analysis pipeline TO SOP engine to eliminate pricing tier mismatch (very high impact, medium effort)
4. Build diverse test suite with 5-10 ground truth transcripts across trades/scenarios (very high impact, medium effort)
5. Per-stage model assignment — gpt-5.4 for Stage 2 only, cheaper models for Stages 1+3 (high impact, low effort)

Key insights from experiments that drove recommendations:
- SOP engine independently re-classifying membership causes pricing mismatch — solved by passing classification results to SOP
- 28 unnecessary context updates per session from no change detection — hash/diff before re-render
- Stage 2 requires gpt-5.4 for 100% reliability but Stages 1+3 work with nano — per-stage model config saves cost
- Probing questions don't load until classification is confident — pre-loading universals catches early answers
- DeepGram streaming doesn't support entity detection — regex-based extractor as provider-agnostic replacement