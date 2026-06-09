---
id: 21UR0CyIYXzUC2V7305Gt
session_id: session-20260503-121500
agent_id: mcp
task: [project:ap3x-signals] Full retirement of gmgn-wallet-tracker dependency.
outcome: approved
created_at: "2026-05-03T16:17:57.385Z"
---

[project:ap3x-signals] Completed full retirement of gmgn-wallet-tracker dependency on 2026-05-03. Three follow-ups landed:

1. PNL service repointed: ap3x-pnl-cards.service unit reinstalled from ops/systemd/ap3x-pnl-cards.service. Now runs from /home/cerebro/projects/ap3x-signals/PNL (.venv-py) instead of the external repo. Smoke-test rendered 2.5 MB PNG, HTTP 200 probe confirmed.

2. WAL checkpoint timer swapped: gmgn-wal-checkpoint.timer disabled and unit deleted; ap3x-wal-checkpoint.timer (5-min cadence) installed and active. First fire cleared 21 MB WAL → 0 bytes.

3. Legacy systemd cleanup: 7 unit files removed (/etc/systemd/system/gmgn-{tracker,milestones,wallet-scorer,wallet-refresh,wal-checkpoint}.{service,timer}). gmgn-cloudflared.service kept — name only, no path dependency.

4. Directories renamed (reversible, not deleted): /home/cerebro/projects/gmgn-wallet-tracker → gmgn-wallet-tracker.retired-20260503T161655Z; /home/cerebro/projects/ap3x-signals/legacy/gmgn-wallet-tracker → legacy/gmgn-wallet-tracker.retired-20260503T161655Z. Both preserved on disk in case rollback needed.

5. Doc comments cleaned up: src/cards/pnl-client.ts, src/output/telegram/html-formatter.test.ts, src/webhooks/helius-admin.ts no longer reference legacy paths. CLAUDE.md updated; entity 'gmgn-wallet-tracker legacy compatibility' removed; conventions section now mentions only the two leaf Python utilities (gmgn_scraper.py + PNL/api_server.py) under .venv-py. docs/cerebro-runbook.md updated.

Validation: typecheck clean; 433/433 tests pass; ap3x-signals/ap3x-pnl-cards/ap3x-wallet-refresh.timer/ap3x-wal-checkpoint.timer all active; PNL renderer responsive on :7000; live tracker.candidate logs continuing in journal.

ap3x-signals is now self-contained. Only Python code in the active runtime: scripts/gmgn_scraper.py and PNL/scripts/api_server.py — both standalone, no gmgn_tracker package import.