---
id: Zn9pyCxQgTEYvy_ccIv9e
session_id: scribo-v2-pattern-analyzer-2026-04-09
agent_id: mcp
task: [project:scribo-2] Add pattern analyzer module for auto-suggesting snippets from recurring transcription phrases
outcome: approved
created_at: "2026-04-10T15:17:08.212Z"
---

[project:scribo-2] Created pattern_analyzer module that analyzes recent transcriptions for recurring phrases and suggests potential voice shortcuts (snippets). Key decisions: (1) history::get_entries returns Vec<HistoryEntry> with direct struct field access (.raw, .cleaned), not serde_json::Value. (2) Database wraps Mutex<Connection> and does not implement Clone, so the spawned async task clones AppHandle and calls app.state::<db::Database>() inside the task. (3) Analysis triggers every 100 transcriptions via should_analyze() checking history::get_message_count(). (4) Uses OpenRouter LLM with cleanup_model to identify patterns appearing 3+ times. (5) Runs as a background spawn after sounds::play_dictation_done() in run_pipeline().