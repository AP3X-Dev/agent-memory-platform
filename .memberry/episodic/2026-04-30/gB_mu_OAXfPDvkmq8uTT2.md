---
id: gB_mu_OAXfPDvkmq8uTT2
session_id: session-20260430-cross-token-overlap
agent_id: mcp
task: [project:cerebro] Cross-token early-trader overlap: BONK / JTO / JUP
outcome: approved
created_at: "2026-04-30T12:02:11.146Z"
---

[project:cerebro] Ran early-trader overlap on BONK (DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263), JTO (jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL), JUP (JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN). Key finding: for airdrop-launched tokens, mint creation date is meaningfully earlier than public launch date — so the first-7-day "early" window captures only internal team/multisig operations, not public DEX traders. BONK mint Dec 8 2022, airdrop Dec 25 (17 days late). JTO mint Nov 27 2023, airdrop Dec 7 (10 days late). JUP mint Jan 25 2024, airdrop Jan 31 (6 days — only JUP falls partly within window). Deployers are all separate teams. Zero wallet overlap found across any pair of tokens in sampled mint-address transaction history. Real early-DEX-trader overlap requires querying AMM pool addresses (Raydium/Orca pools for each token), not the mint account. getTokenHolders returned unrealistically tiny balances (top BONK holder 34M, top JTO 100, top JUP 286) — this endpoint samples a limited DAS subset, not true top holders. getSignaturesForAsset does not work for fungible SPL tokens.