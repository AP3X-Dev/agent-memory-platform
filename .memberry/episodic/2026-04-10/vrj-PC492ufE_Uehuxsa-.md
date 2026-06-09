---
id: vrj-PC492ufE_Uehuxsa-
session_id: scribo2-ptt-20260409
agent_id: mcp
task: [project:scribo-2] Implement push-to-talk hold detection for dictate hotkey
outcome: approved
created_at: "2026-04-10T15:14:13.723Z"
---

[project:scribo-2] Implemented push-to-talk hold detection in lib.rs. Added HotkeyPressTime managed state (Mutex<Option<Instant>>) to track when dictate hotkey is pressed. Restructured the hotkey handler closure: dictate now handles both ShortcutState::Pressed and ShortcutState::Released, while all other hotkeys (raw, capture, fill, region) remain Pressed-only. On Pressed with push_to_talk enabled: records timestamp and starts recording immediately. On Released: checks elapsed time against push_to_talk_threshold (ms from config, default 300). If held long enough, stops recording and runs the pipeline. If short tap, cancels the recording and returns to idle. Wake listener is paused on press and resumed after processing in all code paths. When push_to_talk is disabled, existing tap-toggle behavior via do_toggle_recording is preserved unchanged.