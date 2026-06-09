---
id: _Sn_WVlA6BJfh8eGZbyho
session_id: scenario-replay-water-heater-2026-04-03
agent_id: mcp
task: [project:agent-assist-cr] SOP accuracy issues found during water heater scenario replay — fixes identified, pending implementation
outcome: revised
created_at: "2026-04-04T08:49:46.314Z"
---

[project:agent-assist-cr] Four SOP accuracy issues found during water heater scenario replay across 8 clients. Fixes designed but not yet implemented.

**Issue 1: False trade-level SNP (Blanton)** — sop_engine.py:854 does substring match `trade in t` against SNP trades list. Blanton has "Undermount Sinks - will only connect the plumbing" in SNP trades. "plumbing" substring matches → false SNP. Fix: normalize compound entries as items not trades in sop_normalizer.

**Issue 2: Geographic SNP firing without service area data** — LLM infers geographic mismatch from client address vs customer address. No ZIP code service area data exists yet. Fix: add prompt instruction to suppress geographic SNP until ZIP data is added. Only 2/8 clients fired this, inconsistently.

**Issue 3: False membership detection (Clark, Chatfield)** — Transcript says "service agreement" → pipeline marks as member. But Clark has member="Not Applicable" and Chatfield has member="Not Offered" in fee schedules. Fix: add membershipOffered boolean flag to normalized SOP + override membership_tier back to NON_MEMBER when false + surface agent alert.

**Issue 4: Bonsby over-firing unrelated SNP items** — LLM dumped 7 unrelated SNP items (oil systems, refrigeration, generators, etc.) for a water heater call. Fix: strengthen prompt to only surface SNP items relevant to the service being requested.

**Recommended fix priority**: Geographic SNP prompt fix (quick) → SNP prompt tightening (quick) → trade SNP normalizer fix (medium) → membership flag (medium). All fixes deferred pending user decision.