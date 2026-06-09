---
id: 2RTHcvfR-hS-qKKzVlATM
session_id: session-20260503-121500
agent_id: mcp
task: [project:ap3x-signals] Verify alert_features schema parity between legacy gmgn tracker.db and ap3x-signals tracker.db after cutover.
outcome: approved
created_at: "2026-05-03T12:18:45.543Z"
---

[project:ap3x-signals] Confirmed schema parity verification on 2026-05-03: ap3x-signals/tracker.db has alert_features with 79 columns identical to legacy gmgn-wallet-tracker/tracker.db. alerts table is a strict superset (+1 col expected_slippage_pct). milestones_hit identical. Live data confirms it's wired: 911 alerts / 911 alert_features rows in current (1:1), latest write minutes before check; legacy frozen at 4966 alerts since cutover 2026-05-01. Strategy/research scripts that depend on alert_features can now run against the live ap3x-signals DB. Tables not migrated (likely intentional, upstream state, not features inputs): alert_filters, dex_community_takeovers, dex_token_boosts, dex_trending_meta_tokens, market_signal_poll_state, signal_grades, x_spend_log.