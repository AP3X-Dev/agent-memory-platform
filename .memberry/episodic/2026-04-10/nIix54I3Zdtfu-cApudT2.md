---
id: nIix54I3Zdtfu-cApudT2
session_id: scribo-v2-2026-04-09-dev-syntax
agent_id: mcp
task: Add developer syntax mode for IDE dictation in Scribo v2
outcome: approved
created_at: "2026-04-10T15:07:11.009Z"
---

[project:scribo-2] Added developer syntax mode (Task 3). Two changes committed in 419a3d6: (1) processor.rs cleanup() — after the keywords context block, added a tone-conditional block that appends "Developer mode active" rules to the system prompt when tone contains "technical" or "commands". Rules cover camelCase conversion, snake/pascal case on request, literal CLI output, punctuation spoken words (dot/slash/dash/underscore), and filename preservation. (2) pipelines.rs detect_tone() — added two new branches before the final else: Jupyter/notebook windows get "technical, use precise terminology", Figma/Sketch windows get "concise design terminology". cargo check passed cleanly. cargo test fails with a pre-existing Windows linker error (LNK1318 PDB file system issue) unrelated to these changes — the base branch also fails cargo test.