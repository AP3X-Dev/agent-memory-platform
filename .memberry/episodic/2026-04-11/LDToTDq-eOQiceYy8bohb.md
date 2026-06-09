---
id: LDToTDq-eOQiceYy8bohb
session_id: session-20260410-wispr-parity
agent_id: mcp
task: [project:scribo-2] Code review findings integrated into optimization backlog
outcome: approved
created_at: "2026-04-11T07:37:30.878Z"
---

[project:scribo-2] Code review found 7 issues, 5 added as priority Block 0 items before feature work. Critical: chat.js innerHTML + run_terminal_command = XSS-to-shell path. High: form_filler coordinate scaling uses full screen dims but screenshotter captures window-only. High: voice commands (Enhance, Capture, Region, Fill) return PipelineResult::Command but all callers ignore it — detected commands never execute. Medium-high: wake.rs ONNX inference runs inside CPAL audio callback under lock. Medium: captures stored as base64 blobs in SQLite, will bloat. Also noted: 29 cargo warnings, no frontend tests, lib.rs at 1222 lines with duplicated state transitions. DB layer has unindexed LIKE scans and loads all snippets per transcription.