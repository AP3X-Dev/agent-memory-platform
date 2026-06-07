---
id: hkd4gCh4GlII0Qd5Ehw7x
session_id: session-20260503-121500
agent_id: mcp
task: [project:ap3x-signals] Port wallet-refresh from Python to TS-native (scrape stays Python).
outcome: approved
created_at: "2026-05-03T16:08:10.137Z"
---

[project:ap3x-signals] Wallet refresh ported on 2026-05-03. Hybrid approach: scraper stays in Python (gmgn.ai is Cloudflare-protected and needs Playwright + stealth — confirmed plain HTTP returns 403 from the trade page), everything else is TS.

Files: scripts/gmgn_scraper.py (standalone, no gmgn_tracker package import); src/wallets/scoring.ts (+ test, port of Python scoring.py with percentile-rank + tier cutoffs); src/webhooks/helius-admin.ts (+ test, list/get/updateWebhookAddresses); src/webhooks/sync-addresses.ts (+ test, computeDiff + syncWebhookAddresses); scripts/wallet-refresh.ts (CLI orchestrator that spawns Python scraper, parses stdout, upserts via repo, syncs Helius). Repo gets new upsertScrapedWallet (preserves pinned + alpha_score on conflict, unlike upsertWallet which clobbers them) and getAppState.

Systemd: ap3x-wallet-refresh.service rewritten to call `pnpm tsx scripts/wallet-refresh.ts` from /home/cerebro/projects/ap3x-signals; reads .env from repo root (not legacy/.env); installed; smoke-fired clean (552 wallets, S=27/A=55/B=83/C=111/D=276, webhook +17 -6 total=334). Legacy gmgn-wallet-refresh.timer disabled. New ap3x-wallet-refresh.timer enabled (next fire 06:00 UTC daily).

Recovery footnote: app_state.helius_webhook_id was missing from the merged tracker.db (we intentionally skipped app_state during the May-3 legacy merge). Restored value `94936c97-322c-448f-9dea-530a97983376` from the retired legacy DB. Without that key, the Helius sync step exits with "no helius_webhook_id in app_state".

Open follow-ups (non-blocking): legacy/gmgn-wallet-tracker/ vendored Python package is now orphaned (no live caller); gmgn-wal-checkpoint.timer still uses the legacy ops path and could swap to ap3x-wal-checkpoint.timer; ~/projects/gmgn-wallet-tracker/ external repo no longer referenced by any active unit.