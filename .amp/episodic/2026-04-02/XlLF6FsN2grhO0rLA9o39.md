---
id: XlLF6FsN2grhO0rLA9o39
session_id: oni-code-custom-ink-20260402
agent_id: mcp
task: [project:oni-code] Custom Ink SP1 complete, starting SP2: Screen Buffer + Diff Engine
outcome: approved
created_at: "2026-04-02T08:17:49.080Z"
---

[project:oni-code] SP1 Terminal I/O Foundation COMPLETE (28 tests, 7 files).

Starting SP2: Screen Buffer + Diff Engine. This is the core that makes resize work.

SP2 files to build:
- src/ink/screen.ts — Cell grid with Int32Array packing, Style/Char pools
- src/ink/frame.ts — Frame type with double buffering, Patch types
- src/ink/diff.ts — Screen diff algorithm (damage-based, cell-level)
- src/ink/optimizer.ts — Patch deduplication/merging

Key concepts from Claude Code research:
- Cells packed as 2 Int32s (charId + packed styleId|hyperlinkId|width)
- CharPool: intern strings → numeric IDs (ASCII fast-path)
- StylePool: intern style stacks → IDs, cache transitions
- Damage rectangle tracking (only diff within changed region)
- prevFrameContaminated flag for full-damage after resize