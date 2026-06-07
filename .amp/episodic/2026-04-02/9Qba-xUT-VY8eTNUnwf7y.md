---
id: 9Qba-xUT-VY8eTNUnwf7y
session_id: oni-code-custom-ink-20260402
agent_id: mcp
task: [project:oni-code] Custom Ink rendering engine COMPLETE — all 5 sub-projects built
outcome: approved
created_at: "2026-04-02T09:12:40.368Z"
---

[project:oni-code] Custom Ink rendering engine COMPLETE across all 5 sub-projects.

FILES BUILT (20 source + 10 test files):
SP1 Terminal I/O (src/ink/termio/): csi.ts, dec.ts, sgr.ts, osc.ts, capabilities.ts, tokenize.ts, index.ts
SP2 Screen + Diff: screen.ts, frame.ts, diff.ts, optimizer.ts
SP3 Render Engine: dom.ts, output.ts, render-engine.ts
SP4 Reconciler + Instance: reconciler.ts, ink-instance.ts
SP5 Components + Events: OniBox.tsx, OniText.tsx, OniScrollBox.tsx, AlternateScreen.tsx, events.ts, components/index.ts, ink/index.ts

TESTS: 60 tests across 10 test files, all passing. 1437 total tests.

ARCHITECTURE:
- Cell grid with Int32Array packing + CharPool/StylePool interning
- Double-buffered frames with damage-based incremental diffing
- Blit optimization (unchanged subtrees O(1))
- BSU/ESU synchronized output for atomic frame writes
- prevFrameContaminated flag for full-damage after resize
- needsEraseBeforePaint defers screen clear into atomic block
- React fiber reconciler mapping to custom DOMNode tree
- 60fps throttled frame loop

CURRENT STATE: Components bridge to stock Ink for now (use require("ink") internally). When we switch the app to render via InkInstance instead of stock Ink's render(), the custom pipeline activates with resize-safe rendering.

NEXT STEP: Integration — replace stock Ink's render() in cli.ts with InkInstance.render(), switch components to use custom reconciler instead of stock Ink bridge.