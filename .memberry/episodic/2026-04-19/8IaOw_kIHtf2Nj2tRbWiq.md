---
id: 8IaOw_kIHtf2Nj2tRbWiq
session_id: session-20260419-030200
agent_id: mcp
task: [project:chad-gpt] pump-gateway migrated to advanced-api-v2 + lite-api.jup.ag, all endpoints verified live
outcome: approved
created_at: "2026-04-19T10:42:32.930Z"
---

[project:chad-gpt] Completed full upstream migration for @ap3x/pump-gateway v0.1.0. PumpFunClient rewrote against advanced-api-v2.pump.fun (/coins/list + /coins/graduated) with an AdvancedApiCoin→PumpFunCoin normalizer in types/coins.ts. Insider-detection signals (sniperCount, bondingCurveProgress, twitterReuseCount, holders[]) pass through via .catchall. getCoin(mint) stays on frontend-api-v3 (still works, cleanest single-token detail source). JupiterClient.getPrices migrated from dead price.jup.ag/v6/price to lite-api.jup.ag/tokens/v2/search with parallel per-mint fan-out (concurrency 8). FEED_NAMES reduced from 5 to 3 (dropped for-you and dex-new — no working upstream). Router serves 404 on dropped paths instead of 502. Live smoke test: /new 200 (29KB), /runners 200 (32KB), /graduated 200 (34KB), /token/USDC 200 (1.6KB), all 400/404 paths correct. Test suites: pump-gateway 37/37 green, chad-integrations 47/47 green, both typecheck clean. Non-obvious zod fix: graduationDate is a number (ms timestamp) in live data, not a string as the Pump.fun docs suggested — schema uses z.union([z.string(), z.number()]).