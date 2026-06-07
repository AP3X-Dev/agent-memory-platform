---
id: ZeqHK4BRAt2loNKXlyEXl
session_id: scenario-replay-water-heater-2026-04-03
agent_id: mcp
task: [project:agent-assist-cr] Designed optimized SOP template for client self-service intake form
outcome: approved
created_at: "2026-04-04T08:54:08.463Z"
---

[project:agent-assist-cr] Created SOP template (sop_template.json) and example (sop_template_example.json) in src/data/. Template is designed for an inline client intake form that produces JSON the pipeline consumes directly.

**Key design changes from current SOPs that fix the issues found:**

1. **tradesOffered field (new)** — Clients select which trades they provide from a controlled list [HVAC, Plumbing, Electrical, Drains, Generator]. SNP trades are auto-derived as the inverse (everything NOT selected). This eliminates the false SNP bug where compound descriptions like "Undermount Sinks - will only connect the plumbing" caused substring match false positives.

2. **membershipProgram.offered boolean (new)** — Explicit yes/no for whether membership exists. Fixes the Clark/Chatfield false membership issue. When false, pipeline should override membership_tier to NON_MEMBER regardless of transcript signals.

3. **Controlled vocabularies** — Fee service types locked to ["Regular Hour", "After Hours", "Tune Ups", "Estimates"]. Schedule rule types locked to standard set. These are the exact strings the pipeline does matching on.

4. **SNP items separated from trades** — servicesNotProvided.items is a free-text list for specific exclusions. Trade-level SNP is derived from tradesOffered, not manually entered. No more ambiguous compound entries.

5. **No service area / geographic data yet** — Template is ready for future serviceArea/zipCodes field but doesn't include it. Geographic SNP should remain suppressed until this data exists.

6. **Template uses $type annotations** — Each field annotated with form control type (select, multiselect, boolean, textarea, list, repeater, tags, text) for rendering the intake form.