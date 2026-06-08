---
id: suihz-aWS6WCVt1UiIg84
session_id: scribo-v2-wake-detector-2026-04-09
agent_id: mcp
task: [project:scribo-2] Implement WakeDetector ONNX inference pipeline for wake word detection
outcome: approved
created_at: "2026-04-09T19:03:25.716Z"
---

[project:scribo-2] Created src-tauri/src/wake.rs with WakeDetector struct that chains 3 ONNX models: melspectrogram.onnx (raw audio -> mel frames), embedding_model.onnx (mel frames -> 96-dim embeddings), and hey_scribo.onnx (16 embeddings -> probability score). Key implementation details: ort 2.0.0-rc.12 requires ndarray 0.17 (upgraded from 0.16 to match ort's dependency). The ort::inputs! macro with named args returns Vec not Result, so no map_err needed. Tensor::from_array(owned_ndarray) is the correct way to create tensors. try_extract_tensor returns (&Shape, &[T]) tuple, not an ndarray view. The predict method accepts i16 audio chunks, maintains a ring buffer of 12800 audio samples and 16 embeddings, returns Option<f32> score (None during warmup). Resets every 750 chunks to prevent drift.