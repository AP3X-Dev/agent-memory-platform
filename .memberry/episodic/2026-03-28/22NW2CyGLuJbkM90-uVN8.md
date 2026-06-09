---
id: 22NW2CyGLuJbkM90-uVN8
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Notes generation on each chunk + final (8f, 8g)
outcome: approved
created_at: "2026-03-28T07:53:18.316Z"
---

[project:cic2] Wired FinalSummary into session stop flow. Added build_final() to NotesProjection that wraps FinalSummary.generate() and returns the standard notes projection plus a final_summary dict. Added build_final_notes() to PipelineOrchestrator that gathers context (turns, entities, trade/job, checklist items, alerts) from DB state. SessionPipelineManager.stop_pipeline() now calls build_final_notes() after draining in-flight futures and returns the result. StopSession in main.py broadcasts the final notes_projection via WebSocket. Also fixed frontend notesStore.ts field mismatches: action_items (objects→text strings), cost_summary (total_cost_usd + breakdown → flat fields), and final_summary (dict→summary string). Incremental notes were already working — CIC2 generates on every turn via _process_turn(), which is more granular than CIC1's every-6-chunks. 470 tests pass, TypeScript clean.