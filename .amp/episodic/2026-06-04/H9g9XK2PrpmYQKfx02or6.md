---
id: H9g9XK2PrpmYQKfx02or6
session_id: session-20260603-audit
agent_id: mcp
task: Implement the "Accuracy + cheap wins" batch from the platform audit: ship the confirmed accuracy fixes plus low-risk latency/cost/robustness wins as logical commits on main.
outcome: approved
created_at: "2026-06-04T06:55:29.280Z"
---

Shipped 12 commits on main (no push), each with tests + full local CI gate (ruff + mypy --strict + pytest). Final state: ruff clean, mypy clean (145 files), 2188 pytest passing (lone failure tests/test_import_speed.py is Windows subprocess jitter under full-suite load — passes 3/3 in isolation).

ACCURACY (#1 priority):
- pipeline_applicator: stopped stamping flat 0.9; now propagates the Stage-2 fact-checker's confidence for unverified matches below the 0.7 surface gate (verified/unscored keep 0.9). must_book_eligible/is_emergency re-derived from the current match each tick (gated on a real classification) instead of latch-true.
- extraction_pipeline: Stage-2 lock now also breaks on a call-type pivot (cancellation/reschedule/manager/safety) the cached result doesn't reflect; per-job pivot_handled set bounds it to one re-run per pivot.
- streaming_coordinator.apply_streaming_signals now gated on RECORDING/IDLE so a late Deepgram on_final can't clobber finalized form state during/after drain.
- Unified must-book grounding: extracted true_no_cool/true_no_heat/only_cooling_system/only_heating_system/requires_only_system/positive_leak into util/must_book_grounding.py, imported by BOTH call_context_resolver (panel) and sop_deterministic_gates (alert gate). USER DECISION: "still running" does NOT suppress no-cool (an AC running but blowing warm is still no-cool); "ac is out"/"air conditioner is out" recognised on both paths. Test pins both modules reference identical objects (can't drift). See [[project_must_book_grounding_duplication]].

LATENCY/COST:
- Added openai prompt-cache keys to Stage 3 matcher+filter (static) and the SOP analyzer (digest of prefix before ## TRANSCRIPT, like Stage 2).
- FilesystemSopSource.get_text now memoises successful reads (invalidated by reload/invalidate); was re-globbing+reading the SOP file every ~1s poll.
- Threaded session_id through ProbingFilter.filter so stage3_filter LLM cost is recorded (was hardcoded "" -> invisible in /costs).

ROBUSTNESS:
- python-backend.js: _resetRespawnState() resets the respawn counter + clears the pending timer on deliberate (re)start — fixes "won't recover from a later crash" and "double-spawn on port 8742 during backoff".
- auth.js exchangeCode/refreshAccessToken + main.js pushAuthTokenToBackend now have 10s axios timeouts (were unbounded on the no-work-loss auth path).
- sop-panel.js "Show more" chat toggle moved from inline onclick (dead under CSP) to addEventListener.
- OpenAIJsonRunner/VisionRunner now raise on finish_reason=='length' (truncated-but-valid JSON was silently dropping notes/gap_fills) via a shared _decode_json_response.
- routes/sessions.py /assist/reset logs a WARNING with evicted counts (destructive dev-only endpoint, not renderer-wired).

DEFERRED per user scope ("pause before larger/riskier"): per-stage model assignment (gpt-5.4 for Stage 2 + cheaper for 1/3), Playwright E2E Phase 1, and the settings.json master-AI-key plaintext-persistence security refactor.