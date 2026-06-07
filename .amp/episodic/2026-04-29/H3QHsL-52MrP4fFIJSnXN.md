---
id: H3QHsL-52MrP4fFIJSnXN
session_id: autonomous-prp-solana-2026-04-29
agent_id: mcp
task: [project:ap3x-solana] Resolved PRP-SOLANA open questions via advisor sub-agent.
outcome: approved
created_at: "2026-04-29T20:41:51.246Z"
---

[project:ap3x-solana] Three open questions resolved before implementation start:

1. Helius webhook fixtures EXIST at C:\Users\Guerr\Downloads\GMGN_Wallet_Tracker_Package\tests\fixtures\helius\ (8 named: swap_buy, sell, jupiter_swap, pumpfun_buy, transfer, token_mint_buy, buy_with_dust_rebate, failed) plus 4 batch fixtures at tests/fixtures/ (helius_webhook_batch.json, helius_webhook_multi_wallet_swap.json, helius_webhook_swap_buy.json, helius_webhook_swap_non_buy.json). Need to copy into packages/solana-webhooks/tests/fixtures/. HMAC-failure / oversized / replay fixtures are trivial to derive from any captured payload + bad header / pad / duplicate-id.

2. HMAC verification format: Authorization header = raw shared secret, constant-time compared. Confirmed by reading the Python tracker at GMGN_Wallet_Tracker_Package/src/gmgn_tracker/webhooks/server.py:67-70 which uses `hmac.compare_digest(request.headers.get("Authorization",""), expected_secret)`. NOT HMAC-of-body. TS implementation: `crypto.timingSafeEqual(Buffer.from(req.headers.authorization ?? ''), Buffer.from(expectedSecret))` after length-padding (timingSafeEqual throws on length mismatch). Keep WebhookDriver.verifyRequest generic enough that a future driver can implement HMAC-of-body without contract change.

3. Python parser EXISTS at C:\Users\Guerr\Downloads\GMGN_Wallet_Tracker_Package\src\gmgn_tracker\helius\parser.py. NARROW SCOPE: it only emits Buy classifications, not sells/transfers. Gate #1 (≥95% byte-for-byte parity) must be scoped to the Buy-classification surface; sells/transfers/UnknownEventDecode are tested via semantic equivalence (canonical-fixture key-field match) since the Python tracker doesn't emit them. Companion logic at gmgn_tracker/webhooks/ingestion.py.