---
id: z_Kja8fZZyVm5vDFXzv5A
session_id: oni-code-custom-ink-20260402
agent_id: mcp
task: [project:oni-code] Custom Ink SP3 complete, starting SP4: React Reconciler + Ink Instance
outcome: approved
created_at: "2026-04-02T08:37:33.865Z"
---

[project:oni-code] SP3 Render Engine COMPLETE (15 tests, 3 files).

Starting SP4: React Reconciler + Ink Instance. This is where resize handling gets fixed.

SP4 files to build:
- src/ink/reconciler.ts — React fiber reconciler mapping React → DOMNode tree
- src/ink/ink-instance.ts — Core Ink instance: frame loop, resize handler, double buffering, BSU/ESU atomic output, prevFrameContaminated flag

Key mechanisms from Claude Code research:
- reconciler uses react-reconciler package to create/update/remove DOMNode instances
- resetAfterCommit triggers layout + render
- Ink instance manages frontFrame/backFrame swap
- handleResize: synchronous, seeds blank frames, sets contamination flag, defers erase into atomic BSU/ESU block
- onRender: renderer → diff → optimize → writeDiffToTerminal (single stdout.write)
- Frame throttle at ~60fps via throttled microtask