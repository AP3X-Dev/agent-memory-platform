---
id: gW6DM1P8sbdBLEjxl0-Wc
session_id: session-20260410-optv2-s28
agent_id: mcp
task: [project:agent-assist-cr] optimization session 28: lock streaming entity and form review mutations
outcome: approved
created_at: "2026-04-10T23:24:31.454Z"
---

[project:agent-assist-cr] Fixed the highest-severity concurrency bug: AssistState had 3 unprotected mutation paths. Two background threads (streaming entity extraction, post-drain form review) mutated live AssistState without holding _assist_lock, racing with _on_analysis_ready merges and HTTP endpoint reads.

Fix: Changed _assist_lock from Lock to RLock (reentrant, required because _get_assist_state internally acquires the lock). Passed assist_lock to SessionManager. Wrapped both mutation paths under the shared lock. Form review split into snapshot-under-lock → LLM-outside-lock → apply-under-lock to minimize lock hold time.

Convention: All future AssistState mutations from background threads MUST acquire _assist_lock. The lock is now shared between api_server.py (16 acquisition sites) and session_manager.py (2 new sites). RLock allows nested acquisition from _get_assist_state.

4 concurrency regression tests added to test_multi_session.py. 530/530 tests pass.