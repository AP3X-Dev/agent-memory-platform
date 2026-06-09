---
id: -0Funsdpxfm_T955Swr6E
session_id: oni-code-ink-cutover-20260402
agent_id: mcp
task: [project:oni-code] CRITICAL: Full cutover to custom Ink engine — stop using stock Ink render()
outcome: approved
created_at: "2026-04-02T09:23:43.011Z"
---

[project:oni-code] USER DIRECTIVE: Stop layering on stock Ink. Do the full cutover to the custom rendering engine we built. Claude Code replaced Ink entirely — we must do the same.

THE CUTOVER:
1. cli.ts calls InkInstance.render() instead of stock Ink render()
2. InkInstance manages alt screen, resize, frame loop, BSU/ESU
3. Our reconciler creates DOMNode tree from React components
4. Our render engine walks the tree → screen buffer → diff → patches → single stdout.write()
5. OniBox/OniText/OniScrollBox render through our pipeline, not stock Ink

Stock Ink's render() is completely removed from the rendering path.

WHY PREVIOUS ATTEMPTS FAILED:
- Tried alt screen + stock Ink → stock Ink doesn't know about alt screen, scrolling breaks
- Tried height constraint → Ink's layout doesn't resolve properly
- Tried screen clear on resize → band-aid, doesn't fix root cause
- Every time: fell back to stock Ink because it was "easier"

THE REAL FIX: Use InkInstance as the sole renderer. Period.