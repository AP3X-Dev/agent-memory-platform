---
id: tBkWMRSQfdI1mpbUK6y0d
session_id: session-20260415-uiparity-5
agent_id: mcp
task: [project:agent-assist-cr] UI parity session 5: C-1 code-level audit + renderer v1-fallback purge confirmed
outcome: approved
created_at: "2026-04-15T19:14:48.529Z"
---

[project:agent-assist-cr] Session 5 completed C-1's autonomous-completable half (code-level Chat tab parity audit) and confirmed the renderer-wide v1-fallback purge is complete.

**C-1 method:** Carved the UC (Unified Chat) region from both old and new sop-panel.js (456 vs 463 lines). Diff totalled 33 lines, all in three buckets: (1) `_computeHoursStatus` v2 timeZone object handling (intentional), (2) `_computeHoursStatus` v2 `schedulingRules.rules[*].name` + `.hours` adaptation (intentional but with v1 fallbacks still present), (3) `_ucRenderStatusBar` using `_cpDisplay` adapter (intentional).

**Real defect found and fixed:** `_computeHoursStatus` retained two v1 fallbacks: `(r.name || r.type)` and `_formatHours(r.hours) || regular.schedule`. Both removed. Also simplified the timezone derefence — v2 timeZone is always an object, so the typeof-check + bare-string fallback path was dead code.

**Mode B milestone:** Grepped entire renderer for v1-fallback patterns. Four matches all turned out to be legitimate v2 patterns (adapter output field names that happen to share v1 names; real v2 `specialInstructions` in escalation entries; A-3's tolerant ZIP-entry field alias). **Zero actual v1 fallbacks remain in the renderer.** This converts the loop's "v2 only, zero v1 fallbacks" rule from aspiration to verified invariant.

**Convention learned for future sessions:** the renderer's interactive Chat-tab code (UC functions: _ucAddLine, _ucAddRichLine, _ucRenderContextLines, UC_PILL_CONFIG, UC_SECTION_ORDER, etc.) is byte-identical between old and new. Renderer drift is concentrated in v2 schema adapters and safeCard wrapping, NOT in interactive behavior. This means future Chat-tab parity questions almost always have backend-side answers (alert payload shape, polling cadence) — save grep-time on the UC functions.

**Loop trajectory:** 6 of 13 items completed in 5 sessions. Remaining: 3 user-or-backend-owned (D-1, F-1, G-1), 2 backend-blocked (E-1, E-2), 2 visual smoke-tests (C-2, C-3). Autonomous-completable high-yield work is essentially done.

**Recommendation for future loop pivot (when Block C is exhausted in code-level form):** the noted but unowned cleanup is "extract inline styles to CSS classes" — would let CSP tighten back from `'unsafe-inline'` to `'self'`. Concrete, measurable, autonomous-completable. Block H candidate.