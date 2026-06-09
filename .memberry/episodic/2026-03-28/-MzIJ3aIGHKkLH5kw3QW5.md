---
id: -MzIJ3aIGHKkLH5kw3QW5
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Orchestrator chunk counting + N-chunk intervals (4b)
outcome: approved
created_at: "2026-03-28T10:14:56.828Z"
---

[project:cic2] Added _chunk_count to PipelineOrchestrator, incremented on each process_audio_frame() call. Notes projection now gated: runs on first chunk OR when chunk_count % notes_every_n_chunks == 0 (default 6, loaded from settings table at orchestrator init). Also loads analyzer_every_n_chunks and analyzer_enabled from settings for future LLM agent use. Matches CIC1's session_manager._chunk_counts interval logic. Added _load_setting() helper that reads from SQLite settings table with fallback defaults.