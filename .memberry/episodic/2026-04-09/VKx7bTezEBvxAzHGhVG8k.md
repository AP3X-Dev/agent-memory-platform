---
id: VKx7bTezEBvxAzHGhVG8k
session_id: scribo2-phase6-task3-20260409
agent_id: mcp
task: [project:scribo-2] Task 3: WakeListener — Audio Stream + State Machine
outcome: approved
created_at: "2026-04-09T19:07:22.670Z"
---

[project:scribo-2] Implemented WakeListener in wake.rs with audio stream management, silence detection, and watchdog thread. Made encode_wav pub(crate) in recorder.rs so wake module can encode captured audio to WAV. WakeListener follows the same thread+Arc+Mutex pattern as RecordingHandle in recorder.rs. The cpal Stream lives inside the spawned audio thread (it's !Send), while the WakeListener struct holds Arc<Mutex<ListenerInner>> and is marked Send+Sync. Audio callback does ONNX inference directly (same as Python v1 approach). State machine: detection mode feeds audio to WakeDetector, on wake word switches to recording mode which accumulates frames and monitors silence via RMS. Silence timeout triggers WAV encoding and WakeEvent::Silence emission. Watchdog thread checks last_callback every 5s and warns if audio stream appears dead. Uses std::sync::mpsc (not tokio) since this runs on std threads.