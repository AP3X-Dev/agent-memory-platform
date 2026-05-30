---
id: 7pOupUNjgtxG0yyoO2GQ-
session_id: scribo2-phase6-task1-20260409
agent_id: mcp
task: Phase 6 Task 1: Add ONNX models and ort/ndarray dependencies for wake word detection
outcome: approved
created_at: "2026-04-09T18:55:25.653Z"
---

[project:scribo-2] Phase 6 Task 1 complete. Copied 3 ONNX model files into src-tauri/models/: melspectrogram.onnx (1.1MB), embedding_model.onnx (1.3MB), hey_scribo.onnx (202KB). These form the wake word pipeline: mel spectrogram → embedding → classifier. Added ort = "2.0.0-rc.12" and ndarray = "0.16" to src-tauri/Cargo.toml after the image dependency. Added "bundle": { "resources": ["models/*"] } to tauri.conf.json (no prior bundle section existed). cargo check passed clean (19 pre-existing warnings, zero errors). Committed as 0ba778f. Cargo.lock also committed to track resolved dep versions.