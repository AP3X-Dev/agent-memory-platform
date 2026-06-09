---
id: MLgxnWITKBUsmonD5DLGb
session_id: autonomous-prp-1-foundation-2026-04-18
agent_id: mcp
task: [project:chad-gpt] PRP-1 Slice 6 (Phase 0 diagnostic) complete — real upstream drift discovered + reconciled
outcome: approved
created_at: "2026-04-19T10:51:58.288Z"
---

[project:chad-gpt] Slice 6 complete. Tag slice-6-complete. 200 tests passing. Live diagnostic 11/11 PASS.

WHAT GOT BUILT:
- tools/diagnostics/ Phase 0 runner: 11 probes (8 live, 3 negative-confirmation for known-dead endpoints)
- Probes: types.ts (Verdict + ProbeResult), probes/http.ts (generic HTTP probe with shape + min-bytes validation), probes/registry.ts (the 11-probe array), report.ts (markdown + JSON), run.ts (CLI with --filter, --quiet, --check, --out flags)
- pnpm diag wired in root scripts. --check mode for CI gate.
- .github/workflows/nightly-smoke.yml: runs diagnostic at 09:17 UTC daily; opens 'upstream-drift' GitHub issue with full markdown report on regression
- docs/diagnostics/2026-04-19.md + .json — first live run, 11/11 PASS

REAL UPSTREAM DRIFT DISCOVERED + RECONCILED THIS SESSION:
1. price.jup.ag/v6/price — NXDOMAIN. JupiterClient pivoted to lite-api.jup.ag/tokens/v2/search with concurrency-capped (8) fan-out. Per-mint errors swallowed (best-effort). Backend e2e degradation test updated.
2. frontend-api-v3.pump.fun/coins/<feed> — Cloudflare-gated (200 + 0 bytes, header tuning didn't help). PumpFunClient pivoted to advanced-api-v2.pump.fun/coins/list (+ /graduated). Feed surface narrowed from 5 → 3 (for-you and dex-new dropped). pump-gateway gained AdvancedApiCoinSchema + normalizeAdvancedCoin to map the richer shape (with insider signals: sniperCount, topHoldersPercentage, twitterReuseCount) into canonical PumpFunCoinSchema.
3. token.jup.ag/all — NXDOMAIN. getTokenList() removed (only test referenced it; no replacement on lite-api).

DOCS:
- docs/upstream-endpoints.md captures verified working state for every external surface
- docs/diagnostics/<date>.md + .json — committed per run for git-history visibility

CI POSTURE:
- pnpm diag --check is the standalone gate
- Nightly workflow runs it at 09:17 UTC, fails on regression, opens issue
- 7 days from now: trend visible in commit history if drift persists

ADVISOR DECISIONS:
- D10: DESIGN_APPROVAL — accept Slice 6 (exceeded plan; real drift caught + reconciled in-flight)

NEW BACKLOG: none added. The followups doc from Slices 0-3 stays at its earlier state; the open Jupiter v6/price drift item from Slice 1 is now resolved by this slice.

NEXT: Slice 7 (parity runner). Compares old Python backend in .archive/backend-python (when archived in Slice 8) vs new Node backend on a fixed query set. Optional given the depth of e2e coverage we already have — but the plan calls for it as the documented quality gate before merging.