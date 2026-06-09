---
id: ZgQiyp7vpTcKWdBqNlT0z
session_id: session-20260420-prp02-close-and-pick-next
agent_id: mcp
task: [project:ap3x-solana] Record user preference on test authoring approach
outcome: approved
created_at: "2026-04-20T14:12:03.273Z"
---

[project:ap3x-solana] User preference (stated 2026-04-20 during PRP-02 close-out): avoid mocking in tests — prefer real on-chain data / captured fixtures over synthetic test inputs. **Why:** real data catches encoding drift, protocol edge cases, and fixture-shape mismatches that synthetic inputs paper over (the Phase A `signal-queue.test.ts` regression — PublicKey where string was expected — would've been caught earlier by a real-signal pipeline). **How to apply:** when writing new tests in PRP-03+, reach for captured fixtures (like `tests/fixtures/cold-start-tx-history.jsonl.gz` or `signals-spl-watcher.jsonl.gz`) before hand-constructed objects; if a unit test *genuinely* can't use real data (e.g., queue-capacity overflow behavior), call that out explicitly and keep the synthetic surface minimal. Applies to both integration and unit tests — don't reach for mocks as the default.