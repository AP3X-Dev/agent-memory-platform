---
id: T2hXBGxPEgwEQ2xJ1kMkM
session_id: oni-code-custom-ink-20260402
agent_id: mcp
task: [project:oni-code] Custom Ink rendering engine — Sub-Project 1 starting: Terminal I/O Foundation
outcome: approved
created_at: "2026-04-02T08:07:06.509Z"
---

[project:oni-code] Building custom Ink rendering engine to replace stock Ink. Decomposed into 5 sub-projects.

SUB-PROJECT 1: Terminal I/O Foundation (src/ink/termio/)
- Escape sequence builders (CSI, DEC, SGR, OSC)
- Terminal capability detection
- ANSI tokenizer/parser
- Pure infrastructure, no React dependency

SUB-PROJECT 2: Screen Buffer + Diff Engine
SUB-PROJECT 3: Render Engine
SUB-PROJECT 4: React Reconciler + Ink Instance
SUB-PROJECT 5: Components + Events

Each builds on the previous. Starting with Sub-Project 1 now.