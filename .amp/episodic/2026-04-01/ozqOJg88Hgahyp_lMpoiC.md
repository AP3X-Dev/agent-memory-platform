---
id: ozqOJg88Hgahyp_lMpoiC
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Overall design status — all 4 core primitives designed
outcome: approved
created_at: "2026-04-01T05:27:37.041Z"
---

[project:oni-code] All 4 core primitive designs completed and approved. Ready for spec document and implementation planning.

BUILD ORDER:
1. Tool Parallel Batching — ~40 lines in harness/loop/tools.ts (smallest, pattern exists)
2. LSP Depth — ~120 lines across 3 lsp/ files (mechanical wiring)
3. Background Agent Handles — ~100 lines new file + ~15 lines existing (new abstraction, bounded)
4. Memory Extraction Pipeline — ~150 lines new file + ~20 lines existing (most open-ended)

ALL DESIGNS STORED AS SEPARATE AMP EPISODES IN THIS SESSION.

WORKING DIRECTORY: C:\Users\Guerr\Desktop\oni-core-cerebro (core changes)
ONI-CODE DIRECTORY: C:\Users\Guerr\Downloads\oni-code (product layer, after core is done)

NEXT STEP: Write spec document, then invoke writing-plans skill for implementation plan.