---
id: ziDFLJJ4RGHJVHCFMlUrz
session_id: session-20260419-030200
agent_id: mcp
task: [project:chad-gpt] Live endpoint smoke test of @ap3x/pump-gateway v0.1.0 against real upstreams
outcome: approved
created_at: "2026-04-19T10:08:50.598Z"
---

[project:chad-gpt] Ran live-upstream smoke test of @ap3x/pump-gateway v0.1.0 on a standalone Fastify server (port 8787, no chat-core, no backend). Our gateway code is correct; upstream drift is severe.

Findings:

1) pump.fun FEED LISTINGS (`/coins/for-you|new|graduated|runners|dex-new`) — BROKEN. Cloudflare returns HTTP 200 with zero-byte body + no content-type when called with our current BROWSER_HEADERS. `res.json()` throws → our router correctly wraps as 502 upstream_unavailable. This is silent bot-gating, not a shape change.

2) pump.fun TOKEN DETAIL (`/coins/<mint>`) — WORKING. USDC mint returns full JSON (1365 bytes). Enrichment pipeline (DexScreener + cached Jupiter?) populates priceUsd, liquidityUsd, volume24hUsd, priceChange24hPct, dexUrl. First request succeeded end-to-end with status 200.

3) DexScreener (`https://api.dexscreener.com/latest/dex/tokens/<mint>`) — WORKING. 200 with well-formed pair data.

4) Jupiter price endpoint (`https://price.jup.ag/v6/price`) — DEAD. Host does not resolve (DNS NXDOMAIN). Jupiter retired this endpoint. `lite-api.jup.ag` (trending) still works. Needs migration to lite-api (probably `/price/v2` or equivalent).

5) Circuit breaker in @ap3x/chad-integrations HttpClient works as designed: after ~5 pump.fun feed failures it opened; subsequent token fetches that would have succeeded now fail fast with "pumpfun circuit breaker is open". Good defensive posture.

6) Our gateway's wire surface is solid: /health 200; validation 400s (limit range, sortBy enum, short mint); upstream failure 502 containment; fastify default 404 for unknown routes; SDK PumpGatewayClient round-trips correctly.

Test suite status: 35/35 vitest tests still green (unit + mocked integration).

Dispositions for Phase 0 diagnostic:
- pump.fun feed listings: FIX-NOW or DEFER-PRP-2. Either need cf_clearance cookie handling, header tuning, or a pivot to an alternative feed source. Without this the product has no "scan new launches" flow — this is arguably the core product.
- Jupiter price: FIX-NOW. Trivial — migrate PumpFunClient enrichment from price.jup.ag to lite-api.jup.ag (or DexScreener for pricing). Dead DNS means every enrich call wastes an RTT.
- DexScreener: no action; contract stable.

Gateway code quality: ready to publish as-is. Upstream hazards are external to the package.