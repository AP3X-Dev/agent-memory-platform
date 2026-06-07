---
id: mr7mC9__p9mkwdv19nVf0
session_id: autonomous-prp-solana-2026-05-01
agent_id: mcp
task: [project:ap3x-signals] AP3X Signals cutover — TS rebuild replaces Python gmgn-tracker on Cerebro.
outcome: approved
created_at: "2026-05-01T18:36:37.265Z"
---

[project:ap3x-signals] **Cutover executed 2026-05-01 11:35 MST.** The Python gmgn-tracker is replaced by ap3x-signals on Cerebro.

State at cutover:
- Branch: cutover-prep-202605011620, HEAD includes 2 fix commits beyond the WIP markers (test threshold alignment + @types/node devDep + migrate-wallets script).
- Production thresholds locked in YAML packs: PRIMARY = 3+ S/A/B wallets, PREMIUM = 10+, ELITE disabled at fire time (tier_s_count_min: 999) — ELITE upgrades come from MilestoneTicker on price-multiple, not convergence.
- 350/350 tests passing locally and on Cerebro. Typecheck clean.

Cerebro deployment:
- ~/projects/AP3X-Solana cloned + built (workspace siblings).
- ~/projects/ap3x-core cloned + built.
- ~/projects/ap3x-signals installed.
- ~/projects/ap3x-signals/tracker.db: 934 wallets migrated from gmgn-wallet-tracker/tracker.db (S=40, A=121, B=164, C=248, D=361 — 53 pinned).
- /etc/systemd/system/ap3x-signals.service installed (Type=simple, EnvironmentFile=/home/cerebro/projects/ap3x-signals/.env, ExecStart=/usr/bin/pnpm run-tracker).
- .env at ~/projects/ap3x-signals/.env, mode 600, includes all 934 addresses in AP3X_TRACKED_WALLETS, secrets sourced from old .env.

Cutover sequence:
- sudo systemctl stop gmgn-tracker gmgn-milestones gmgn-wallet-scorer
- sudo systemctl disable gmgn-wal-checkpoint.timer gmgn-wallet-refresh.timer
- sudo systemctl start ap3x-signals
- Result: active (running), bound to 127.0.0.1:8787, all 934 wallets loaded, snapshots=dexscreener, client=bot-api.

Cloudflare tunnel (gmgn-cloudflared.service, webhook.pumpscanner.fun → 127.0.0.1:8787) untouched — Helius keeps reaching the same URL, now answered by the new node process.

NPM publish posture: @ap3x packages published to registry as part of this cutover (per user request, reversed the earlier "no NPM publish" rule).
- @ap3x/core@1.1.0 (was 1.0.0)
- @ap3x/solana-core@0.1.0
- @ap3x/solana-events@0.1.0
- @ap3x/solana-connectivity@0.1.0
- @ap3x/solana-signals@0.0.0
- @ap3x/solana-webhooks@0.0.0
ap3x-signals.package.json kept on workspace:* — install on Cerebro continues to use sibling repos. Switching to npm-resolved deps remains a future option.

Old services left enabled (would start on reboot) for easy rollback during observation. After stable observation, user should: sudo systemctl disable gmgn-tracker gmgn-milestones gmgn-wallet-scorer.

Rollback procedure if needed:
- sudo systemctl stop ap3x-signals
- sudo systemctl start gmgn-tracker gmgn-milestones gmgn-wallet-scorer
- sudo systemctl enable gmgn-wal-checkpoint.timer gmgn-wallet-refresh.timer

Production-DB backup taken before cutover (per resume doc): ~/projects/gmgn-wallet-tracker/tracker.db.bak-pre-ap3x-cutover-20260501T161633Z (5.4 GB).