---
id: 93F6piFSthP2qEC-hWSIR
session_id: autonomous-prp-0.5a-2026-04-20
agent_id: mcp
task: [project:ap3x-core] Autonomous execution of PRP-0.5a — design phase decisions
outcome: approved
created_at: "2026-04-20T14:18:11.196Z"
---

[project:ap3x-core] Autonomous advisor resolved eight design decisions for PRP-0.5a runtime primitives. Human pre-approved Q1 (engine strategy = lightweight fast-path, not Pregel wrapper).

Advisor decisions:
- D1 Interceptor chain = C (coexist with bridge). New canonical InterceptorChain with thin adapters from the existing BudgetTracker/AuditLog/filters/permissions/HooksEngine. Avoids 2-week guardrail rewrite while still giving one middleware surface.
- D2 Deadline placement = A (extend AP3XConfig.deadline + derive in RunContext). One new optional field, mirrors existing signal? pattern, free functions withDeadline/getDeadline/remainingMs read RunContext via ALS.
- D3 Result<T> adoption = B (adapt at boundary). Interceptor chain wraps every tool call and coerces bare returns/throws into Result envelopes. ToolDefinition.execute stays bare-value. Keeps v1 tests passing unchanged (criterion 8).
- D4 Policy enforcement = A (runtime-only). Policy-as-type is a TS DSL + mandatory auto-prepended policyInterceptor. No branded phantom types — the static analyzer is a runtime config scan, not compile-time.
- D5 StreamingGraph lifecycle = B (minimum: start/stop/metrics). Skip pause/resume in v0.5a; kill-switch covers halt-now. Pause tangles with backpressure + cleanup deadline semantics.
- D6 KillSwitch scoping = B (module-level Map global + scoped()). Matches PRP text verbatim. Edge-runtime caveat documented (per-isolate scoping). 
- D7 Benchmark gating = A (benchmarks/ with perf_hooks, non-blocking → blocking after baseline stabilizes). Coverage (vitest --coverage) hard gate from day 1 at 85%.
- D8 Examples: streaming-agent (log-line moderation with 20k burst + drop-oldest), deadline-slo (customer support 300ms hard deadline), policy-enforced-tool (db_write tier-gated with thesis + budget + audit).

All six new primitives ship as new subpath exports. Package version bump 1.0.0 → 1.1.0 (additive minor). No breaking changes to v1.

Design spec at docs/superpowers/specs/2026-04-20-prp-0.5a-runtime-primitives-design.md, 11 sections, self-review passed. Module dependency graph: result, deadline (leaf) → interceptors → policy, kill-switch → streaming-graph (consumes all).