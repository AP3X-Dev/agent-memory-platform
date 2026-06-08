---
id: IRo-3CFdf_VxYeCPrX1Rf
session_id: session-20260415-uiparity-6
agent_id: mcp
task: [project:agent-assist-cr] UI parity session 6: C-2 code-level audit + Block H scoping
outcome: approved
created_at: "2026-04-15T19:21:08.133Z"
---

[project:agent-assist-cr] Session 6 of ui-parity loop. Closed C-2's autonomous-completable half (code-level Call SOP tab parity audit) and scoped a new Block H (inline-style refactor).

**C-2 method and finding:** Diffed `_renderCallSop` body (220 vs 220 lines) — only 1 diff line, the intentional `_cpDisplay` adapter swap. Diffed `_renderSNPGrid` body (21 vs 34 lines) — one delta block: v2 `{service, exception}` dict handling. Real defect: `_renderSNPGrid` retained a plain-string fallback for SNP items. v2 SNP items are always dicts in shipping data; the string branch was dead. Tightened to v2-only access (`item.service || item.value || ''` directly, no typeof check). Pattern matches Session 5's removal of v1 fallbacks in `_computeHoursStatus`.

**Block H new (concrete, autonomous-completable, high-leverage):** Inventoried 126 inline `style=""` blocks in `sop-panel.js`. Top 4 patterns account for ~30 occurrences. Proposed two-phase refactor: Phase 1 extracts top 6 patterns to utility classes (`.sop-cell`, `.sop-cell-center`, `.sop-th`, `.sop-th-center`, `.sop-th-bold`, `.sop-cell-bg-white`) covering ~50% of inline usage; Phase 2 mops up remaining or accepts as one-off. Endgame: shrink residual count below ~20, then CSP can tighten from `'unsafe-inline'` back to `'self'` — closes the architectural debt opened in Session 0.

**G-1 pattern now broader.** Initially observed 1 flaky test in `test_call_sop_alert_driven_flow.py` (Session 2). Session 6 observed 2 different tests in the same file failing in full-suite, all 6 passing in isolation. Pattern is file-scope test-ordering-sensitive flakiness — almost certainly a state leak between tests in that file. Reproducible enough to triage on the backend loop.

**Convention validated:** when tightening renderer code by removing v1 fallbacks, look for the pattern `(item && typeof item === 'object') ? <v2-path> : <v1-path>`. Three sessions in a row (4, 5, 6) found and removed a fallback like this. The remaining `_ciDisplay` typeof checks for addresses/phoneNumbers (Session 0 work) are intentional — those v2 fields legitimately accept strings or objects per the schema. Adapter-level tolerance is fine; render-loop fallbacks are dead code.

**Loop trajectory observation:** 7 of 14 items completed in 6 sessions. Block A + Block B closed; Block C halfway done at code-level (C-1, C-2 audited and tightened, C-3 next; visual smoke deferred to user-at-screen). The autonomous loop is now hitting a natural inflection: remaining work splits into "trivial code deltas + Mode B inventory" (C-3) vs "real meaty refactor with measurable downstream impact" (H-1). Strong recommendation to pivot to H-1 after C-3.