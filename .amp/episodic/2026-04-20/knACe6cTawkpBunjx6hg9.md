---
id: knACe6cTawkpBunjx6hg9
session_id: session-20260419-005300
agent_id: mcp
task: [project:ap3x-solana] T47 code review — spl-watcher CLI entry + e2e test (commit 8cc1238)
outcome: approved
created_at: "2026-04-20T07:54:18.620Z"
---

[project:ap3x-solana] T47 (commit 8cc1238) reviewed. Overall APPROVED with two Minor findings.

Finding 1 (Minor): examples/spl-watcher/src/index.ts line 65 has dead code. The check `if (arg === '--wallet') { i++; continue; }` is unreachable because line 63 already matches `arg === '--wallet'` and continues. Consequence: the value token after `--wallet <value>` is NOT skipped in the loop, but it silently falls through as an unknown flag (line 81), so runtime behavior is unaffected since parseWalletFlags handles wallet parsing independently.

Finding 2 (Minor): The T46 bugfix in watcher-strategy.ts (widening WatcherDecoded.dest to PublicKey | string + duck-typed toBase58 call) was NOT covered by new unit tests in watcher-strategy.test.ts. The string-dest branch is exercised only by the e2e test (fixture replay). Coverage report confirms 87.5% branch on line 36, with the string path uncovered in unit tests. Spec explicitly flagged this as a Minor concern.

All other checks passed: commit message exact match, no AI attribution, parseArgs correctly validates exactly-one source, buildDecoderRegistry correct shape, buildSource cleanly branched, Geyser throws with actionable TODO pointing B8/B10, main() correctly wires source→SignalQueue→StrategyRuntime→WatcherStrategy, awaits 'end', drains, stops. Stubs use as unknown as casts appropriately. Historical RpcPool uses single endpoint from --rpc URL. e2e beforeAll has stale-check optimization. e2e asserts 10 lines + correct JSON shape. run-historical.sh has set -euo pipefail + positional args. tsconfig includes tests/**/* and rootDir '.'. vitest.config includes both src/**/*.test.ts and tests/**/*.test.ts with all workspace aliases. Full monorepo 22 tests pass both runs (no flakiness). Typecheck clean.