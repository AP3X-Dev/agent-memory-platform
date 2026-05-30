---
id: VkeOgEyMVh9OzQW_BQj8z
session_id: scribo-v2-phase3-2026-04-09
agent_id: mcp
task: [project:scribo-2] Phase 3 Voice Pipeline — recording, transcription, LLM cleanup, paste
outcome: approved
created_at: "2026-04-09T11:11:35.348Z"
---

[project:scribo-2] Completed Phase 3 Voice Pipeline.

Modules built:
- output.rs: Windows SendInput + clipboard paste (paste_text, undo_paste, send_tab, click_at). Safety blocklist blocks VK_RETURN/VK_BACK/VK_DELETE.
- pipelines.rs: Pure pipeline logic — detect_command() with 7 command types (Scratch, Enhance, Capture, Region, Fill, AddDictionary, SaveSnippet), detect_tone() mapping window titles to formality hints for 7 app categories.
- recorder.rs: Audio capture via cpal (16kHz mono 16-bit). RecordingHandle pattern wraps cpal::Stream on a dedicated thread to solve !Send constraint. WAV export via hound.
- transcriber.rs: Deepgram WebSocket (nova-2) + Groq whisper-large-v3 + OpenAI whisper-1 fallback chain. Unified transcribe() tries configured provider first.
- processor.rs: LLM cleanup via OpenRouter (primary) / Groq (fallback). Full system prompt with filler removal, backtracking, voice commands. Token cap and explosion guard. Intent classification for agent tasks.
- Orchestration in lib.rs: start_recording, stop_and_process, toggle_recording commands. Hotkeys wired to spawn async pipeline. State machine: Idle→Recording→Processing→Done→Idle with event emissions at each stage.

Key design decisions:
- RecordingHandle spawns cpal stream on std::thread (not tokio) since cpal::Stream is !Send
- Done→Idle transition has 1.5s delay for visual feedback
- Raw mode skips LLM cleanup, pastes transcription directly
- 45 total tests pass

Dependencies added: arboard, windows (Win32 APIs), regex, cpal, hound, tokio-tungstenite, reqwest, futures-util, base64, url.

Also during this session: fixed orb geometry overflow (GEOM_SCALE 0.80), added glass overlay for subtle petals, removed rim circle, made panel draggable, changed orb to double-click, reordered tabs (History, Captures, Chat), orb hides when panel opens.

Phases completed: 1 (Foundation), 2 (Storage), 3 (Voice Pipeline).
Remaining: 4 (Frontend Panels), 5 (Vision/Capture), 6 (Advanced).