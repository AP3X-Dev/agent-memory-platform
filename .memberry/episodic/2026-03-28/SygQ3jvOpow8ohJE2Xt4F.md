---
id: SygQ3jvOpow8ohJE2Xt4F
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Chunk duration + silence threshold in Settings (13a, 13b, 24b)
outcome: approved
created_at: "2026-03-28T08:50:46.789Z"
---

[project:cic2] Added Audio section to SettingsPanel with chunk duration dropdown (5/7/10/15 seconds, matching CIC1's options) and silence threshold slider (0.001-0.05, step 0.001). Values load from and persist to SQLite via existing GetSettings/UpdateSettings WebSocket commands. App.tsx wires new chunkSeconds/silenceThreshold state through to SettingsPanel and sends UpdateSettings on save. Frontend-only change — backend already has generic key-value settings storage. CIC1's Audio tab is now matched.