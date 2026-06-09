---
id: 90F9KPurOdQhhl26PsLx0
session_id: session-20260419-030200
agent_id: mcp
task: [project:chad-gpt] Discovery: working pump.fun endpoints from legacy AP3X-PumP project
outcome: approved
created_at: "2026-04-19T10:21:11.064Z"
---

[project:chad-gpt] Verified working pump.fun alternatives while testing a user-supplied Supabase fallback (class from `AP3X-pump-tokens` project).

1. Supabase fallback class — DEAD. Project ref `tmbhwnnmqbvavtfleidy.supabase.co` returns NXDOMAIN from Google, Cloudflare, and Cisco resolvers. Anon JWT in the source decodes valid (iat=2025-08-08, exp=2035) but the project itself has been deleted. Not usable.

2. pump.fun `advanced-api-v2.pump.fun` — WORKING. Not currently in our client. Discovered in `C:/Users/Guerr/Desktop/AP3X-PumP/pump-scanner-api.js` (legacy Chad GPT implementation). Responds to:
   - `/coins/list?sortBy={creationTime|marketCap|volume|lastTradeAt}&limit=&offset=` — 200 with rich data (~15-75KB/3 coins)
   - `/coins/graduated?limit=&offset=` — 200, rich data
   Does NOT respond to: `/coins/for-you`, `/coins/new`, `/coins/runners`, `/coins/featured` (404). Those are frontend-api-v3-only routes.

3. advanced-api-v2 schema is RICHER than frontend-api-v3. New fields we don't currently use:
   - `coinMint`, `ticker`, `currentMarketPrice`, `bondingCurveProgress` (pre-computed!), `allTimeHighMarketCap`, `graduationDate`, `poolAddress`
   - Insider-detection signals: `sniperCount`, `numKolsTraded`, `devHoldingsPercentage`, `topHoldersPercentage`, `twitterReuseCount`, `holders[]` with `isSniper` flags per holder
   - Social: `hasTwitter`, `hasTelegram`, `hasWebsite`, `twitter`, `telegram`, `website`
   - Transaction flow: `buyTransactions`, `sellTransactions`, `transactions`

4. Jupiter — `lite-api.jup.ag/tokens/v2/search?query=<mint>` WORKS. Returns array of matching tokens w/ id=mint, name, symbol, icon, decimals, twitter, website, dev, circSupply. This replaces the dead `price.jup.ag/v6/price` host.

5. Enhanced header set (discovered in AP3X-PumP): adding Origin: https://pump.fun + Sec-Ch-Ua + Sec-Fetch-* did NOT fix the CF-gating on frontend-api-v3 feed listings (still 200 empty body). Header tuning is a dead end for that surface — advanced-api-v2 is the real fix.

Feed mapping for our @ap3x/pump-gateway v0.1.0:
- `new` → advanced-api-v2 `/coins/list?sortBy=creationTime`
- `runners` → advanced-api-v2 `/coins/list?sortBy=volume`  (volume leaders = hot runners)
- `graduated` → advanced-api-v2 `/coins/graduated`
- `for-you` → STILL BROKEN (frontend-api-v3 only, CF-gated). Needs alternate source or skip in v0.1.
- `dex-new` → STILL BROKEN (frontend-api-v3 only). Same story.

Recommendation: migrate PumpFunClient to advanced-api-v2 for the 3 feeds that map cleanly, and either drop or find alternative source for for-you + dex-new. Also migrate JupiterClient price lookup to lite-api search endpoint.