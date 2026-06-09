---
id: OUG6zYSqb5cFmn8P4QMeC
session_id: oni-code-custom-ink-20260402
agent_id: mcp
task: [project:oni-code] Complete analysis of Claude Code's custom Ink rendering system — blueprint for ONI's implementation
outcome: approved
created_at: "2026-04-02T07:51:50.118Z"
---

[project:oni-code] DEEP ANALYSIS of Claude Code's custom Ink fork complete. This is NOT stock Ink — it's a ground-up rebuild (~96 files, 800KB).

ARCHITECTURE SUMMARY:
Claude Code replaced stock Ink's rendering pipeline with a custom system that uses:
1. Double-buffered screen (frontFrame/backFrame with cell-level Int32Array packing)
2. Damage-based incremental rendering (only changed cells get patches)
3. Blit optimization (unchanged subtrees copied O(1) from prevScreen)
4. DECSTBM hardware scroll (terminal scrolls rows, not app rewriting them)
5. BSU/ESU synchronized output (DEC 2026 for atomic frame swap)
6. Style/Char/Hyperlink pools with interning (zero allocation steady-state)
7. Proportional scroll drain (multi-frame smooth animation)
8. prevFrameContaminated flag for full-damage after resize/selection

KEY FILES (by importance):
- ink/ink.tsx (246K) — Core instance, frame loop, resize, selection
- ink/render-node-to-output.ts (62K) — THE render engine (tree walk + damage + blit)
- ink/screen.ts (49K) — Cell grid with Int32Array packing + 3 pools
- ink/log-update.ts (27K) — Screen diff → patch stream
- ink/output.ts (26K) — Operation queue (write/blit/clear/clip)
- ink/terminal.ts (8K) — stdout writer with BSU/ESU
- ink/components/ScrollBox.tsx (32K) — Virtualized scroll with DECSTBM hints
- ink/components/App.tsx (97K) — Event loop (input, mouse, selection)
- ink/reconciler.ts (15K) — React fiber reconciler
- ink/termio/ (9 files, ~64K) — ANSI/DEC/OSC/SGR escape sequences

RESIZE SOLUTION (the specific problem we had):
1. handleResize fires synchronously (NOT debounced)
2. resetFramesForAltScreen() seeds BLANK frames (not 0x0)
3. prevFrameContaminated = true → disables blit, forces full repaint
4. needsEraseBeforePaint = true → defers ERASE into BSU/ESU atomic block
5. onRender: BSU + ERASE + ALL_PATCHES + ESU → single stdout.write()
6. Result: old content visible until new frame atomically replaces it

WHAT ONI NEEDS TO BUILD (phased):
Phase 1: Screen buffer (cell grid + pools) + DOM nodes (Yoga integration) + React reconciler
Phase 2: Render engine (tree walk + damage tracking + blit) + Output queue + LogUpdate diff
Phase 3: Terminal I/O (BSU/ESU, DEC modes, capability detection) + escape sequence builders
Phase 4: Custom components (Box, Text, ScrollBox with DECSTBM) + Event dispatch
Phase 5: Optimization (blit caching, charCache, hardware scroll, proportional drain)

THIS IS A MAJOR UNDERTAKING — 800KB of custom rendering code. But it's what makes Claude Code's TUI work without resize duplication, with smooth scrolling, with text selection, and with 60fps animation.