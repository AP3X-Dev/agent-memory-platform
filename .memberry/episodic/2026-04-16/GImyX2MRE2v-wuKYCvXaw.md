---
id: GImyX2MRE2v-wuKYCvXaw
session_id: session-20260416-task12
agent_id: mcp
task: [project:agent-assist-cr] Task 12: Clock-only after-hours in _apply_clock
outcome: approved
created_at: "2026-04-16T20:47:19.145Z"
---

[project:agent-assist-cr] Removed the analyzer gate from _apply_clock in call_context_resolver.py. Previously required both the clock AND analyzer booking_stage to agree on "after-hours" before setting time_period = BOTH. Now the client's local clock alone drives it: status == "After Hours" → BOTH, anything else → REGULAR. Removed qualifies_after logic entirely. Removed TIME_PERIOD_AFTER_HOURS import (unused after change). One pre-existing test (test_alert_metadata_promotes_time_period_to_both) was updated — it relied on booking_stage metadata promoting time_period when no timezone was present; under the new rule that fallback is gone, time_period defaults to REGULAR when clock is Unknown. Renamed test to test_alert_metadata_tier_overrides_assist_state to reflect what it now actually tests. Two new tests added using fixed UTC-6 offset datetimes (tzdata not installed on Windows so ZoneInfo("America/Denver") is unavailable; fixed offset works because _client_now reuses already-aware datetimes directly). Full suite: 1037 passed. Commit: bbc4cce.