---
id: AKqAR8p1_Q_B_5FKHDssm
session_id: session-20260503-121500
agent_id: mcp
task: [project:ap3x-signals] Retire legacy gmgn tracker.db; ap3x-signals tracker.db is now single source of truth.
outcome: approved
created_at: "2026-05-03T15:44:11.042Z"
---

[project:ap3x-signals] Completed full legacy retirement on 2026-05-03. ap3x-signals/tracker.db is now the single source of truth: 2.5 GB, continuous time coverage 2026-04-24 → live. Imported 7.1M price_snapshots from legacy in a final pass (5.7 min). Repointed 7 strategy scripts (evolve-strategy, alpha-exploration, convergence-exit-exploration, strategy-pipeline, monte-carlo-t60-corrected, channel-structure-evolution, monte-carlo-evolved) and 2 data configs (channel-structure-evolution.json, channel-structure-evolution.fresh60.json) from legacy path to ap3x-signals path. Smoke-test with monte-carlo-evolved.ts confirmed end-to-end strategy backtest works against merged DB. PNL/scripts/api_server.py is a stateless Playwright renderer with no DB access — DB-independent, no migration needed. Renamed /home/cerebro/projects/gmgn-wallet-tracker/tracker.db → tracker.db.retired-20260503T154320Z (kept as cold storage, not deleted). Live ap3x-signals service is using the merged data not just for backtests but also for dedup against historical alerts (observed alert id 546 from legacy era being recognized as existing during webhook processing post-merge).

Open follow-ups (non-blocking): the gmgn-wallet-tracker/ directory still hosts vendored Python wallet-refresh code and the PNL renderer; full directory retirement waits on TS-native ports of those. migrate-wallets.ts has a leftover doc-comment reference to the legacy DB path — harmless example usage, not a code path.