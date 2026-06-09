---
id: lM1Mknh6Sh7NzA2cBgqJV
session_id: session-20260503-121500
agent_id: mcp
task: [project:ap3x-signals] Merge legacy gmgn tracker.db data into ap3x-signals tracker.db (Tier 1+2).
outcome: approved
created_at: "2026-05-03T14:12:01.325Z"
---

[project:ap3x-signals] Merged legacy gmgn data into live tracker.db on 2026-05-03. Imported 4,786 legacy-only alerts + 4,585 alert_features + 1,411 milestones_hit + 73,269 alert_wallets + 73,222 buys + 76 missing wallets + 2,094 alert_chat_posts + 3,038 suppressed_alerts + 355 paper_fills + 108 dex_community_takeovers + 562 dex_token_boosts + 3 market_signal_poll_state. 180 mints overlap (current's row wins). Total alerts 941→5,734. FK integrity clean. Time coverage now continuous 2026-04-24 onward.

Bug encountered: Original merge silently lost all 4,585 alert_features rows because INSERT OR IGNORE swallows NOT NULL violations. The live DB carries 6 NOT NULL DEFAULT 0 boolean columns on alert_features (has_community_takeover, has_active_boost, has_paid_token_profile, has_token_ad, has_trending_bar_ad, token_in_trending_meta) from Python-era migrations. Legacy data has NULLs in has_active_boost (521 rows) and token_in_trending_meta (every row). Recovery used COALESCE(col, 0) on those 6 columns.

LESSON: For data migrations into SQLite tables with NOT NULL DEFAULT, never use INSERT OR IGNORE — it silently swallows constraint violations. Either use plain INSERT (errors are loud) or COALESCE the offending columns explicitly. Always verify post-merge row counts vs expected; rowcount on INSERT OR IGNORE...SELECT is unreliable.

SCHEMA DRIFT FOUND (not yet fixed): src/db/schema.ts ALERT_FEATURE_COLUMN_DEFS declares those 6 boolean columns as plain INTEGER, but the live DB has them as NOT NULL DEFAULT 0. Fresh DBs created from TS schema would diverge from the live shape. Pending user approval to align schema.ts.