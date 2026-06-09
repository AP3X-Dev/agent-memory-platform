---
id: g9XrroSsqh_em9Xc_HVaL
session_id: session-20260419-004100
agent_id: mcp
task: [project:ap3x-solana] T46: WatcherStrategy + wallets.ts for examples/spl-watcher
outcome: approved
created_at: "2026-04-20T07:42:28.362Z"
---

[project:ap3x-solana] T46 implemented WatcherStrategy and parseWalletFlags for examples/spl-watcher. WatcherStrategy extends Strategy from @ap3x/solana-strategy, filters on SPL_TOKEN_PROGRAM_ID + kind spl.transfer, emits JSON when watched dest seen. Injectable emitter for testability; BigInt() coercion handles number|bigint|string amount. parseWalletFlags parses --wallet <base58> and --wallet=<base58> forms with 32-44 char base58 validation. 19 tests total (10 watcher, 9 wallets), all passing. Committed 8daf076.