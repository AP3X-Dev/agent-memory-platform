---
id: VGN7psquhUtRt8oW9tyso
session_id: test-audit-2026-04-09
agent_id: mcp
task: [project:amp] Full test suite audit across all packages
outcome: approved
created_at: "2026-04-09T09:09:28.744Z"
---

[project:amp] Test suite audit completed 2026-04-09. Key findings:

1. FAILING TESTS (2 total):
- packages/core/src/__tests__/promotion.test.ts: "applies decay to stale promoted nodes" — test expects old flat 5% decay (0.3 * 0.95 = 0.285) but temporal.ts was refactored to exponential decay (0.3 * 2^(-7/90) = 0.28425). Test needs updating to match new decay model.
- packages/oni/src/__tests__/store.regression.test.ts: BUG-0004 regression — put() still passes application key instead of Neo4j node ID to updateSemantic. Either the fix was never applied or it re-regressed. oni package is NOT in workspaces config so this failure is invisible to `npm test`.

2. ZERO TEST PACKAGES: wiki (0 test files, 8 source modules untested).

3. FLAKY BEHAVIOR: research package research-integration.test.ts — 9 tests use describe.runIf(NEO4J_AVAILABLE) which probes Neo4j at module load. Run 1 had 9 passing, Run 2 had 9 skipped. Neo4j availability on Cerebro is intermittent.

4. ONI PACKAGE NOT IN WORKSPACES: Has 66 tests (65 pass, 1 fail) but excluded from npm test. This is a blind spot.

5. SLOWEST TEST: packages/oni bridge.test.ts "continues loop on consume error and retries" at ~1.2s (retry/timeout test). All other tests under 500ms.

6. SKIPPED TESTS: 3 embedding tests in core skip when OPENAI_API_KEY not set. All neo4j package tests skip actual DB operations when Neo4j unreachable (pass via mock fallback).

7. MAJOR COVERAGE GAPS: wiki (100% uncovered), research (7/8 modules unit-untested, only integration tests), code (6/8 untested), arch (3/6 untested), retrieval (4/8 untested).