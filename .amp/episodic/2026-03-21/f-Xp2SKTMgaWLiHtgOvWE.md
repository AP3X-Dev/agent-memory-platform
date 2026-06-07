---
id: f-Xp2SKTMgaWLiHtgOvWE
session_id: ci-sentinel-cycle-46-20260321
agent_id: mcp
task: CI Sentinel Cycle 46 — build check for oni-core
outcome: approved
created_at: "2026-03-21T14:41:41.576Z"
---

[project:oni-core] CI Sentinel Cycle 46 completed. Build remains BROKEN for the 30th consecutive cycle. `npx tsc --noEmit` exits 2 with identical TS2393 errors: duplicate dispose() at lines 245 and 378 of src/swarm/graph.ts. ESC-013 and BUG-0451 remain open and unresolved. The fixer_summary on BUG-0451 ("Not reproducible") is still incorrect — the issue is confirmed present on main HEAD. No new bugs filed. Tests not run. 10 untracked Hunter-generated test files observed in src/__tests__ — cannot evaluate until build is clean. Human intervention required to remove lines ~239-250 (partial dispose() under `// ---- Disposal ----`) from src/swarm/graph.ts.