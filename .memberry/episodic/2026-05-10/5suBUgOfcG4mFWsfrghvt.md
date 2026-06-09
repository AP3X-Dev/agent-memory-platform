---
id: 5suBUgOfcG4mFWsfrghvt
session_id: session-20260510-130000
agent_id: mcp
task: [project:ap3x-signals] Resume AP3X + PumpFun paper trading engines and dashboard after data-ops cleanup
outcome: approved
created_at: "2026-05-10T20:08:50.234Z"
---

[project:ap3x-signals] On 2026-05-10, completed Phase 3 source cleanup and resumed the AP3X + PumpFun paper trading stack.

Cleanup executed (per docs/data-operations-cleanup-plan-2026-05-07.md and 2026-05-09-source-cleanup-approval-plan.md, with user override on Candidate B):
- Deleted /home/cerebro/projects/pump-data/datasets/pumpfun/raw (~95 MB), .../archive (~10.16 GB), and 8 ap3x-signals/tracker.db.bak-* files (~3.91 GB). raw/ and archive/ recreated empty.
- Truncated 5 normalized JSONL files in pump-data/datasets/pumpfun/normalized to 0 bytes (~463 MB freed): advanced_token_observations, helius_wallet_transfer_observations, holder_snapshots, jupiter_price_observations, pump_swap_candle_observations. All five had verified gzip archives at backups/data-ops/managed-archive/2026-05-08-pumpfun-normalized-child-compaction/.
- Total disk reclaimed: ~14 GB (74G → 60G used on /).
- User reasoning: oversized JSONL files were starving the paper engine of signals; "start fresh" with empty hot files is the deliberate hot-window choice.

Resume executed (the original plan required api-budget gating per source; user said skip the budget concern, so used permissive placeholders):
- Created docs/data-ops/api-budget.local.json with dailyBudget=100000 / budgetRemaining=100000 for ap3x-signals (DexScreener, Telegram) and pumpfun-paper-engine (DexScreener, Jupiter). pumpfun-strategy-loop has no apiSources so no budget entry needed.
- Added AP3X_DATA_OPS_LIVE_RUN_APPROVED=1 to /home/cerebro/projects/ap3x-signals/.env.
- Created systemd drop-ins /etc/systemd/system/{pumpfun-paper-engine,pumpfun-strategy-loop}.service.d/data-ops-approval.conf with the same env var.
- Removed pause-mode.conf drop-ins on pumpfun-paper-engine.{service,timer} (stashed at /home/cerebro/backups/data-ops/pause-mode-stash-20260510-130547Z). The service drop-in had been forcing --monitor-only --record-dexscreener-marks=false; timer drop-in had OnUnitActiveSec=2min instead of 30s.

Five units enabled+started in dependency order, all active, dashboard returning real data on port 7878 (1,175 closed positions, +$1,305.75 realized, 6 strategies tracked):
1. ap3x-wal-checkpoint.timer
2. ap3x-signals.service (data-ops gates passed, listening on 127.0.0.1:8787, paperStrategies=baseline-telegram-primary-w8-h189-top10-v1 + 4 loop variants)
3. paper-pnl-dashboard.service (port 7878)
4. pumpfun-paper-engine.timer (every 30s; first fire closed 2 stale positions cleanly)
5. pumpfun-strategy-loop.timer (every 15min; first manual fire passed gates)

Latent risk: pumpfun-strategy-loop OOMed on its last May 7 run (exit 134, V8 fatal OOM in journal). Should be watched on next 15-min cycle.

Not resumed (user did not request): ap3x-pnl-cards.service, evolution-dashboard.service, ap3x-wallet-refresh.timer, ap3x-cerebro-cycle.timer, all pump-data-* discovery/enrichment timers.

Plan A managed archive copy still verified at /home/cerebro/backups/data-ops/managed-archive/2026-05-08-approved-archive-candidates (~14.16 GB). Source paths are now gone — the managed archive is the only remaining copy of the cold history.