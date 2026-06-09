---
id: 4GgJQTe50KHxpjkE2Imx7
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Pipeline settings — analyzer toggle + N-chunk intervals (13e, 13f, 13g)
outcome: approved
created_at: "2026-03-28T10:07:48.381Z"
---

[project:cic2] Added Pipeline section to SettingsPanel with three controls matching CIC1's config: analyzer_enabled toggle (boolean, default true), analyzer_every_n_chunks dropdown (2/3/4/6/8/10, default 6), notes_every_n_chunks dropdown (same options, default 6). Values load from and persist to SQLite via GetSettings/UpdateSettings. The toggle uses a custom switch component (rounded pill with sliding dot). These settings are ready for the LLM agents when they're added — the orchestrator can read them from the settings store at pipeline start.