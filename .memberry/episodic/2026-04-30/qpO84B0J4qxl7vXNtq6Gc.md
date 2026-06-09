---
id: qpO84B0J4qxl7vXNtq6Gc
session_id: autonomous-prp-solana-2026-04-29
agent_id: mcp
task: [project:ap3x-solana] Autonomous PRP-SOLANA session 2: Postgres outbox + parity, pumpfun-signals interim, Helius catchup + admin shipped to main.
outcome: approved
created_at: "2026-04-30T11:38:07.153Z"
---

[project:ap3x-solana] Session 2 shipped 3 commits to public main. Closes most of the deferred backlog from session 1.

Delivered:

1. PostgresOutbox backend + cross-backend parity suite. Same Outbox contract as SqliteOutbox; pg as optional peer + dynamic import. Optional schema namespace, poolSize, ssl. Schema is migration-managed at init() (CREATE SCHEMA / TABLE / partial INDEX). Parity suite (parity-suite.ts) runs the same 15-test behavioral suite against any Outbox factory. SQLite + Postgres both run it; Postgres test is env-gated via AP3X_PG_URL with per-test schema isolation. New CI job webhooks-postgres-tests runs the parity suite against PG 14/15/16 service containers.

2. @ap3x/pumpfun-signals interim package. PumpfunSignals interface (walletTier, convergenceState, milestoneEvents, safetyVerdict) with per-method signal_version pins. SqlitePumpfunSignals reference impl backs by a single solana_events table; asOf enforced at the SQL WHERE clause (observed_at <= asOf). Ingest API for buy/milestone/wallet-tier/safety-verdict events. 18 sqlite tests + a 10,000-iteration randomized asOf-enforcement fuzz (zero leaks; reproducible via AP3X_FUZZ_SEED). Storage backend is replaced in a later release per the README banner.

3. Helius catchup + admin sub-clients. HeliusCatchup implements WebhookCatchupClient via Helius's enhanced-tx REST API; reuses normalizeHeliusTx verbatim because the API returns the same parsed-tx shape webhooks deliver. HeliusAdmin implements WebhookAdminClient via Helius's webhook-management API; subscribeAddresses / removeAddresses / reconcile are read-modify-write on the accountAddresses list with pass-through preservation of unrelated config fields. createHeliusDriver gains optional catchup and admin config blocks; both are wired only when configured.

Test totals: 122 in solana-webhooks, 19 in pumpfun-signals (1 env-skipped). Typecheck clean across both packages. Workflow rules respected throughout: zero PRP/gate-item language in shipped artifacts, zero AI-attribution markers in commits, prep-github-style leak audit before push.

Deferred to session 3:
- examples/solana-watch --webhook mode (small, ancillary)
- Roadmap touches (amend roadmap/04 with the v0 sqlite-backed signals notice; add roadmap entry for the webhooks work)
- @ap3x/solana-vault heartbeat primitive (stretch)
- Replay parity test harness against the Python tracker's helius/parser.py (PRP gate criterion #1)

Live: github.com/AP3X-Dev/AP3X-Solana.