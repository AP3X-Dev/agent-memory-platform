---
id: AtES9F3ZJnkyChNCcfpws
session_id: autonomous-prp-solana-2026-04-29
agent_id: mcp
task: [project:ap3x-solana] HANDOFF for next session — read this first.
outcome: approved
created_at: "2026-04-30T11:48:12.138Z"
---

[project:ap3x-solana] **HANDOFF SUMMARY** — load this if you're starting a fresh session against AP3X-Solana.

Repo: github.com/AP3X-Dev/AP3X-Solana (public). Local: C:\Users\Guerr\Desktop\AP3X\AP3X-Solana\. PRP: C:\Users\Guerr\Desktop\AP3X\PRP-SOLANA.md (read first, do not redesign).

**Workflow rules (load-bearing):**
- Direct-to-main, no PRs — personal project, user pushes direct.
- No AI attribution: no Co-Authored-By, no "Claude/agent/AI/automated" in commits / branches / PR descriptions / shipped doc files. Natural developer voice everywhere.
- prep-github before any push: leak-scan tracked files for PRP-*, "gate item #N", "advisor", "superpowers", strip any leaks.
- Use autonomous-advisor sub-agent for open questions instead of asking the user.
- No NPM publish.

**Shipped on main across sessions 1+2 (do NOT re-do):**
- @ap3x/solana-signals: SignalProducer/Consumer/SignalBus contract layered additively on existing SignalSource/SignalQueue. wrapSource adapter. Signal.signalVersion optional. 54 tests.
- @ap3x/solana-webhooks (0.1 alpha): outbox-first HTTP receiver (HMAC + size cap + backpressure), SQLite + Postgres outboxes with cross-backend parity suite, drainer, healthz, Helius driver (verify + parseRawPayload + normalizeEvent + catchup + admin). Captured fixtures in tests/fixtures/. 122 tests.
- @ap3x/pumpfun-signals (0.1 alpha, interim): PumpfunSignals interface + SqlitePumpfunSignals reference impl with asOf enforcement (10k-query fuzz). 19 tests.
- CI: webhooks-postgres-tests matrix (PG 14/15/16).

**Decisions locked (don't re-litigate):**
- HMAC for Helius = raw shared secret in Authorization header, constant-time compared (per Python tracker source). Not HMAC-of-body.
- Helius envelope = JSON array. Per-tx idempotency key = `helius:<signature>`.
- Outbox stores per-tx parsed JSON, not the wire body.
- Repo posture mirrors AP3X-Dev/AP3X (public).
- Helius fixtures live at C:\Users\Guerr\Downloads\GMGN_Wallet_Tracker_Package\tests\fixtures\helius\ (8 named) + tests/fixtures/helius_webhook_*.json (4 batch).
- Python parser at C:\Users\Guerr\Downloads\GMGN_Wallet_Tracker_Package\src\gmgn_tracker\helius\parser.py — narrow scope (Buy classification only).

**Remaining for session 3 (in priority order):**
1. **Replay-parity test harness** (PRP gate item #1). Run Python parser + TS normalizer against the captured fixtures and assert ≥95% byte-for-byte parity on the BUY-classification surface; sells/transfers fall back to semantic equivalence since the Python parser doesn't classify them. Prefer subprocess invocation of Python over re-implementing in TS.
2. **examples/solana-watch --webhook mode** — ingest a captured payload via @ap3x/solana-webhooks, print typed events. Mirror existing Geyser mode.
3. **Roadmap touches**: amend roadmap/04-pumpfun-phase-2-signal-layer.md ("v0 sqlite signals shipped"), add roadmap entry for webhooks work, update roadmap/README.md.
4. **(Stretch) @ap3x/solana-vault heartbeat primitive** — only if < 100 LOC per PRP §5.
5. prep-github + push.

Start cmd: `cd C:\Users\Guerr\Desktop\AP3X\AP3X-Solana && git pull && pnpm install`.