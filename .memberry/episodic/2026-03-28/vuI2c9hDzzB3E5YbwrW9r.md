---
id: vuI2c9hDzzB3E5YbwrW9r
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Model selection in Settings (13c, 13d, 24c)
outcome: approved
created_at: "2026-03-28T09:20:34.310Z"
---

[project:cic2] Added Models section to SettingsPanel matching CIC1's Models tab. Whisper model dropdown (currently only whisper-1). GPT model dropdown with two options: gpt-4o-mini ($0.15/$0.60 per 1M tokens) and gpt-4o ($2.50/$10.00 per 1M tokens), with pricing labels matching CIC1 exactly. Values load from GetSettings and persist via UpdateSettings WebSocket commands. Frontend-only change — backend already stores arbitrary settings keys.