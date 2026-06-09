---
id: ZVux-Elpj-JMmleJadLBe
session_id: oni-code-tui-b-20260401
agent_id: mcp
task: [project:oni-code] TUI Sub-Phase B COMPLETE — rich markdown, syntax highlighting, brand-spec messages
outcome: approved
created_at: "2026-04-02T04:32:02.779Z"
---

[project:oni-code] TUI Sub-Phase B COMPLETE.

WHAT WAS BUILT:
- markdown.ts rewritten: 53 lines → 208 lines, 4-phase pipeline
  - Syntax-highlighted code blocks via cli-highlight (language detection, gold label)
  - Blockquotes with │ left bar and italic dim text
  - Pipe-delimited tables with column alignment and bold headers
  - Links: [text](url) → text (url) with accent color
  - Horizontal rules: --- renders as ─ line
  - Code block sentinels prevent inline regex from mangling code content
- MessageBlock.tsx updated to use useTheme() + SYMBOLS throughout
  - User: ❯ in primary green
  - Tool: ◈ in secondary purple, name in gold
  - Error: ✖ in error red
  - Result: ✔ in success green (was previously suppressed!)
  - Diff: theme.diffAdded/diffRemoved
- 14 new markdown tests, all passing
- cli-highlight added as dependency

NOTE: npm install resets @oni.bot/core link — must re-run `npm link @oni.bot/core` after any npm install.

REMAINING TUI WORK:
- Sub-Phase C: Advanced input (multiline, paste, vim/emacs), keybinding system, virtual scrolling