---
id: 9kkeUW3MO_ew-mfdWj_jt
session_id: oni-code-tui-b-20260401
agent_id: mcp
task: [project:oni-code] TUI Sub-Phase B starting — content rendering (markdown, syntax highlighting, richer messages)
outcome: approved
created_at: "2026-04-02T04:22:48.274Z"
---

[project:oni-code] TUI Sub-Phase B: Content Rendering. From the TUI plan:

Items:
1. Rich markdown — tables, blockquotes, proper heading hierarchy, link rendering
2. Syntax highlighting — code blocks with cli-highlight integration
3. Message components — richer tool call display, diff rendering, thinking indicators
4. Spinner/progress — shimmer animation, stalled detection, token counter

Current state of markdown rendering: src/ui/markdown.ts is 53 lines with basic bold/italic/code/headers/lists. No tables, no blockquotes, no syntax highlighting.

Dependencies needed: cli-highlight (wraps highlight.js) for syntax coloring.

NOTE: Alternate screen disabled in Sub-Phase A (stock Ink doesn't fill it). Layout works in normal terminal mode.