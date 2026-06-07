---
id: 324LYFYxHteVgBHY2pD7V
session_id: session-20260512-081700
agent_id: mcp
task: [project:oni-grid] optimization session 15: Item #14 named tunables for cost tracker and agent detector
outcome: approved
created_at: "2026-05-12T15:20:33.976Z"
---

[project:oni-grid] Session 15 in `fa70376`. Named and documented tunables across costTracker + agentDetector.

Key conventions established:
- **defensive-copy contract for shared config objects.** `getConfig()` previously returned `{ ...this.config }` — fine for scalars, broken for the `alertThresholds` array. Refactored into `cloneBudgetConfig` (deep-copies the array) used at `getConfig`. `mergeBudgetConfig` does the same on the way in (constructor + updateConfig). Mutating a value returned from getConfig now cannot mutate the tracker's internal state. Test pins this with a mutation attempt followed by a re-fetch.
- **Object.freeze on module-level default arrays.** `DEFAULT_ALERT_THRESHOLDS = Object.freeze([50, 75, 90, 100])` is belt-and-suspenders defense at module scope; the actual runtime protection is the `[...DEFAULT_ALERT_THRESHOLDS]` spread inside the factory. Both together = no direct module-level mutation and no leaked references from instances.
- **No second config API.** The optimizer prompt cautions against backwards-compat shims. costTracker already had a Partial<BudgetConfig> constructor override; this fix tightened the existing path rather than adding a parallel `setBurnRateWindowMs()` method. Same applies to agentDetector — no new options object; just exposed the existing magic numbers as constants so a future tuning pass can edit them in one place.
- **policy vs. mechanism boundary made visible.** agentDetector's computeConfidence formula is the mechanism (length-weighted specificity + priority-tier boost, capped); the five numbers are the policy. Inline they blurred together; as named exports the boundary is explicit. Same idea on the burn-rate trend thresholds (1.1 / 0.9) — the dead-band is a tuning decision, not part of the trend algorithm.
- **Test for cap reachability invariant.** `100 * CONFIDENCE_PRIORITY_BOOST_PER_UNIT === CONFIDENCE_PRIORITY_BOOST_CAP` catches a typo like changing per-unit to 0.002 without simultaneously changing the cap. The math should always be self-consistent with the max-priority-tier.

Cumulative session count this round: 11 → 15 (5 sessions). Backlog: 15/30 complete + 3 discovery items. Suite at TS 1496/1496 across the loop's run, all checks green throughout.

Next: Item #15 (Rust tests for pty.rs — lifecycle + cleanup). Item #30 sub-tasks #30a/b/c remain.