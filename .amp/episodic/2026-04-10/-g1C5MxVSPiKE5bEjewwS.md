---
id: -g1C5MxVSPiKE5bEjewwS
session_id: scribo-v2-2026-04-09-tone-wiring
agent_id: mcp
task: Wire tone detection from foreground window into voice pipeline
outcome: approved
created_at: "2026-04-10T15:00:13.107Z"
---

[project:scribo-2] Made get_foreground_title() pub(crate) in screenshotter.rs and replaced the placeholder `let tone: Option<String> = None;` in lib.rs run_pipeline() with a live call to screenshotter::get_foreground_title() fed into pipelines::detect_tone(). cargo check passes clean (29 pre-existing warnings, zero errors). Committed as fe19d76.