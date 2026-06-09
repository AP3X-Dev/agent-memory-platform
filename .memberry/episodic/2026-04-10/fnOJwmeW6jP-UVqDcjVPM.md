---
id: fnOJwmeW6jP-UVqDcjVPM
session_id: session-20260410-optimizer-loop
agent_id: mcp
task: [project:agent-assist-cr] Built continuous optimization loop — 25-item backlog across 5 blocks
outcome: approved
created_at: "2026-04-10T20:37:14.252Z"
---

[project:agent-assist-cr] Built a continuous optimization loop for agent-assist. Audited the codebase with 5 parallel agents (architecture, tests, wiring, code quality, build/frontend). Key findings integrated into a 25-item backlog:

Block 1 (Architectural Correctness, #1-6): ExtractionPipeline is a process singleton with mutable per-call state — concurrent sessions bleed trade locks and facts. SOP processing globally serialized with full-transcript rebuild each tick. Completed sessions never evicted from memory. Polling transfers full state every 1s. Model config/pricing inconsistent across config, API, and cost tracker. Stage 2 wastes tokens on chain-of-thought reasoning field nobody reads.

Block 2 (Pipeline Reliability, #7-10): Extraction pipeline disabled by default. sop_engine.py and sop_normalizer.py have zero test coverage. No multi-session isolation tests.

Block 3 (Roadmap Features, #11-16): SOP change detection, structured clipboard, universal probing preload, retroactive answers, confidence indicators, regex entity extraction.

Block 4 (Code Quality, #17-22): 55 generic exception handlers, dead config/IPC, unbounded memory, event loop leaks, frontend listener leaks, loose dependency pins.

Block 5 (Infrastructure, #23-25): Build scripts, backend respawn, shared test fixtures.

Artifacts: docs/prompts/agent-assist-optimizer.md (execution guide), docs/prompts/agent-assist-optimizer-log.md (restart memory), docs/prompts/agent-assist-intent-summary.md (synthesized intent from 11 planning docs).