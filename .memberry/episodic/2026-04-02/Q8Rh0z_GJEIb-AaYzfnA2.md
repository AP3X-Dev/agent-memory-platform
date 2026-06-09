---
id: Q8Rh0z_GJEIb-AaYzfnA2
session_id: oni-code-tui-c-20260401
agent_id: mcp
task: [project:oni-code] TUI Sub-Phase C starting — advanced input, keybindings, virtual scrolling
outcome: approved
created_at: "2026-04-02T04:46:46.504Z"
---

[project:oni-code] TUI Sub-Phase C: Input and Interaction. Final TUI layer.

Items from plan:
1. Advanced input — multi-line editing, paste support, history search
2. Keybinding system — configurable shortcuts, vim/emacs modes
3. Tool-specific permission UIs — Bash command preview, file edit diff preview
4. Virtual scrolling — message windowing for long conversations

Current InputArea: 114 lines, basic useInput hook, no multiline editing, no paste, no line editing (Ctrl+A/E/K/U), no tab completion.

Current ScrollBox: line-based content rendering with computeVisibleWindow. No virtual scrolling (all messages rendered, just sliced for display).

Current PermissionOverlay: generic gold-bordered prompt with y/Y/n. No tool-specific previews.