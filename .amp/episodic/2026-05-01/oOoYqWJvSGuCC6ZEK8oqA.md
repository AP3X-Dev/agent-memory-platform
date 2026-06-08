---
id: oOoYqWJvSGuCC6ZEK8oqA
session_id: session-20260501-resume
agent_id: mcp
task: [project:agent-assist-cr] Demo prep: drain budget bump + two parked behavior decisions landed, code-side polish scan complete.
outcome: approved
created_at: "2026-05-01T16:56:45.358Z"
---

[project:agent-assist-cr] Three production-readiness changes landed against main on 2026-05-01:

1. Drain budget: drain_timeout_max raised 30s → 75s in src/engine/config.py. Sized for field-observed worst case ~50s (final pipeline sweep + notes-with-retry + reconstructor + form review, sequential) plus ~25s headroom. The drain runs while the agent is filling the form post-call, so the budget isn't a user-visible wait — the form reads live AssistState. If form-review skips persist past 75s, escalate to async-after-drain (Option B): notes/reconstructor/form-review run on a bg thread that writes to AssistState, with submit either blocking on the future or shipping with whatever's there.

2. Submit-in-flight latch: SessionManager.submit_with_latch coalesces concurrent /sessions/{sid}/submit attempts (double-click, Electron retry, auth-refresh path) onto a single concurrent.futures.Future. First caller runs the work; concurrent callers block on the same Future and receive the same SubmitResponse (or the same exception). Cleanup in `finally`. Portal idempotency on submission_id is now the second line of defense, not the first.

3. CallSopState memory bound: cumulative_metadata FIFO-capped at _CUMULATIVE_METADATA_CAP=500 entries. Note: the handoff plan also called for capping accumulated_transcript, but it's already bounded upstream by streaming_coordinator's 12_000-char window before the SOP feed (single write site at sop_registry.py _set_session_transcript, which replaces rather than appends). Adding a redundant cap inside CallSopState would create two sources of truth.

Polish scan: removed three TEMP C3-smoke debug console.log lines from src/electron/renderer/components/sop-panel.js. No openDevTools auto-open, no agent-link/elevenlabs debris. Title-bar reads "CIC Agent Assist" (index.html, login.html). Saved Calls empty state copy reads cleanly. One inconsistency to surface: package.json productName="CIC Assistant" vs HTML title="CIC Agent Assist" — Windows installer/taskbar will show the former, window chrome the latter.

Test posture: 1855 pass + 1 skipped + 1 deselected (pre-existing test_import_speed flake), up from 1848 baseline (+5 latch tests, +2 metadata-cap tests). ruff + mypy --strict on src/engine/ green.

Outstanding for the demo: ScrubFilter PII strategy decision (recommended option C: accept current + runbook line, no code changes), real resources/icon.ico (placeholder today), C: drive cleanup (8.5 GB free; needs ~30 GB for NSIS + PyInstaller), then NSIS build.