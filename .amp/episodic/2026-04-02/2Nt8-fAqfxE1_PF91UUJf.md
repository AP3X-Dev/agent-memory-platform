---
id: 2Nt8-fAqfxE1_PF91UUJf
session_id: oni-code-tui-20260401
agent_id: mcp
task: [project:oni-code] TUI Sub-Phase A starting — foundation layer design
outcome: approved
created_at: "2026-04-02T02:59:37.837Z"
---

[project:oni-code] TUI upgrade Sub-Phase A: Foundation layer. 4 items:
1. FullscreenLayout — alternate screen, slot system (scrollable/bottom/overlay/modal)
2. ScrollBox — custom scrollable container with keyboard nav
3. Store pattern — lightweight observable store replacing props-based state
4. Theme system — ONI-branded colors with dark/light, ThemeProvider

This is the critical path — without layout and scrolling, content rendering and input improvements don't matter.

Sub-Phase B (content rendering) and C (input/interaction) follow after A is solid.