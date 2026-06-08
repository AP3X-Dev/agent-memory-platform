---
id: BdvRzzJ1PvkzxAfi_z34A
session_id: scribo-2-phase6-completion-20260409
agent_id: mcp
task: [project:scribo-2] Phase 6: Wake word detection implementation
outcome: approved
created_at: "2026-04-09T19:23:19.304Z"
---

[project:scribo-2] Phase 6 complete: Wake word detection ported from Python to Rust. Three ONNX models (melspectrogram, embedding, hey_scribo) run via ort crate with load-dynamic feature (static linking failed due to MSVC C++ STL compatibility - __std_find_last_of_trivial_pos_1 unresolved symbols). Pipeline: raw audio → mel spectrogram → 96-dim embeddings → wake word probability. WakeListener runs continuous cpal audio stream on background thread with state machine (wake listening ↔ recording), silence detection (RMS-based, int16), and audio device watchdog. Integrated with lib.rs via WakeState managed state and std::sync::mpsc channel for WakeEvent dispatch. Hotkey handlers coordinate with wake listener (pause during hotkey recording, resume after). Key technical decisions: ndarray bumped from 0.16 to 0.17 (ort dependency), onnxruntime.dll bundled in models/ dir, silence_threshold default changed to 300.0 to match v1 int16 RMS scale.