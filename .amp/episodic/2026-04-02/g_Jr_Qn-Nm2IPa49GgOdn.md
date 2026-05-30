---
id: g_Jr_Qn-Nm2IPa49GgOdn
session_id: oni-code-tui-20260401
agent_id: mcp
task: [project:oni-code] TUI Sub-Phase A COMPLETE — foundation layer with ONI branding
outcome: approved
created_at: "2026-04-02T04:14:32.344Z"
---

[project:oni-code] TUI Sub-Phase A COMPLETE. Foundation layer built and wired.

COMMITS (6 implementation):
- e02c16e feat(tui): ONI brand theme system with dark/light, SYMBOLS, ThemeProvider
- a116539 feat(tui): add UIStore with useSyncExternalStore pattern
- 68fc961 feat(tui): add ScrollBox with keyboard navigation and auto-scroll
- d598ee6 feat(tui): add FullscreenLayout with alternate screen and slot composition
- 6b37f9a feat(tui): add HeaderBar, SpinnerBar, FooterHints, MessageList, PermissionOverlay, ConductorBridge
- 971f5b2 feat(tui): rewrite App.tsx as thin shell with providers + layout

NEW FILES (9):
- src/ui/store.ts (UIStore with useSyncExternalStore)
- src/ui/FullscreenLayout.tsx (alternate screen + slot composition)
- src/ui/ScrollBox.tsx (scrollable container with keyboard nav)
- src/ui/ConductorBridge.tsx (conductor events → store, headless)
- src/ui/HeaderBar.tsx (👹 ONI heavy-border header)
- src/ui/SpinnerBar.tsx (state-driven colored spinner)
- src/ui/FooterHints.tsx (model, scroll, command hints)
- src/ui/MessageList.tsx (store-driven, replaces OutputPane)
- src/ui/PermissionOverlay.tsx (gold-bordered permission prompt)

REWRITTEN FILES:
- src/ui/theme.ts — ONITheme interface, oniDark/oniLight, SYMBOLS (with 👹), BOX (standard/heavy/rounded), ThemeProvider
- src/ui/App.tsx — 589 lines → 100 lines thin shell

RESULTS: 97/98 test files pass (1 pre-existing), 1234/1235 tests, typecheck clean, build clean.

WHAT'S NOW TRUE:
- Fullscreen alternate screen mode (clean terminal, restored on exit)
- ONI brand identity: 👹, state-driven semantic colors, heavy header, gold permission overlay
- Observable store with selectors (no prop drilling)
- ScrollBox with keyboard navigation (PgUp/PgDn, Home/End)
- SpinnerBar color reflects agent state (green=running, purple=tool, gold=permission)
- App.tsx is 100 lines of pure composition

NEXT: Sub-Phase B (markdown + syntax highlighting + richer message components) and Sub-Phase C (advanced input + keybindings + virtual scrolling)