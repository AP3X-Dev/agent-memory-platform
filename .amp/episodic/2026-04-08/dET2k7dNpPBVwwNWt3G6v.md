---
id: dET2k7dNpPBVwwNWt3G6v
session_id: task7-session-manager-wiring-2026-04-08
agent_id: mcp
task: Wire form review into SessionManager drain sequence — Task 7
outcome: approved
created_at: "2026-04-08T21:56:56.540Z"
---

[project:agent-assist-cr] Task 7 complete. Added _run_form_review method to SessionManager and wired it into DrainCoordinator construction in stop_session. The method grabs timeline + sys_stream under transcript_lock, formats conversation_text and customer_text using the already-imported format_conversation/format_source_stream, gets the live_state via _get_assist_state (mutable, not a copy), serializes with serialize_form_state, runs review_form in a new asyncio loop, then applies the result via apply_form_review directly to live state so gap fills and flags appear immediately in UI polling. run_form_review is placed between run_final_sop and run_reconstruction in the DrainCoordinator constructor. All 14 tests passed (test_drain_coordinator.py + test_session_streaming.py). Committed as feat: wire form review into drain sequence via SessionManager.