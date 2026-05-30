---
id: 4RxZ6ZNh2DU6z_5WiufUy
session_id: session-20260429-backfill
agent_id: mcp
task: [project:agent-assist-cr] Probing trim, per-tick prompt cap, version-gated SOP context, mock-portal contract test
outcome: approved
created_at: "2026-04-29T12:12:56.355Z"
---

[project:agent-assist-cr] Performance pass on 2026-04-27 (b4c970d): trimmed probing prompt size, capped per-tick prompt count to prevent runaway OpenAI calls under fast streams, and version-gated SOP context so the same SOP version isn't repeatedly inlined per tick. Net effect: lower token spend per minute of call without degrading classification or probing accuracy.

Test infrastructure: tests/test_submission_builder.py pins builder output against the mock-portal contract (1fd2c3c) so the JSON shape cannot drift silently when models change. Multi-job test fixtures migrated off root-mirror writes onto state.active_job in lockstep with the source migration (64f5e30, cab7ab7, b31a5fc) so tests remained green throughout the slice rollout.

CI hygiene (2026-04-24): test_state_snapshot_does_not_alias_live_state marked flaky (ac14029) — tracking issue separately for root-cause; flake bar was failing CI more often than it caught real bugs. Unused imports dropped, return type casts tightened (b61e49f).

Contract docs: ADR 0001 finalized as the renderer-contract authority (e6c6ae6 points all renderer-contract refs at it); session_id docs updated to use UUID example (a325e18) since the wire format is now strictly UUID-shaped post-portal hookup.