---
id: EzQkZPFVXoEEViT82WoSe
session_id: autonomous-prp-solana-2026-05-01
agent_id: mcp
task: [project:ap3x-signals] HTML formatter + PNL card parity work shipped, re-cutover.
outcome: approved
created_at: "2026-05-01T19:17:12.460Z"
---

[project:ap3x-signals] **Parity work landed 2026-05-01 12:15 MST.** Closes the visible-output gap between the Python tracker and the new TS tracker.

**Code changes (commit af3d71c on branch cutover-prep-202605011620):**
- `src/output/telegram/html-formatter.ts` — line-for-line port of `gmgn_tracker.messaging.formatter.{format_alert, format_milestone}`. Byte-parity goldens captured directly from the Python venv via `~/projects/gmgn-wallet-tracker/.venv/bin/python`. 15 new tests, all passing.
- `src/output/telegram/bot-api-client.ts` — multipart `sendPhoto` upload of raw PNG bytes, plus `sendPhoto` by URL. Telegram `parse_mode=HTML` on by default for the parity path.
- `src/cards/pnl-client.ts` — HTTP client for the existing Python PNL renderer (`PNL/scripts/api_server.py`). `buildCardPayload` mirrors `messaging.card_payload.build_card_payload`.
- `src/graph/milestone-tick.ts` — milestone post path: detect newly-crossed multiples, atomically claim via `milestones_hit`, render PNL card, sendPhoto with HTML caption. Cascade-down to whichever chats received the discovery (per Python parity).
- `src/db/schema.ts` + `src/db/sqlite.ts` — new alerts columns (token_symbol, token_name, image_url), new alert_features table, new milestones_hit table. Idempotent ALTER TABLE migration for existing DBs.
- `src/market/dexscreener.ts` — extended pair extraction: name, symbol, imageUrl, priceChangeH1, volumeH24, socials, websites.
- `src/graph/nodes/strategy-decide.ts` — assembles a `FormatContext` (wallets enriched with name+score from repo, features view, basic risk warnings) on every alert; strategy uses HTML formatter when context is present.
- `src/graph/risk-warnings.ts` — derives risk-flag strings from safety verdict + LP + age.

**Out of scope for this slice (still null in formatter — render as 'n/a' or omit):**
- Holders count (would require Helius `getTokenAccounts` pagination to 3000)
- X-signals (whole subsystem in Python — separate Twitter API integration)
- DexScreener paid-presence (CTO/Boost/Profile/Ad/Trending — separate boost endpoint)

**Cerebro deployment changes:**
- `ap3x-pnl-cards.service` installed + enabled — runs the existing Python sidecar standalone on port 7000 so the cutover from gmgn-tracker doesn't kill it. ExecStart uses `~/projects/gmgn-wallet-tracker/.venv/bin/python ~/projects/gmgn-wallet-tracker/PNL/scripts/api_server.py --port 7000`.
- `.env` updated: `AP3X_PNL_API_URL=http://127.0.0.1:7000` so the new tracker calls the standalone renderer.
- Schema migration ran in-place against `/home/cerebro/projects/ap3x-signals/tracker.db`.
- Re-cutover sequence (Python tracker had been rolled back during port work): `sudo systemctl stop gmgn-tracker gmgn-milestones gmgn-wallet-scorer; sudo systemctl disable gmgn-wal-checkpoint.timer gmgn-wallet-refresh.timer; sudo systemctl start ap3x-signals`.

**Verified:**
- 365/365 tests pass on Cerebro after install (350 prior + 15 new formatter tests).
- ap3x-signals.service active, port 8787 bound, 934 wallets loaded.
- ap3x-pnl-cards.service active, port 7000 bound, `/api/health` 200.
- End-to-end render smoke test: `curl POST /api/render` returned a 2.4MB / 2836x2024 PNG.
- Old Python services stopped + timers disabled. Cloudflare tunnel still routing.

NPM publishes from earlier in the session unchanged: @ap3x/core@1.1.0, @ap3x/solana-{core,events,connectivity,signals,webhooks}@0.1.0/0.0.0 all live but ap3x-signals install posture stays workspace:* against sibling repos.