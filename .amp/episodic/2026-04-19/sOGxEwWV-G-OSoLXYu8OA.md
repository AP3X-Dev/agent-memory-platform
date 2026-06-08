---
id: sOGxEwWV-G-OSoLXYu8OA
session_id: session-20260418-cr-punchlist
agent_id: mcp
task: [project:agent-assist-cr] Capture SessionManager collaborator architecture after split
outcome: approved
created_at: "2026-04-19T02:52:02.235Z"
---

[project:agent-assist-cr] Post-refactor module layout under src/engine/services/:

- session_manager.py (807 lines) — core registry + lifecycle (create/stop/evict/get_session, active/completed_session_ids), form-review cache, public diagnostics, composition root for collaborators. Holds ALL per-session dicts under self._lock: _sessions, _pipelines, _stream_clients, _captures, _cadence_timers, _incremental_transcripts, _fast_match_states, _active_drains, _form_review_results. Collaborators instantiated in ctor: self._streaming = StreamingCoordinator(self), self._eviction_scheduler = EvictionScheduler(). Private methods on SessionManager (_wire_streaming, _tick_pipeline, _apply_streaming_signals, etc.) are kept as thin delegate shims that call self._streaming.X — tests reach into these private names so the shims preserve the existing test seam.

- streaming_coordinator.py (710 lines) — StreamingCoordinator class holds a back-reference self._manager. DG wire-up in wire_streaming(session) including FR-11 atomic rollback via manager._drop_session_registries_locked on capture-start failure. Cadence-tick callbacks: tick_sop_feed + tick_notes + tick_pipeline fire on every cadence tick. Pipeline path: tick_pipeline -> run_pipeline_and_apply (async) -> applicator -> sync_fast_match_for_session + catchup_fast_match_for_session. Streaming-signal path: apply_streaming_signals fires on on_final callback on DG event thread. All per-session state accessed via self._manager._X — coupling is explicit and documented.

- streaming_merge.py (78 lines) — pure helpers merge_entities_low_conf(state, entities, source) and merge_fast_match(state, hits, source). Write to AssistState under store.locked_update. No back-reference, no state.

- session_archive.py (130 lines) — pure serializers: build_archive_payload, session_to_archive_dict, segment_to_json, form_review_to_json, and write_archive(session, assist_snapshot, form_review_result, *, data_dir). write_archive is the only side-effecting function. session_manager._archive_session is now a thin wrapper that calls write_archive with self._config.data_dir.

- eviction_scheduler.py (89 lines) — owns a dict[sid, threading.Timer] under its own lock. API: schedule(sid, delay, *, on_fire), pop(sid) (returns timer for external cancel — preserves "cancel outside lock" pattern), cancel_all(), has_pending(sid), count(). SessionManager delegates has_pending_eviction and pending_eviction_count to it. schedule_eviction on manager checks session_id exists then calls scheduler.schedule with on_fire=lambda: self.evict_session(sid).

Module-level re-exports at bottom of session_manager.py preserve historic underscore names (_build_archive_payload, _form_review_to_json, _segment_to_json, _session_to_archive_dict, _merge_entities_low_conf, _merge_fast_match) for test files that import them directly.

Thread-safety model: SessionManager._lock protects per-session registries. EvictionScheduler._lock protects its timer dict (independent). StreamingCoordinator uses manager._lock for all cross-registry mutations. Per-session locking is Session.transcript_lock's responsibility.