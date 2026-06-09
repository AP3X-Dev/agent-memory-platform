---
id: YMRavIA3umnuijiFm4TlQ
session_id: oni-code-tui-20260401
agent_id: mcp
task: [project:oni-code] TUI deep analysis — Claude Code architecture vs oni-code current state
outcome: approved
created_at: "2026-04-02T02:56:15.387Z"
---

[project:oni-code] Deep TUI analysis complete. Key architectural gaps:

CLAUDE CODE TUI ARCHITECTURE:
- FullscreenLayout with scrollable/bottom/overlay/modal slots
- VirtualMessageList for long conversations (2800+ messages)
- Custom ScrollBox (Ink has no native scrolling)
- Custom store (useSyncExternalStore pattern, not Redux/Zustand)
- Markdown with LRU token cache (500 entries), fast-path regex skip
- Syntax highlighting via cli-highlight (highlight.js)
- 6 theme variants (dark/light × normal/daltonized/ansi), 50+ color fields
- Keybinding system with user config (~/.claude/keybindings.json)
- Tool-specific permission UIs (Bash, FileEdit, WebFetch each have custom UI)
- Shimmer/glimmer spinner with stalled detection (3s → red transition)
- Alternate screen mode (ANSI escape sequences)
- Yoga layout engine for CSS-like flexbox

ONI-CODE CURRENT TUI (src/ui/):
- App.tsx (589 lines) — master state, props-based
- Ink Static for messages (no scrolling, replays on resize)
- Basic markdown (no tables, no syntax highlighting, no blockquotes)
- Single hardcoded dark theme
- InputArea with useInput (no vim, no paste, no completion)
- No virtual scrolling, no viewport management
- No fullscreen/alternate screen
- 12 components total, all basic

CRITICAL GAPS (ordered by impact):
1. ScrollBox/viewport — Ink Static doesn't scroll, messages replay on resize
2. Markdown + syntax highlighting — no code coloring, no tables
3. Fullscreen layout — no alternate screen, no slot system
4. Input system — no vim/emacs, no multiline editing, no paste
5. Theme system — hardcoded colors, no user customization
6. Virtual scrolling — all messages in memory, no windowing
7. Permission UIs — generic prompt, no tool-specific previews